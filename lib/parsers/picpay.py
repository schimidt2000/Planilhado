"""Parser for PicPay credit card statement PDFs.

Structure:
- Page 1 header: "Vencimento: DD-MM-YYYY | Fechamento: DD-MM-YYYY"
  → billing month = month of vencimento date
- Page 3+: "Picpay Card" section with subsections:
    "Tarifas"                   → charges (IOF, JUROS, MULTA, etc.)
    "Transações Nacionais"      → regular purchases
    "Operações de crédito"      → installment credit operations
- Transaction line format: "DD/MM ESTABLISHMENT R$ X,XX"
  or: "DD/MM ESTABLISHMENT PARC04/05 R$ X,XX"
- Payment line: "PAGAMENTO DE FATURA R$ X,XX" → isCredit=True
"""

import re
import pdfplumber
from io import BytesIO

TARIFA_NAMES = {
    'IOF DIARIO ROTATIVO',
    'IOF ADICIONAL ROTATIVO',
    'JUROS CREDITO ROTATIVO',
    'JUROS PARCELAMENTO AUTOMATICO',
    'JUROS DE MORA',
    'MULTA POR ATRASO',
    'ENCARGOS',
    'IOF',
}

CHARGE_KEYWORDS = {
    'IOF', 'JUROS', 'MULTA', 'ENCARGO', 'MORA', 'ROTATIVO', 'FINANCIAMENTO',
}

CREDIT_KEYWORDS = {
    'PAGAMENTO', 'CREDITO', 'ESTORNO', 'DEVOLUCAO', 'REEMBOLSO',
}

INSTALLMENT_SECTION_KEYWORDS = {
    'FATURA PARCELAMENTO', 'FIN PARC AUTOM', 'PARCELAMENTO',
}


def _is_charge(description):
    upper = description.upper()
    upper_nospace = re.sub(r'\s+', '', upper)
    for kw in CHARGE_KEYWORDS:
        if kw in upper or kw in upper_nospace:
            return True
    return False


def _is_credit(description):
    upper = description.upper()
    for kw in CREDIT_KEYWORDS:
        if kw in upper:
            return True
    return False


def _parse_br_value(value_str):
    """Parse 'R$ 1.234,56' or '1.234,56' → (cents: int, is_credit: bool)."""
    if not value_str:
        return 0, False
    is_credit_val = bool(re.match(r'^\s*[-−]', value_str))
    clean = re.sub(r'[^0-9,]', '', value_str)
    clean = clean.replace(',', '.')
    try:
        cents = int(round(float(clean) * 100))
    except (ValueError, TypeError):
        cents = 0
    return cents, is_credit_val


def _parse_installment(text):
    """Parse 'PARC04/05' or 'PARC 04/05' → (current=4, total=5)."""
    m = re.search(r'PARC\s*0*(\d+)[/ \\]0*(\d+)', text, re.IGNORECASE)
    if m:
        return int(m.group(1)), int(m.group(2))
    # Fallback: "Parcela X de Y"
    m = re.search(r'[Pp]arcela\s*0*(\d+)\s*(?:de|/)\s*0*(\d+)', text)
    if m:
        return int(m.group(1)), int(m.group(2))
    return None, None


