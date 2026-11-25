"""Read the main details out of an uploaded service agreement (PDF or image).

Supports:
1. Structured Table / Term Sheet parsing (for framework agreements, summaries, and contract metadata sheets).
2. AI Extraction Fallback (via company Azure OpenAI / Copilot when configured).
3. Text regex and keyword heuristics (PyMuPDF text, OCR fallback, date window scan).

Every value is a suggestion: the user checks the form before saving.
Fields that could not be read are listed in "undetected_fields".
"""
from __future__ import annotations

import json
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
    r"\b(agreement|contract|annual\s+maintenance|amc|service\s+(?:order|level)|purchase\s+order|memorandum|framework)\b",
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
    r"(?:service\s+provider|vendor|contractor|supplier|company\s+name|provider|second\s+party|party\s+b|counterparty)"
    r"\s*[:\-–]?\s*([^\n]{3,120})",
    re.IGNORECASE,
)
_ORG_SUFFIX = (
    r"(?:Private\s+Limited|Pvt\.?\s*Ltd\.?|Pte\.?\s*Ltd\.?|Limited|Ltd\.?|LLC|L\.L\.C\.?|Inc\.?|GmbH|"
    r"Co\.,?\s*Ltd\.?|Corporation|Corp\.?|S\.A\.|B\.V\.|A/S|AS|Engineering|Marine|Services|Solutions|Society)"
)
# "between <party 1> and <party 2>": party 2 runs to the end of the line / sentence.
_BETWEEN_RE = re.compile(r"\bbetween\b([^\n]{3,300}?)\band\b\s*([^\n;]{3,200})", re.IGNORECASE)
# A company name ends with one or more suffixes: "Oceanic Engineering Pte Ltd".
_ORG_RE = re.compile(rf"\b([A-Z][A-Za-z0-9&.,'\- ]{{2,80}}?\s{_ORG_SUFFIX}(?:,?\s+{_ORG_SUFFIX})*)(?=[\s,.;)|]|$)")

_REFERENCE_RE = re.compile(
    r"(?:agreement|contract|external\s+contract|reference|ref|quotation|quote|p\.?\s*o\.?|purchase\s+order|order)\s*"
    r"(?:no\.?|number|#|ref\.?)?\s*[:#\-–]?\s*([A-Z0-9][A-Z0-9/\-_.]{2,40})",
    re.IGNORECASE,
)
_PERIOD_RE = re.compile(
    r"(?:period|term|duration|validity)\s+(?:of\s+)?(?:(?:the|this)\s+(?:agreement|contract)\s+)?(?:shall\s+be\s+|is\s+|:\s*)?"
    r"(?:for\s+)?(\d{1,2}|one|two|three|four|five|six|twelve|eighteen|twenty[\s-]four|thirty[\s-]six)\s*"
    r"(?:\(\d{1,2}\)\s*)?(years?|months?)",
    re.IGNORECASE,
)
_ALL_SHIPS_RE = re.compile(
    r"\b(all\s+(?:the\s+)?(?:vessels|ships)|entire\s+fleet|whole\s+fleet|fleet[\s-]wide|all\s+fleet|all\s+fleet\s+vessels)\b",
    re.IGNORECASE,
)

_NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "twelve": 12, "eighteen": 18,
    "twenty four": 24, "twenty-four": 24, "thirty six": 36, "thirty-six": 36,
}

_MONTH_NAME_TO_INT = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6,
    "jul": 7, "july": 7, "aug": 8, "august": 8, "sep": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}


def _clean(value: str | None, limit: int = 300) -> str | None:
    if not value:
        return None
    v = re.sub(r"\s+", " ", value).strip(" .,:;-\t\"'()")
    return v[:limit] if v else None


def _is_own_company(name: str) -> bool:
    low = name.lower()
    return any(w in low for w in _OWN_COMPANY_WORDS)


