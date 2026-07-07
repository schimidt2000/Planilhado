"""Parser for Banco Inter credit card statement PDFs.

The Inter PDF uses compressed text with no spaces between words.
Key characteristics:
- Page 3 contains the "Despesasdafatura" expenses section
- "DatadeVencimento" line followed by "DD/MM/YYYY" gives the billing month
- Transactions are in a table: Data | Movimentação | Beneficiário | Valor
- Date format in cells: "DD de mon. YYYY" (e.g. "01 de mar. 2026")
- Installments encoded as "(Parcela04de06)" in description
- Charges: MULTAPORATRASO, ROTATIVOSALDOFINANCIA, ENCARGOSROTATIVO, IOF, JUROSDEMORA
"""

import re
import pdfplumber
from io import BytesIO

MONTH_MAP_PT = {
    'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04',
    'mai': '05', 'jun': '06', 'jul': '07', 'ago': '08',
    'set': '09', 'out': '10', 'nov': '11', 'dez': '12',
    # Full names sometimes appear
    'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
    'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
    'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12',
}

CHARGE_KEYWORDS = {
    'MULTAPORATRASO', 'MULTA', 'ROTATIVOSALDOFINANCIA', 'ROTATIVO',
    'ENCARGOSROTATIVO', 'ENCARGO', 'IOF', 'JUROSDEMORA', 'JUROS', 'MORA',
    'FINANCIAMENTO',
}


def _is_charge(description):
    upper = re.sub(r'\s+', '', description).upper()
    for kw in CHARGE_KEYWORDS:
        if kw in upper:
            return True
    return False


def _parse_br_value(value_str):
    """Parse 'R$X.XXX,XX' → (cents, is_credit).
    Credits on Inter statements are sometimes represented as negative values
    or with a minus sign.
    """
    if not value_str:
        return 0, False
    is_credit = value_str.strip().startswith('-')
    clean = re.sub(r'[^0-9,]', '', value_str)
    clean = clean.replace(',', '.')
    try:
        cents = int(round(float(clean) * 100))
    except (ValueError, TypeError):
        cents = 0
    return cents, is_credit


def _parse_installment(text):
    """Parse '(Parcela04de06)' or 'Parcela 4 de 6' → (current, total)."""
    # Compact form: Parcela04de06
    m = re.search(r'[Pp]arcela\s*0*(\d+)\s*de\s*0*(\d+)', text)
    if m:
        return int(m.group(1)), int(m.group(2))
    return None, None


def _normalize_description(text):
    """Remove installment info from description."""
    text = re.sub(r'\(\s*[Pp]arcela\s*\d+\s*de\s*\d+\s*\)', '', text)
    text = re.sub(r'[Pp]arcela\s*\d+\s*de\s*\d+', '', text)
    return text.strip(' ()-')


def _parse_date_cell(date_str):
    """Parse date from cell text.

    Handles formats:
      "DD de mon. YYYY"  →  "YYYY-MM-DD"
      "DD/MM/YYYY"       →  "YYYY-MM-DD"
    """
    if not date_str:
        return None
    date_str = date_str.strip()

    # "DD de mon. YYYY" or "DDdemon.YYYY" (compressed)
    m = re.match(
        r'(\d{1,2})\s*de\s*([a-zA-Zçã.]+?)\.?\s*(\d{4})',
        date_str, re.IGNORECASE,
    )
    if m:
        day = m.group(1).zfill(2)
        mon_raw = m.group(3)  # wrong — groups: 1=day, 2=month_abbr, 3=year
        # Re-match properly
        day = m.group(1).zfill(2)
        mon_raw = m.group(2).lower().rstrip('.')
        year = m.group(3)
        mon = MONTH_MAP_PT.get(mon_raw[:3], None) or MONTH_MAP_PT.get(mon_raw, '01')
        return f"{year}-{mon}-{day}"

    # "DD/MM/YYYY"
    m = re.match(r'(\d{1,2})/(\d{2})/(\d{4})', date_str)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1).zfill(2)}"

    return None


def _extract_month_from_text(text):
    """Find billing month from 'DatadeVencimento ... DD/MM/YYYY'."""
    # Look for vencimento date
    m = re.search(
        r'(?:Data\s*de\s*Vencimento|DatadeVencimento)[^\d]*(\d{2})/(\d{2})/(\d{4})',
        text, re.IGNORECASE,
    )
    if m:
        return f"{m.group(3)}-{m.group(2)}"

    # Fallback: any date that looks like a due date label
    m = re.search(r'Vencimento[^\d]*(\d{2})/(\d{2})/(\d{4})', text, re.IGNORECASE)
    if m:
        return f"{m.group(3)}-{m.group(2)}"

    return None


