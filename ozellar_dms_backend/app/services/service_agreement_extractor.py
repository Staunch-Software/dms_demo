"""Read the main details out of an uploaded service agreement (PDF or image).

Local only (PyMuPDF text, OCR fallback, regex) - reuses the certificate extractor's
text reader and date finder. Every value is a suggestion: the user checks the form
before saving. Fields that could not be read are listed in "undetected_fields".
"""
from __future__ import annotations

import logging
import re
from datetime import date
from typing import Any

from dateutil.relativedelta import relativedelta

from ..db import models
from .certificate_extractor import extract_text_from_file_bytes, find_date_in_window

log = logging.getLogger(__name__)

# Our own company never is the vendor.
_OWN_COMPANY_WORDS = ("ozellar", "ozellar marine")

_TITLE_WORDS = re.compile(
    r"\b(agreement|contract|annual\s+maintenance|amc|service\s+(?:order|level)|purchase\s+order|memorandum)\b",
    re.IGNORECASE,
)

_START_KEYWORDS = [
    "effective date", "effective from", "commencement date", "date of commencement", "commencing on",
    "start date", "period from", "valid from",
]
# Date the contract was made / signed (also the effective date when no separate one is written).
_SIGNED_KEYWORDS = [
    "signed on", "made on", "entered into on", "agreement date", "date of agreement", "contract date",
    "date of contract", "date of issue", "issue date", "issued on", "dated",
]
_END_KEYWORDS = [
    "expiry date", "date of expiry", "expiration date", "end date", "termination date", "valid until",
    "valid till", "valid up to", "valid upto", "expires on", "until",
]

_VENDOR_LABEL_RE = re.compile(
    r"(?:service\s+provider|vendor|contractor|supplier|company\s+name|provider|second\s+party|party\s+b)"
    r"\s*[:\-]\s*([^\n]{3,120})",
    re.IGNORECASE,
)
_ORG_SUFFIX = (
    r"(?:Private\s+Limited|Pvt\.?\s*Ltd\.?|Pte\.?\s*Ltd\.?|Limited|Ltd\.?|LLC|L\.L\.C\.?|Inc\.?|GmbH|"
    r"Co\.,?\s*Ltd\.?|Corporation|Corp\.?|S\.A\.|B\.V\.|A/S|AS|Engineering|Marine|Services|Solutions)"
)
# "between <party 1> and <party 2>": party 2 runs to the end of the line / sentence.
_BETWEEN_RE = re.compile(r"\bbetween\b([^\n]{3,300}?)\band\b\s*([^\n;]{3,200})", re.IGNORECASE)
# A company name ends with one or more suffixes: "Oceanic Engineering Pte Ltd".
_ORG_RE = re.compile(rf"\b([A-Z][A-Za-z0-9&.,'\- ]{{2,80}}?\s{_ORG_SUFFIX}(?:,?\s+{_ORG_SUFFIX})*)(?=[\s,.;)]|$)")

_REFERENCE_RE = re.compile(
    r"(?:agreement|contract|reference|ref|quotation|quote|p\.?\s*o\.?|purchase\s+order|order)\s*"
    r"(?:no\.?|number|#|ref\.?)?\s*[:#\-]\s*([A-Z0-9][A-Z0-9/\-_.]{2,40})",
    re.IGNORECASE,
)
_PERIOD_RE = re.compile(
    r"(?:period|term|duration|validity)\s+(?:of\s+)?(?:(?:the|this)\s+(?:agreement|contract)\s+)?(?:shall\s+be\s+|is\s+|:\s*)?"
    r"(?:for\s+)?(\d{1,2}|one|two|three|four|five|six|twelve|eighteen|twenty[\s-]four|thirty[\s-]six)\s*"
    r"(?:\(\d{1,2}\)\s*)?(years?|months?)",
    re.IGNORECASE,
)
_ALL_SHIPS_RE = re.compile(
    r"\b(all\s+(?:the\s+)?(?:vessels|ships)|entire\s+fleet|whole\s+fleet|fleet[\s-]wide|all\s+fleet)\b",
    re.IGNORECASE,
)

_NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "twelve": 12, "eighteen": 18,
    "twenty four": 24, "twenty-four": 24, "thirty six": 36, "thirty-six": 36,
}


def _clean(value: str | None, limit: int = 300) -> str | None:
    if not value:
        return None
    v = re.sub(r"\s+", " ", value).strip(" .,:;-\t\"'()")
    return v[:limit] if v else None


def _is_own_company(name: str) -> bool:
    low = name.lower()
    return any(w in low for w in _OWN_COMPANY_WORDS)


def _find_date(text: str, keywords: list[str]) -> date | None:
    low = text.lower()
    for kw in keywords:
        for m in re.finditer(rf"\b{re.escape(kw)}\b", low):
            d = find_date_in_window(text[m.end(): m.end() + 120], pick_last=False)
            if d:
                return d
    return None


def extract_title(text: str, filename: str = "") -> str | None:
    for line in text.splitlines()[:40]:
        cand = _clean(line, 200)
        if cand and 6 <= len(cand) <= 140 and _TITLE_WORDS.search(cand) and not re.match(r"^(this|the|whereas)\b", cand, re.I):
            return cand
    stem = re.sub(r"\.[A-Za-z0-9]{2,5}$", "", (filename or "").rsplit("/", 1)[-1])
    stem = _clean(re.sub(r"[_]+", " ", stem), 200)
    return stem or None


def extract_vendor(text: str) -> str | None:
    for m in _VENDOR_LABEL_RE.finditer(text):
        cand = _clean(m.group(1), 300)
        if cand and not _is_own_company(cand):
            return cand
    m = _BETWEEN_RE.search(text)
    if m:
        for part in (m.group(2), m.group(1)):
            org = _ORG_RE.search(part)
            cand = _clean(org.group(1) if org else None, 300)
            if cand and not _is_own_company(cand):
                return cand
    for org in _ORG_RE.finditer(text):
        cand = _clean(org.group(1), 300)
        if cand and not _is_own_company(cand) and len(cand.split()) <= 8:
            return cand
    return None


def extract_reference(text: str) -> str | None:
    for m in _REFERENCE_RE.finditer(text):
        cand = m.group(1).strip(" .-")
        if any(ch.isdigit() for ch in cand):
            return cand[:150]
    return None


def extract_period_months(text: str) -> int | None:
    m = _PERIOD_RE.search(text)
    if not m:
        return None
    raw, unit = m.group(1).lower(), m.group(2).lower()
    n = int(raw) if raw.isdigit() else _NUMBER_WORDS.get(raw.replace("-", " "), _NUMBER_WORDS.get(raw))
    if not n:
        return None
    return n * 12 if unit.startswith("year") else n


def match_vessels(text: str, vessels: list[models.Vessel]) -> list[models.Vessel]:
    low = text.lower()
    found: list[models.Vessel] = []
    for v in vessels:
        name = (v.name or "").strip().lower()
        if len(name) >= 4 and re.search(rf"\b{re.escape(name)}\b", low):
            found.append(v)
            continue
        if v.imo and re.search(rf"\b{re.escape(v.imo.strip())}\b", text):
            found.append(v)
    return found


def match_known_value(text: str, known: list[str]) -> str | None:
    """Pick an already-used category / sub-category whose name appears in the document."""
    low = text.lower()
    for value in sorted({k for k in known if k}, key=len, reverse=True):
        if len(value) >= 3 and re.search(rf"\b{re.escape(value.lower())}\b", low):
            return value
    return None