def _normalize_description(text):
    """Remove installment info from description."""
    text = re.sub(r'\s*PARC\s*\d+[/\\]\d+', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\s*[Pp]arcela\s*\d+\s*(?:de|/)\s*\d+', '', text)
    return text.strip()


def _extract_billing_month(text):
    """Extract billing month from 'Vencimento: DD-MM-YYYY' header."""
    m = re.search(r'Vencimento\s*:\s*(\d{2})-(\d{2})-(\d{4})', text, re.IGNORECASE)
    if m:
        return f"{m.group(3)}-{m.group(2)}"
    # Also try "Vencimento DD/MM/YYYY"
    m = re.search(r'Vencimento\s*:\s*(\d{2})/(\d{2})/(\d{4})', text, re.IGNORECASE)
    if m:
        return f"{m.group(3)}-{m.group(2)}"
    return None


def _parse_transaction_line(line, current_section, billing_year):
    """Try to parse a single line as a transaction.

    Returns a transaction dict or None.

    Expected formats:
      "DD/MM ESTABLISHMENT R$ X,XX"
      "DD/MM ESTABLISHMENT PARCXX/YY R$ X,XX"
      "TARIFA_NAME R$ X,XX"   (for Tarifas section)
    """
    line = line.strip()
    if not line:
        return None

    # ----------------------------------------------------------------
    # Pattern 1: lines starting with a date "DD/MM"
    # ----------------------------------------------------------------
    m = re.match(
        r'^(\d{2})/(\d{2})\s+'           # date DD/MM
        r'(.+?)\s+'                        # description
        r'([-−]?\s*R?\$?\s*[\d.,]+)$',    # value
        line,
        re.IGNORECASE,
    )
    if m:
        day = m.group(1)
        month_num = m.group(2)
        description_raw = m.group(3).strip()
        value_raw = m.group(4).strip()

        year = billing_year or '2026'
        date_str = f"{year}-{month_num}-{day}"

        inst_cur, inst_tot = _parse_installment(description_raw)
        norm_desc = _normalize_description(description_raw)
        amount_cents, credit_flag = _parse_br_value(value_raw)

        # Override credit detection from description keyword
        if not credit_flag:
            credit_flag = _is_credit(norm_desc)

        return {
            'date': date_str,
            'description': norm_desc,
            'amountCents': amount_cents,
            'isCredit': credit_flag,
            'installmentCurrent': inst_cur,
            'installmentTotal': inst_tot,
            'currencyOriginal': None,
            'amountOriginalCents': None,
            'rawLine': line,
            'isCharge': (current_section == 'tarifas') or _is_charge(norm_desc),
        }

    # ----------------------------------------------------------------
    # Pattern 2: Tarifa lines without a date prefix
    #   "IOF DIARIO ROTATIVO R$ X,XX"
    # ----------------------------------------------------------------
    if current_section == 'tarifas':
        m = re.match(
            r'^(.+?)\s+([-−]?\s*R?\$?\s*[\d.,]+)$',
            line,
            re.IGNORECASE,
        )
        if m:
            description_raw = m.group(1).strip()
            value_raw = m.group(2).strip()
            # Must contain at least one digit in value
            if not re.search(r'\d', value_raw):
                return None
            amount_cents, credit_flag = _parse_br_value(value_raw)
            norm_desc = _normalize_description(description_raw)
            return {
                'date': None,
                'description': norm_desc,
                'amountCents': amount_cents,
                'isCredit': credit_flag,
                'installmentCurrent': None,
                'installmentTotal': None,
                'currencyOriginal': None,
                'amountOriginalCents': None,
                'rawLine': line,
                'isCharge': True,
            }

    # ----------------------------------------------------------------
    # Pattern 3: "Operações de crédito" — installment plan totals
    #   "FATURA PARCELAMENTO R$ X,XX"
    # ----------------------------------------------------------------
    if current_section == 'operacoes':
        m = re.match(
            r'^(.+?)\s+([-−]?\s*R?\$?\s*[\d.,]+)$',
            line,
            re.IGNORECASE,
        )
        if m:
            description_raw = m.group(1).strip()
            value_raw = m.group(2).strip()
            if not re.search(r'\d', value_raw):
                return None
            inst_cur, inst_tot = _parse_installment(description_raw)
            norm_desc = _normalize_description(description_raw)
            amount_cents, credit_flag = _parse_br_value(value_raw)
            return {
                'date': None,
                'description': norm_desc,
                'amountCents': amount_cents,
                'isCredit': credit_flag,
                'installmentCurrent': inst_cur,
                'installmentTotal': inst_tot,
                'currencyOriginal': None,
                'amountOriginalCents': None,
                'rawLine': line,
                'isCharge': _is_charge(norm_desc),
            }

    return None


def _detect_section(line):
    """Return section name if the line is a section header, else None."""
    stripped = line.strip().lower()
    if 'tarifas' in stripped:
        return 'tarifas'
    if 'transações nacionais' in stripped or 'transacoes nacionais' in stripped:
        return 'nacional'
    if 'transações internacionais' in stripped or 'transacoes internacionais' in stripped:
        return 'internacional'
    if 'operações de crédito' in stripped or 'operacoes de credito' in stripped:
        return 'operacoes'
    return None


def parse(pdf_bytes, password=None):
    """Parse a PicPay credit card statement PDF.

    Returns
    -------
    dict with keys: source, month, transactions
    """
    transactions = []
    billing_month = None
    billing_year = None

    open_kwargs = {'stream': BytesIO(pdf_bytes)}
    if password:
        open_kwargs['password'] = password

    with pdfplumber.open(**open_kwargs) as pdf:
        # ----------------------------------------------------------------
        # Phase 1: extract billing month from all pages (usually page 1)
        # ----------------------------------------------------------------
        for page in pdf.pages:
            text = page.extract_text() or ''
            if not billing_month:
                billing_month = _extract_billing_month(text)
                if billing_month:
                    billing_year = billing_month.split('-')[0]

        # ----------------------------------------------------------------
        # Phase 2: extract transactions
        # ----------------------------------------------------------------
        in_picpay_card_section = False
        current_section = None

        for page in pdf.pages:
            text = page.extract_text() or ''
            if not text:
                continue

            # Detect start of "Picpay Card" block
            if 'Picpay Card' in text or 'PicPay Card' in text:
                in_picpay_card_section = True

            if not in_picpay_card_section:
                # Still try to parse pages that look like transaction pages
                if 'Tarifas' not in text and 'Transações' not in text:
                    continue

            lines = text.split('\n')
            for line in lines:
                stripped = line.strip()
                if not stripped:
                    continue

                # Detect section headers
                new_section = _detect_section(stripped)
                if new_section:
                    current_section = new_section
                    continue

                # Skip section header lines for "Picpay Card"
                if stripped in ('Picpay Card', 'PicPay Card'):
                    in_picpay_card_section = True
                    continue

                # Skip total/summary lines
                if re.match(r'^Total\s', stripped, re.IGNORECASE):
                    continue
                if re.match(r'^Sub[\s-]?total', stripped, re.IGNORECASE):
                    continue

                # Only parse within relevant sections
                if current_section is None and not in_picpay_card_section:
                    continue

                txn = _parse_transaction_line(stripped, current_section, billing_year)
                if txn:
                    transactions.append(txn)

    # ----------------------------------------------------------------
    # Fallback: try extract_tables() if text parsing found nothing
    # ----------------------------------------------------------------
    if not transactions:
        with pdfplumber.open(**open_kwargs) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ''
                if 'Picpay' not in text and 'PicPay' not in text:
                    continue
                tables = page.extract_tables()
                for table in tables:
                    if not table or len(table) < 2:
                        continue
                    for row in table[1:]:
                        if not row:
                            continue
                        cells = [str(c).strip() if c else '' for c in row]
                        # Find value in last non-empty cell
                        val_cell = next(
                            (c for c in reversed(cells) if re.search(r'[\d,]+', c)),
                            None,
                        )
                        if not val_cell:
                            continue
                        desc_cells = cells[:-1]
                        description_raw = ' '.join(c for c in desc_cells if c)
                        amount_cents, credit_flag = _parse_br_value(val_cell)
                        inst_cur, inst_tot = _parse_installment(description_raw)
                        norm_desc = _normalize_description(description_raw)
                        if not credit_flag:
                            credit_flag = _is_credit(norm_desc)
                        transactions.append({
                            'date': None,
                            'description': norm_desc,
                            'amountCents': amount_cents,
                            'isCredit': credit_flag,
                            'installmentCurrent': inst_cur,
                            'installmentTotal': inst_tot,
                            'currencyOriginal': None,
                            'amountOriginalCents': None,
                            'rawLine': ' | '.join(cells),
                            'isCharge': _is_charge(norm_desc),
                        })

    return {
        'source': 'picpay',
        'month': billing_month,
        'transactions': transactions,
    }