def _parse_explicit_date(val: str | None) -> date | None:
    """Parses explicit date patterns such as 18-NOV-2026, 2026-11-18, 01/12/2026."""
    if not val:
        return None
    val_clean = re.sub(r"[,\t]+", " ", val).strip()
    m = re.search(r"\b(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ](\d{4})\b", val_clean)
    if m:
        d_str, mon_str, y_str = m.group(1), m.group(2).lower(), m.group(3)
        mon_num = _MONTH_NAME_TO_INT.get(mon_str) or _MONTH_NAME_TO_INT.get(mon_str[:3])
        if mon_num:
            try:
                return date(int(y_str), mon_num, int(d_str))
            except ValueError:
                pass
    m2 = re.search(r"\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b", val_clean)
    if m2:
        try:
            return date(int(m2.group(1)), int(m2.group(2)), int(m2.group(3)))
        except ValueError:
            pass
    m3 = re.search(r"\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b", val_clean)
    if m3:
        try:
            return date(int(m3.group(3)), int(m3.group(2)), int(m3.group(1)))
        except ValueError:
            pass
    return None


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
        if cand and 6 <= len(cand) <= 140 and _TITLE_WORDS.search(cand) and not re.match(r"^(this|the|whereas|test\s+data)\b", cand, re.I):
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
    ("Class", ("classification society", "class survey", "class society", "classification services")),
    ("Flag - Statutory", ("flag state", "statutory", "maritime administration", "registry")),
    ("Management", ("ship management", "technical management", "crew management", "manager")),
    ("Supply", ("supply of", "purchase order", "spare parts", "supplier", "provisions", "lubricant")),
    ("Service", ("service", "maintenance", "amc", "repair", "inspection", "calibration")),
]

_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_PHONE_RE = re.compile(r"(?:tel|phone|mobile|mob|contact)\.?\s*(?:no\.?)?\s*[:\-]?\s*(\+?[\d][\d\s()\-]{6,20}\d)", re.IGNORECASE)
_AUTO_RENEW_RE = re.compile(r"\b(?:auto(?:matic(?:ally)?)?[\s-]*renew(?:al|ed|s)?|renew(?:ed)?\s+automatically|tacit(?:ly)?\s+renew)", re.IGNORECASE)
_NO_AUTO_RENEW_RE = re.compile(r"\b(?:shall\s+not|will\s+not|not\s+be|no\b|false\b)\s+(?:be\s+)?(?:auto(?:matically)?\s+)?renew", re.IGNORECASE)
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


# ─────────────────────────────────────────────────────────────────────────────
# 1. Structured Table / Term Sheet Parser
# ─────────────────────────────────────────────────────────────────────────────

_TABLE_LABELS: list[tuple[str, list[str]]] = [
    ("contract_number", [r"contract\s*(?:no\.?|number)", r"agreement\s*(?:no\.?|number)"]),
    ("external_contract_number", [r"external\s*contract\s*(?:no\.?|number)", r"external\s*(?:ref|reference)"]),
    ("contract_title", [r"contract\s*title", r"agreement\s*title", r"title\s*of\s*agreement"]),
    ("description", [r"brief\s*description", r"description", r"scope\s*of\s*(?:work|services?)"]),
    ("category", [r"contract\s*category", r"category"]),
    ("business_unit", [r"business\s*unit", r"department", r"division"]),
    ("owner", [r"contract\s*owner(?:\s*/\s*pic)?", r"person\s*in\s*charge", r"\bpic\b"]),
    ("status", [r"status"]),
    ("confidentiality", [r"confidentiality"]),
    ("first_party", [r"first\s*party(?:\s*/\s*company)?", r"party\s*a", r"company\s*name"]),
    ("second_party", [r"second\s*party(?:\s*/\s*counterparty)?", r"party\s*b", r"counterparty", r"vendor", r"service\s*provider"]),
    ("applicable_vessel", [r"applicable\s*vessels?(?:\s*/\s*projects?)?", r"vessels?(?:\s*/\s*projects?)?"]),
    ("contract_date", [r"contract\s*date", r"agreement\s*date", r"signed\s*date", r"date\s*of\s*agreement"]),
    ("effective_date", [r"effective(?:\s*/\s*commencement)?\s*date", r"commencement\s*date", r"start\s*date"]),
    ("initial_expiry_date", [r"initial\s*expiry\s*date"]),
    ("expiry_date", [r"current\s*expiry\s*date", r"expiry\s*date", r"expiration\s*date", r"end\s*date"]),
    ("auto_renewal", [r"auto[\s-]*renewal", r"automatic\s*renewal"]),
    ("renewal_period", [r"renewal\s*period"]),
    ("notice_period", [r"termination(?:\s*/\s*non[\s-]*renewal)?\s*notice\s*period", r"notice\s*period"]),
]


