"""IMO number validation service according to international maritime standards (SOLAS / IMO).

An official IMO ship identification number consists of the three letters "IMO"
followed by a unique seven-digit number.
The 7th digit is a mathematical check digit computed from the first 6 digits:
    CheckSum = (d1 * 7) + (d2 * 6) + (d3 * 5) + (d4 * 4) + (d5 * 3) + (d6 * 2)
    CheckDigit = CheckSum % 10
"""
from __future__ import annotations
import re


def normalize_imo(imo_input: str | None) -> str:
    """Strip whitespace, 'IMO' prefix, and return the clean digit string."""
    if not imo_input:
        return ""
    # Remove everything except digits
    return re.sub(r"[^0-9]", "", str(imo_input).strip())


def validate_imo(imo_input: str | None) -> tuple[bool, str]:
    """Validate that an IMO number is exactly 7 digits and satisfies the check-digit rule.

    Returns:
        (True, 7-digit clean string) if valid.
        (False, error_message) if invalid.
    """
    if not imo_input or not str(imo_input).strip():
        return False, "IMO number is required"

    cleaned = normalize_imo(imo_input)
    if len(cleaned) != 7:
        return False, f"IMO number must be exactly 7 digits (got {len(cleaned)})"

    digits = [int(c) for c in cleaned]
    weights = [7, 6, 5, 4, 3, 2]
    checksum = sum(d * w for d, w in zip(digits[:6], weights))
    expected_check_digit = checksum % 10

    if digits[6] != expected_check_digit:
        return (
            False,
            f"Invalid IMO check-digit: expected {expected_check_digit}, but got {digits[6]}",
        )

    return True, cleaned


def format_imo(imo_input: str | None) -> str:
    """Format as 'IMO XXXXXXX'."""
    cleaned = normalize_imo(imo_input)
    return f"IMO {cleaned}" if cleaned else ""
