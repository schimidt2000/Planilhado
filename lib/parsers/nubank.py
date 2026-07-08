import re
import pdfplumber
from io import BytesIO

MONTH_MAP = {
    'JAN': '01', 'FEV': '02', 'MAR': '03', 'ABR': '04',
    'MAI': '05', 'JUN': '06', 'JUL': '07', 'AGO': '08',
    'SET': '09', 'OUT': '10', 'NOV': '11', 'DEZ': '12'
}

CHARGE_KEYWORDS = {
    'MULTA', 'JUROS', 'IOF', 'ENCARGO', 'MORA', 'ROTATIVO', 'FINANCIAMENTO'
}

TARIFA_DESCRIPTIONS = {
    'ANUIDADE',
    'TARIFA',
    'SEGURO',
}


def normalize_description(text):
    """Remove installment suffix from description."""
    text = re.sub(r'\s*-?\s*Parcela\s*\d+/\d+', '', text, flags=re.IGNORECASE)
    return text.strip()


def parse_installment(text):
    """Extract current and total installment numbers from description."""
    m = re.search(r'Parcela\s*(\d+)/(\d+)', text, re.IGNORECASE)
    if m:
        return int(m.group(1)), int(m.group(2))
    return None, None


def parse_value(value_str):
    """Parse Brazilian currency string like 'R$ 1.234,56' or '−R$ 1.234,56'.
    Returns (amount_cents: int, is_credit: bool).
    """
    # Detect credit (minus sign — unicode or hyphen)
    is_credit = '−' in value_str or value_str.lstrip().startswith('-')
    # Strip everything except digits and comma
    clean = re.sub(r'[^0-9,]', '', value_str)
    # Replace comma decimal separator
    clean = clean.replace(',', '.')
    try:
        amount_cents = int(round(float(clean) * 100))
    except (ValueError, TypeError):
        amount_cents = 0
    return amount_cents, is_credit


def is_charge(description):
    """Return True if the description looks like a fee/charge rather than a purchase."""
    upper = description.upper()
    for kw in CHARGE_KEYWORDS:
        if kw in upper:
            return True
    return False


def parse(pdf_bytes, password=None):
    """Parse a Nubank credit card statement PDF.

    Parameters
    ----------
    pdf_bytes : bytes
        Raw PDF file contents.
    password : str or None
        PDF password if the file is encrypted.

    Returns
    -------
    dict with keys:
        source       : 'nubank'
        month        : 'YYYY-MM' billing month string or None
        transactions : list of transaction dicts
    """
    transactions = []
    month_ref = None
    year_ref = None

    with pdfplumber.open(BytesIO(pdf_bytes), password=password) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if not text:
                continue

            # ----------------------------------------------------------------
            # Detect billing month from header "FATURA DD MMM YYYY"
            # ----------------------------------------------------------------
            if not month_ref:
                m = re.search(r'FATURA\s+\d+\s+([A-Z]{3})\s+(\d{4})', text, re.IGNORECASE)
                if m:
                    month_ref = MONTH_MAP.get(m.group(1).upper())
                    year_ref = m.group(2)

            # ----------------------------------------------------------------
            # Only parse pages that contain the transactions section
            # ----------------------------------------------------------------
            if 'TRANSAÇÕES DE' not in text and 'TRANSACOES DE' not in text:
                continue

            lines = text.split('\n')
            i = 0
            while i < len(lines):
                line = lines[i].strip()
                if not line:
                    i += 1
                    continue

                # ------------------------------------------------------------
                # Transaction line patterns:
                #   Standard:  "DD MMM •••• NNNN Description R$ X,XX"
                #   NuTag/etc: "DD MMM Description R$ X,XX"
                #   Credit:    "DD MMM Description −R$ X,XX"
                # ------------------------------------------------------------
                m = re.match(
                    r'^(\d{2})\s+([A-Z]{3})\s+'      # day + month
                    r'(?:•{4}\s+(\d{4})\s+)?'         # optional card mask
                    r'(.+?)\s+'                        # description (non-greedy)
                    r'([-−]?R\$\s*[\d.,]+)$',         # amount
                    line,
                    re.IGNORECASE,
                )
                if not m:
                    i += 1
                    continue

                day = m.group(1)
                mon_str = m.group(2).upper()
                card_last_four = m.group(3)
                description = m.group(4).strip()
                value_str = m.group(5).strip()

                mon = MONTH_MAP.get(mon_str, '01')
                year = year_ref or '2026'
                date_str = f"{year}-{mon}-{day}"

                amount_cents, credit_flag = parse_value(value_str)

                inst_cur, inst_tot = parse_installment(description)
                norm_desc = normalize_description(description)

                # ------------------------------------------------------------
                # Check next lines for international transaction info (USD)
                # Format:
                #   "R$ X,XX"        ← already consumed above
                #   "USD Y.YY"       ← next line
                #   "Conversão: ..." ← line after that
                # ------------------------------------------------------------
                currency = None
                amount_original_cents = None
                if i + 1 < len(lines):
                    next_line = lines[i + 1].strip()
                    usd_m = re.match(r'^USD\s+([\d.]+)', next_line, re.IGNORECASE)
                    if usd_m:
                        currency = 'USD'
                        try:
                            amount_original_cents = int(round(float(usd_m.group(1)) * 100))
                        except (ValueError, TypeError):
                            pass
                        i += 1  # consume USD line
                        # Optionally consume conversion rate line
                        if i + 1 < len(lines) and 'convers' in lines[i + 1].lower():
                            i += 1

                transactions.append({
                    'date': date_str,
                    'description': norm_desc,
                    'amountCents': amount_cents,
                    'isCredit': credit_flag,
                    'installmentCurrent': inst_cur,
                    'installmentTotal': inst_tot,
                    'currencyOriginal': currency,
                    'amountOriginalCents': amount_original_cents,
                    'rawLine': line,
                    'isCharge': is_charge(norm_desc),
                    'cardLastFour': card_last_four,
                })

                i += 1

    billing_month = f"{year_ref}-{month_ref}" if month_ref and year_ref else None

    return {
        'source': 'nubank',
        'month': billing_month,
        'transactions': transactions,
    }