def _parse_party_details(raw: str) -> dict[str, str | None]:
    if not raw:
        return {}
    parts = [p.strip() for p in raw.split("|") if p.strip()]
    name = parts[0] if parts else raw
    pic = None
    email = None
    phone = None
    address = None

    email_m = re.search(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", raw)
    if email_m:
        email = email_m.group(0)

    pic_m = re.search(r"\bPIC\s*[:\-–]?\s*([^|]+)", raw, re.I)
    if pic_m:
        pic = pic_m.group(1).strip()

    phone_m = re.search(r"(\+?\d[\d\s\-()]{7,18}\d)", raw)
    if phone_m:
        phone = phone_m.group(1).strip()

    if len(parts) > 1:
        if not re.search(r"\bPIC\b|\b[A-Za-z0-9._%+-]+@|\+\d", parts[1], re.I):
            address = parts[1]

    return {"name": name, "pic": pic, "email": email, "phone": phone, "address": address}


def _extract_from_table(text: str) -> dict[str, Any]:
    lines = [re.sub(r"[ \t]+", " ", l).strip() for l in text.splitlines() if l.strip()]
    full_text = "\n".join(lines)
    all_patterns = []
    for key, pats in _TABLE_LABELS:
        for p in pats:
            pattern = rf"(?:^|\n)\s*(?:\d+[\s\.\-]+)?({p})\s*[:\-|–]?\s*"
            all_patterns.append((key, pattern))

    matches = []
    for key, pat in all_patterns:
        for m in re.finditer(pat, full_text, flags=re.IGNORECASE):
            matches.append((m.start(), m.end(), key, m.group(1)))

    matches.sort(key=lambda x: x[0])
    filtered = []
    last_end = -1
    for start, end, key, label_str in matches:
        if start >= last_end:
            filtered.append((start, end, key, label_str))
            last_end = end

    extracted: dict[str, str] = {}
    for i, (start, end, key, label_str) in enumerate(filtered):
        if key in extracted and extracted[key]:
            continue
        next_start = filtered[i + 1][0] if i + 1 < len(filtered) else len(full_text)
        val = full_text[end:next_start].strip()
        val = re.sub(r"^[:\-|–\t ]+", "", val).strip()
        val = re.sub(r"\s+", " ", val).strip()
        extracted[key] = val

    res: dict[str, Any] = {}
    if "contract_title" in extracted:
        res["agreement_name"] = extracted["contract_title"]
    if "description" in extracted:
        res["description"] = extracted["description"]
    if "category" in extracted:
        res["category"] = extracted["category"]
    if "business_unit" in extracted:
        res["business_unit"] = extracted["business_unit"]

    # Reference / Contract No
    ref = extracted.get("external_contract_number") or extracted.get("contract_number")
    if ref:
        ref_clean = ref.split("·")[0].split("Status")[0].strip()
        res["vendor_reference"] = ref_clean

    # Parties
    fp = _parse_party_details(extracted.get("first_party", ""))
    sp = _parse_party_details(extracted.get("second_party", ""))
    if fp.get("name"):
        res["first_party_name"] = fp["name"]
        res["first_party_pic"] = fp.get("pic")
        res["first_party_email"] = fp.get("email")
        res["first_party_phone"] = fp.get("phone")
        res["first_party_address"] = fp.get("address")

    if sp.get("name"):
        res["second_party_name"] = sp["name"]
        res["vendor"] = sp["name"]
        res["second_party_pic"] = sp.get("pic")
        res["second_party_email"] = sp.get("email")
        res["second_party_phone"] = sp.get("phone")
        res["second_party_address"] = sp.get("address")

    # Dates
    if "contract_date" in extracted:
        cd = _parse_explicit_date(extracted["contract_date"])
        if cd:
            res["contract_date"] = cd.isoformat()

    eff_str = extracted.get("effective_date")
    if eff_str:
        ed = _parse_explicit_date(eff_str)
        if ed:
            res["issue_date"] = ed.isoformat()

    exp_str = extracted.get("expiry_date") or extracted.get("initial_expiry_date")
    if exp_str:
        if re.search(r"\bno\s+expiry\b|\bperpetual\b|\bindefinite\b|\bnot\s+applicable\b|\bnone\b", exp_str, re.I):
            res["no_expiry"] = True
            res["expiry_date"] = None
        else:
            exp_d = _parse_explicit_date(exp_str)
            if exp_d:
                res["expiry_date"] = exp_d.isoformat()
                res["no_expiry"] = False

    # Auto renewal
    ar_str = extracted.get("auto_renewal", "")
    if re.search(r"^\s*(?:no|false|n/?a|not\s+applicable|nil|none)\b", ar_str, re.I):
        res["auto_renewal"] = False
    elif re.search(r"^\s*(?:yes|true)\b", ar_str, re.I):
        res["auto_renewal"] = True

    # Applicable vessels
    av_str = extracted.get("applicable_vessel", "").lower()
    if re.search(r"\ball\s+vessels\b|\ball\s+ships\b|\bfleet\b", av_str):
        res["applies_to_all_ships"] = True
        res["applies_to"] = "all_ships"

    return res


# ─────────────────────────────────────────────────────────────────────────────
# 2. AI Extraction Fallback (Azure OpenAI / Copilot)
# ─────────────────────────────────────────────────────────────────────────────

def _ai_extract_service_agreement(text: str) -> dict[str, Any] | None:
    """Invokes Azure OpenAI when configured to parse non-standard contracts."""
    try:
        from ..copilot import config as copilot_cfg
        if not copilot_cfg.is_configured():
            return None
        import httpx
        system_prompt = (
            "You are a maritime contract data extraction assistant. "
            "Extract contract details from the provided text into a JSON object with keys: "
            "agreement_name, description, category, business_unit, vendor_reference, "
            "first_party_name, second_party_name, second_party_email, second_party_phone, second_party_pic, "
            "contract_date (YYYY-MM-DD), issue_date (YYYY-MM-DD), expiry_date (YYYY-MM-DD or null), "
            "no_expiry (boolean), auto_renewal (boolean), applies_to_all_ships (boolean). "
            "Return ONLY raw valid JSON."
        )
        url = (
            f"{copilot_cfg.AZURE_OPENAI_ENDPOINT}/openai/deployments/"
            f"{copilot_cfg.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version={copilot_cfg.AZURE_OPENAI_API_VERSION}"
        )
        headers = {"api-key": copilot_cfg.AZURE_OPENAI_API_KEY, "Content-Type": "application/json"}
        payload = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text[:4000]}
            ],
            "temperature": 0.0,
            "max_tokens": 800,
        }
        with httpx.Client(timeout=12.0) as client:
            resp = client.post(url, headers=headers, json=payload)
            if resp.status_code == 200:
                raw_json = resp.json()["choices"][0]["message"]["content"]
                raw_json = re.sub(r"^```(?:json)?\s*", "", raw_json.strip())
                raw_json = re.sub(r"\s*```$", "", raw_json.strip())
                return json.loads(raw_json)
    except Exception as exc:
        log.debug("AI service agreement extraction fallback skipped: %s", exc)
    return None