# Client's Contract Category list -> words that point to it (first match wins).
_CATEGORY_HINTS: list[tuple[str, tuple[str, ...]]] = [
    ("Newbuilding", ("newbuilding", "new building", "shipbuilding", "ship building", "hull no", "hull number")),
    ("Insurance", ("insurance", "p&i", "p & i", "hull and machinery", "h&m", "underwriter", "policy no")),
    ("Charter", ("charter party", "time charter", "voyage charter", "bareboat", "charterer")),
    ("Class", ("classification society", "class survey", "class society")),
    ("Flag - Statutory", ("flag state", "statutory", "maritime administration", "registry")),
    ("Management", ("ship management", "technical management", "crew management", "manager")),
    ("Supply", ("supply of", "purchase order", "spare parts", "supplier", "provisions", "lubricant")),
    ("Service", ("service", "maintenance", "amc", "repair", "inspection", "calibration")),
]

_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_PHONE_RE = re.compile(r"(?:tel|phone|mobile|mob|contact)\.?\s*(?:no\.?)?\s*[:\-]?\s*(\+?[\d][\d\s()\-]{6,20}\d)", re.IGNORECASE)
_AUTO_RENEW_RE = re.compile(r"\b(?:auto(?:matic(?:ally)?)?[\s-]*renew(?:al|ed|s)?|renew(?:ed)?\s+automatically|tacit(?:ly)?\s+renew)", re.IGNORECASE)
_NO_AUTO_RENEW_RE = re.compile(r"\b(?:shall\s+not|will\s+not|not\s+be)\s+(?:be\s+)?(?:auto(?:matically)?\s+)?renew", re.IGNORECASE)
_NOTICE_RE = re.compile(
    r"(\d{1,3}|thirty|sixty|ninety|fourteen|seven)\s*(?:\(\d{1,3}\)\s*)?(?:calendar\s+)?days?['’]?\s+(?:prior\s+|advance\s+)?(?:written\s+)?notice",
    re.IGNORECASE,
)
_RENEW_FOR_RE = re.compile(
    r"renew(?:ed|al)?\s+(?:automatically\s+)?(?:for\s+)?(?:a\s+)?(?:further|successive|additional|another)?\s*"
    r"(?:period\s+of\s+)?(\d{1,2}|one|two|three|six|twelve)\s*(?:\(\d{1,2}\)\s*)?(year|month|day)s?",
    re.IGNORECASE,
)
_SCOPE_RE = re.compile(
    r"(?:scope\s+of\s+(?:work|services?|supply)|purpose|subject\s+matter)\s*[:\-.]?\s*([^\n].{20,600}?)(?:\n\s*\n|\.\s)",
    re.IGNORECASE | re.DOTALL,
)
_PROVISION_RE = re.compile(
    r"\b((?:for|regarding|in\s+respect\s+of|relating\s+to)\s+(?:the\s+)?(?:provision|supply|performance|maintenance|servicing|repair|inspection)\b[^.\n]{10,400})",
    re.IGNORECASE,
)
_WORD_NUMBERS = {"one": 1, "two": 2, "three": 3, "six": 6, "seven": 7, "twelve": 12, "fourteen": 14,
                 "thirty": 30, "sixty": 60, "ninety": 90}


def guess_category(text: str, categories: list[str]) -> str | None:
    low = text.lower()
    allowed = {c.lower(): c for c in categories}
    for category, words in _CATEGORY_HINTS:
        if category.lower() in allowed and any(w in low for w in words):
            return allowed[category.lower()]
    return None


def extract_description(text: str) -> str | None:
    m = _SCOPE_RE.search(text) or _PROVISION_RE.search(text)
    if not m:
        return None
    desc = _clean(m.group(1), 500)
    if not desc or len(desc) < 15:
        return None
    return desc[0].upper() + desc[1:]


def extract_first_party(text: str) -> str | None:
    """Our own company as named in the document (e.g. "Ozellar Marine")."""
    for org in _ORG_RE.finditer(text):
        cand = _clean(org.group(1), 300)
        if cand and _is_own_company(cand):
            m = re.search(r"ozellar", cand, re.IGNORECASE)
            return cand[m.start():] if m else cand
    return None


