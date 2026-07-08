#!/usr/bin/env python3
"""PDF parsing entry-point for the Planilhado financial app.

Usage:
    cat statement.pdf | python3 scripts/parse_pdf.py [--password PWD] [--input-type TYPE]

The script:
1. Reads PDF bytes from stdin
2. Detects the bank from the first page text
3. Delegates to the appropriate parser in lib/parsers/
4. Writes a JSON object to stdout
5. On error: writes {"error": "<message>"} to stdout and exits with code 1

Supported banks (detected automatically):
- nubank  : "Nubank" or "Nu Pagamentos" in PDF text
- inter   : "BANCO INTER", "bancointer", or "Inter" with "Loop" in PDF text
- picpay  : "PicPay" in PDF text

Output JSON schema:
{
  "source": "nubank" | "inter" | "picpay",
  "month": "YYYY-MM" | null,
  "transactions": [
    {
      "date":                 "YYYY-MM-DD" | null,
      "description":          string,
      "amountCents":          integer,
      "isCredit":             boolean,
      "installmentCurrent":   integer | null,
      "installmentTotal":     integer | null,
      "currencyOriginal":     string | null,   // e.g. "USD"
      "amountOriginalCents":  integer | null,
      "rawLine":              string,
      "isCharge":             boolean
    },
    ...
  ]
}
"""

import sys
import json
import argparse
import traceback
from io import BytesIO
from pathlib import Path

# ---------------------------------------------------------------------------
# Ensure lib/ is on the Python path regardless of where the script is called from
# ---------------------------------------------------------------------------
_SCRIPT_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _SCRIPT_DIR.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))


def _read_stdin_bytes():
    """Read all bytes from stdin."""
    if sys.stdin.isatty():
        raise ValueError("No PDF data on stdin. Pipe a PDF file into this script.")
    return sys.stdin.buffer.read()


def _detect_bank(pdf_bytes, password=None):
    """Return the bank identifier string by inspecting the first few pages.

    Returns 'nubank', 'inter', or 'picpay'.
    Raises ValueError if the bank cannot be determined.
    """
    try:
        import pdfplumber
    except ImportError as exc:
        raise ImportError("pdfplumber is required: pip3 install pdfplumber") from exc

    with pdfplumber.open(BytesIO(pdf_bytes), password=password) as pdf:
        # Check first 3 pages (or all pages if fewer)
        pages_to_check = pdf.pages[:min(3, len(pdf.pages))]
        combined_text = ''
        for page in pages_to_check:
            t = page.extract_text() or ''
            combined_text += '\n' + t

    text_lower = combined_text.lower()

    # ----------------------------------------------------------------
    # Nubank detection
    # ----------------------------------------------------------------
    if 'nubank' in text_lower or 'nu pagamentos' in text_lower:
        return 'nubank'

    # ----------------------------------------------------------------
    # Banco Inter detection
    # ----------------------------------------------------------------
    if (
        'banco inter' in text_lower
        or 'bancointer' in text_lower
        or ('inter' in text_lower and 'loop' in text_lower)
        or 'inter.co' in text_lower
    ):
        return 'inter'

    # ----------------------------------------------------------------
    # PicPay detection
    # ----------------------------------------------------------------
    if 'picpay' in text_lower:
        return 'picpay'

    raise ValueError(
        "Could not detect bank from PDF content. "
        "Expected 'Nubank', 'Banco Inter', or 'PicPay' markers in the first pages."
    )


def _run_parser(bank, pdf_bytes, password=None):
    """Import and call the correct parser module."""
    if bank == 'nubank':
        from lib.parsers import nubank as parser_module
    elif bank == 'inter':
        from lib.parsers import inter as parser_module
    elif bank == 'picpay':
        from lib.parsers import picpay as parser_module
    else:
        raise ValueError(f"Unknown bank: {bank!r}")

    return parser_module.parse(pdf_bytes, password=password)


def _build_arg_parser():
    p = argparse.ArgumentParser(
        description='Parse a bank credit card PDF from stdin and output JSON to stdout.',
    )
    p.add_argument(
        '--password',
        metavar='PWD',
        default=None,
        help='Password to open an encrypted PDF.',
    )
    p.add_argument(
        '--input-type',
        metavar='TYPE',
        default='fatura',
        choices=['fatura', 'extrato'],
        help='Type of PDF input: "fatura" (credit card bill) or "extrato" (bank statement). '
             'Default: fatura.',
    )
    p.add_argument(
        '--bank',
        metavar='BANK',
        default=None,
        choices=['nubank', 'inter', 'picpay'],
        help='Force a specific bank parser instead of auto-detecting.',
    )
    return p


def main():
    arg_parser = _build_arg_parser()
    args = arg_parser.parse_args()

    try:
        pdf_bytes = _read_stdin_bytes()
        if not pdf_bytes:
            raise ValueError("Received empty input on stdin.")

        # Detect bank (or use forced value)
        if args.bank:
            bank = args.bank
        else:
            bank = _detect_bank(pdf_bytes, password=args.password)

        # Run the appropriate parser
        result = _run_parser(bank, pdf_bytes, password=args.password)

        # Ensure the result always includes the input_type metadata
        result['inputType'] = args.input_type

        # Write JSON to stdout
        json.dump(result, sys.stdout, ensure_ascii=False, default=str)
        sys.stdout.write('\n')
        sys.exit(0)

    except Exception as exc:
        error_payload = {
            'error': str(exc),
            'traceback': traceback.format_exc(),
        }
        json.dump(error_payload, sys.stdout, ensure_ascii=False)
        sys.stdout.write('\n')
        sys.exit(1)


if __name__ == '__main__':
    main()