# ─────────────────────────────────────────────────────────────────────────────
# 3. Main Extraction Pipeline
# ─────────────────────────────────────────────────────────────────────────────

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

    # Pass 1: Structured Table Parser
    table_fields = _extract_from_table(text)

    # Pass 2: Fallback to AI if core fields are missing and AI is enabled
    ai_fields: dict[str, Any] = {}
    if not table_fields.get("agreement_name") or not table_fields.get("second_party_name"):
        ai_fields = _ai_extract_service_agreement(text) or {}
        # External Contract Number is office-assigned only, never read from the document —
        # even if the model hands one back anyway.
        ai_fields.pop("vendor_reference", None)

    # Pass 3: Heuristic Regex Fallback
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
    heuristic_renewal = extract_renewal(text)

    heuristic_fields: dict[str, Any] = {
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
        "no_expiry": False,
        "validity_months": period_months,
        "applies_to_all_ships": all_ships,
        "applies_to": "all_ships" if all_ships else ("vessels" if ships else None),
        "vessel_ids": [v.id for v in ships],
        "vessel_names": [v.name for v in ships],
        **heuristic_renewal,
    }

    # Merge with precedence: Table Extraction > AI Fallback > Heuristics
    fields: dict[str, Any] = {**heuristic_fields}
    for k, v in ai_fields.items():
        if v is not None and v != "":
            fields[k] = v
    for k, v in table_fields.items():
        if v is not None and v != "":
            fields[k] = v

    # Category alignment: ensure it matches an official category if possible
    if fields.get("category") and categories:
        cat_lower = fields["category"].strip().lower()
        matched_cat = next((c for c in categories if c.lower() == cat_lower), None)
        if matched_cat:
            fields["category"] = matched_cat

    # Applies to alignment
    if fields.get("applies_to_all_ships"):
        fields["applies_to"] = "all_ships"
        fields["vessel_ids"] = []
        fields["vessel_names"] = []

    labels = {
        "agreement_name": "Contract Title",
        "description": "Brief Description",
        "category": "Contract Category",
        "second_party_name": "Second Party",
        "issue_date": "Effective Date",
    }
    # Expiry Date is only required if not marked as no_expiry
    if not fields.get("no_expiry"):
        labels["expiry_date"] = "Expiry Date"

    undetected = [label for key, label in labels.items() if not fields.get(key)]
    return {
        "success": True,
        "fields": fields,
        "undetected_fields": undetected,
        "text_length": len(text),
    }