def extract_contacts(text: str) -> dict[str, str | None]:
    """Email / phone of the counterparty (our own company's addresses are skipped)."""
    email = next((e for e in _EMAIL_RE.findall(text) if not _is_own_company(e)), None)
    phone = None
    for m in _PHONE_RE.finditer(text):
        window = text[max(0, m.start() - 120): m.start()].lower()
        if not any(w in window for w in _OWN_COMPANY_WORDS):
            phone = re.sub(r"\s{2,}", " ", m.group(1)).strip()
            break
    return {"email": email, "phone": phone}


def _number(raw: str) -> int | None:
    raw = raw.lower()
    return int(raw) if raw.isdigit() else _WORD_NUMBERS.get(raw)


def extract_renewal(text: str) -> dict[str, Any]:
    auto = bool(_AUTO_RENEW_RE.search(text)) and not _NO_AUTO_RENEW_RE.search(text)
    period_value = period_unit = None
    m = _RENEW_FOR_RE.search(text)
    if m:
        period_value = _number(m.group(1))
        period_unit = f"{m.group(2).lower()}s" if period_value else None
    notice = None
    n = _NOTICE_RE.search(text)
    if n:
        notice = _number(n.group(1))
    return {"auto_renewal": auto, "renewal_period_value": period_value, "renewal_period_unit": period_unit, "notice_period_days": notice}


def extract_service_agreement_metadata(
    file_bytes: bytes,
    filename: str,
    vessels: list[models.Vessel],
    categories: list[str] | None = None,
    known_sub_categories: list[str] | None = None,
) -> dict[str, Any]:
    text = extract_text_from_file_bytes(file_bytes, filename) or ""
    if not text.strip():
        return {
            "success": False,
            "message": "No text could be read from this file. Please fill in the details by hand.",
            "fields": {},
            "undetected_fields": ["Contract Title", "Second Party", "Effective Date", "Expiry Date"],
        }

    signed = _find_date(text, _SIGNED_KEYWORDS)
    effective = _find_date(text, _START_KEYWORDS) or signed
    expiry = _find_date(text, _END_KEYWORDS)
    if effective and expiry and expiry <= effective:
        expiry = None
    period_months = extract_period_months(text)
    if effective and not expiry and period_months:
        expiry = effective + relativedelta(months=period_months) - relativedelta(days=1)

    all_ships = bool(_ALL_SHIPS_RE.search(text))
    ships = [] if all_ships else match_vessels(text, vessels)
    contacts = extract_contacts(text)
    second_party = extract_vendor(text)

    fields: dict[str, Any] = {
        "agreement_name": extract_title(text, filename),
        "description": extract_description(text),
        "vendor": second_party,
        "first_party_name": extract_first_party(text),
        "second_party_name": second_party,
        "second_party_email": contacts["email"],
        "second_party_phone": contacts["phone"],
        "vendor_reference": extract_reference(text),
        "category": guess_category(text, categories or []),
        "sub_category": match_known_value(text, known_sub_categories or []),
        "contract_date": signed.isoformat() if signed else None,
        "issue_date": effective.isoformat() if effective else None,
        "expiry_date": expiry.isoformat() if expiry else None,
        "validity_months": period_months,
        "applies_to_all_ships": all_ships,
        "applies_to": "all_ships" if all_ships else ("vessels" if ships else None),
        "vessel_ids": [v.id for v in ships],
        "vessel_names": [v.name for v in ships],
        **extract_renewal(text),
    }
    labels = {
        "agreement_name": "Contract Title",
        "description": "Brief Description",
        "category": "Contract Category",
        "second_party_name": "Second Party",
        "issue_date": "Effective Date",
        "expiry_date": "Expiry Date",
    }
    undetected = [label for key, label in labels.items() if not fields.get(key)]
    return {
        "success": True,
        "fields": fields,
        "undetected_fields": undetected,
        "text_length": len(text),
    }