def _transactions_from_table(table):
    """Extract transactions from pdfplumber table rows.

    Expected columns (auto-detected by header):
      Data | Movimentação | Beneficiário | Valor
    or similar.
    """
    transactions = []
    if not table or len(table) < 2:
        return transactions

    # Detect header row to find column indices
    header = [str(c).lower().strip() if c else '' for c in table[0]]

    def col_idx(candidates):
        for c in candidates:
            for i, h in enumerate(header):
                if c in h:
                    return i
        return None

    date_col = col_idx(['data', 'dt'])
    desc_col = col_idx(['movimentação', 'movimentacao', 'descrição', 'descricao', 'mov'])
    benef_col = col_idx(['beneficiário', 'beneficiario', 'benef', 'estabelecimento'])
    val_col = col_idx(['valor', 'val'])

    # If we can't detect header, guess by position (typical: 0=date,1=desc,2=benef,3=value)
    if date_col is None:
        date_col = 0
    if desc_col is None:
        desc_col = 1
    if val_col is None:
        val_col = len(table[0]) - 1  # last column

    for row in table[1:]:
        if not row:
            continue

        def safe_get(idx):
            if idx is None or idx >= len(row):
                return ''
            return str(row[idx]).strip() if row[idx] else ''

        date_raw = safe_get(date_col)
        description_raw = safe_get(desc_col)
        beneficiary = safe_get(benef_col) if benef_col is not None else ''
        value_raw = safe_get(val_col)

        # Skip empty or separator rows
        if not date_raw and not description_raw and not value_raw:
            continue
        if not value_raw or not re.search(r'\d', value_raw):
            continue

        date_str = _parse_date_cell(date_raw)

        # Combine description and beneficiary for richer text
        full_desc = ' '.join(filter(None, [description_raw, beneficiary]))

        inst_cur, inst_tot = _parse_installment(full_desc)
        norm_desc = _normalize_description(full_desc)
        amount_cents, is_credit = _parse_br_value(value_raw)

        transactions.append({
            'date': date_str,
            'description': norm_desc,
            'amountCents': amount_cents,
            'isCredit': is_credit,
            'installmentCurrent': inst_cur,
            'installmentTotal': inst_tot,
            'currencyOriginal': None,
            'amountOriginalCents': None,
            'rawLine': ' | '.join(filter(None, [date_raw, description_raw, beneficiary, value_raw])),
            'isCharge': _is_charge(norm_desc),
        })

    return transactions


def _transactions_from_text(text):
    """Fallback: extract transactions by regex from raw page text.

    Handles compressed text where words are joined (e.g., 'DDdemon.YYYY').
    Pattern attempts to match:
      "DDdemon.YYYY  DESCRIPTION  R$X.XXX,XX"
    or with spaces.
    """
    transactions = []
    lines = text.split('\n')

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Match date at start: "DD de mon. YYYY" or compressed "DDdemon.YYYY"
        date_m = re.match(
            r'^(\d{1,2})\s*de\s*([a-zA-Zçã]+)\.?\s*(\d{4})\s+(.+?)\s+([-−]?R?\$?\s*[\d.,]+)$',
            line, re.IGNORECASE,
        )
        if not date_m:
            continue

        day = date_m.group(1).zfill(2)
        mon_raw = date_m.group(2).lower()[:3]
        year = date_m.group(3)
        description_raw = date_m.group(4).strip()
        value_raw = date_m.group(5).strip()

        mon = MONTH_MAP_PT.get(mon_raw, '01')
        date_str = f"{year}-{mon}-{day}"

        inst_cur, inst_tot = _parse_installment(description_raw)
        norm_desc = _normalize_description(description_raw)
        amount_cents, is_credit = _parse_br_value(value_raw)

        transactions.append({
            'date': date_str,
            'description': norm_desc,
            'amountCents': amount_cents,
            'isCredit': is_credit,
            'installmentCurrent': inst_cur,
            'installmentTotal': inst_tot,
            'currencyOriginal': None,
            'amountOriginalCents': None,
            'rawLine': line,
            'isCharge': _is_charge(norm_desc),
        })

    return transactions


def parse(pdf_bytes, password=None):
    """Parse a Banco Inter credit card statement PDF.

    Returns
    -------
    dict with keys: source, month, transactions
    """
    transactions = []
    billing_month = None

    open_kwargs = {'stream': BytesIO(pdf_bytes)}
    if password:
        open_kwargs['password'] = password

    with pdfplumber.open(**open_kwargs) as pdf:
        full_text = ''
        for page in pdf.pages:
            t = page.extract_text() or ''
            full_text += '\n' + t

        # Try to extract billing month from full text
        billing_month = _extract_month_from_text(full_text)

        # ----------------------------------------------------------------
        # Primary strategy: extract_tables() on pages that contain expenses
        # Focus on pages containing "Despesas" or "CARTÃO"
        # ----------------------------------------------------------------
        for page in pdf.pages:
            text = page.extract_text() or ''
            page_relevant = (
                'Despesas' in text
                or 'CARTÃO' in text
                or 'despesas' in text
                or 'fatura' in text.lower()
            )
            if not page_relevant:
                continue

            tables = page.extract_tables()
            for table in tables:
                if not table:
                    continue
                # Only process tables that look like transaction tables
                # (have at least 2 rows and 3+ columns)
                if len(table) < 2:
                    continue
                max_cols = max(len(row) for row in table if row)
                if max_cols < 3:
                    continue

                # Check if header contains date/value keywords
                header_text = ' '.join(
                    str(c).lower() for c in (table[0] or []) if c
                )
                if not any(kw in header_text for kw in ['data', 'valor', 'mov', 'benef']):
                    continue

                page_transactions = _transactions_from_table(table)
                transactions.extend(page_transactions)

        # ----------------------------------------------------------------
        # Fallback: if no transactions found via tables, try text parsing
        # ----------------------------------------------------------------
        if not transactions:
            for page in pdf.pages:
                text = page.extract_text() or ''
                if 'Despesas' not in text and 'CARTÃO' not in text:
                    continue
                page_transactions = _transactions_from_text(text)
                transactions.extend(page_transactions)

    # Deduplicate (same rawLine may appear from overlapping pages)
    seen = set()
    unique = []
    for t in transactions:
        key = t['rawLine']
        if key not in seen:
            seen.add(key)
            unique.append(t)

    return {
        'source': 'inter',
        'month': billing_month,
        'transactions': unique,
    }
