"""Automated Certificate Document Text Extraction & Maritime Metadata Parser.

Provides:
- Native PDF & scanned OCR text extraction.
- Automatic detection of Date of Issue and Expiry Date (including permanent validity & bilingual certificates).
- Smart matching of certificate titles against database CertificateMaster catalog.
- Extraction of Certificate Number, Issuing Authority, and Vessel (IMO/Name).
"""
from __future__ import annotations

import logging
import os
import re
from datetime import date, datetime
from typing import Any

import dateutil.parser

from ..db import models

logger = logging.getLogger("vessel_dms.certificate_extractor")

MONTH_PATTERN = (
    r"(?:January|February|March|April|May|June|July|August|September|October|November|December|"
    r"Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)"
)

SPANISH_MONTHS: dict[str, int] = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
}

ISSUE_KEYWORDS = [
    "was issued",
    "issued and",
    "date of issue",
    "date of issuance",
    "issued at",
    "issued on",
    "date of completion of the survey",
    "completion date of the survey",
    "date of completion",
    "date of inspection",
    "date of first registration",
    "date of registry",
    "registration date",
    "date of verification",
    "date of renewal survey",
    "issuing date",
    "issue date",
    "date issued",
    "course completion date",
    "completed on",
    "date of course",
    "survey date",
    "issued under the provisions",
    "dated at",
    "dated on",
    "dated",
    "fecha de expedici",
    "expedida y firmada",
    "fue expedida",
    "fecha de primer registro",
    "fecha de registro",
    "done at",
    "given under my hand at",
    "signed at",
    "verified at",
    "place of issued",
    "issued in",
    "effective date",
]

EXPIRY_KEYWORDS = [
    "valid until",
    "date of expiry",
    "expiry date",
    "expires on",
    "valid to",
    "expiration date",
    "subject to annual surveys until",
    "valid through",
    "valid up to",
    "fecha de vencimiento",
    "vence el",
    "vigente hasta",
    "until",
    "due date",
    "this certificate is valid until",
    "this document is valid until",
    "extended to",
    "extended until",
    "extension until",
    "interim certificate expires on",
    "validity up to",
]

PERMANENT_PATTERNS = [
    re.compile(r"\bcontinuous\s+validity\b", re.IGNORECASE),
    re.compile(r"\bpermanent\s+validity\b", re.IGNORECASE),
    re.compile(r"\bpermanent\s+certificate\b", re.IGNORECASE),
    re.compile(r"\bdoes\s+not\s+expire\b", re.IGNORECASE),
    re.compile(r"\bno\s+expiry\s+date\b", re.IGNORECASE),
    re.compile(r"\bwithout\s+expiry\b", re.IGNORECASE),
    re.compile(r"\bunlimited\s+validity\b", re.IGNORECASE),
    re.compile(r"\bvalid\s+until\s+cancelled\b", re.IGNORECASE),
    re.compile(r"\bvalid\s+as\s+of\b", re.IGNORECASE),
    re.compile(r"\bvigent[es]*\s+a\s+su\s+fecha\b", re.IGNORECASE),
    re.compile(r"\bownership\s+and\s+encumbrances\b", re.IGNORECASE),
    re.compile(r"\bstatement\s+of\s+fact[s]?\b", re.IGNORECASE),
    re.compile(r"\bvalid\s+for\s+the\s+life\s+of\b", re.IGNORECASE),
    re.compile(r"\blife\s+of\s+the\s+engine\b", re.IGNORECASE),
    re.compile(r"\bfor\s+the\s+life\s+of\s+(?:the\s+)?(?:engine|vessel|ship)\b", re.IGNORECASE),
    re.compile(r"\bdocument\s+of\s+authorization\b", re.IGNORECASE),
    re.compile(r"\bapproval\s+of\s+ship['’]?s\s+plans\b", re.IGNORECASE),
    re.compile(r"\bcarriage\s+of\s+bulk\s+grain\b", re.IGNORECASE),
    re.compile(r"\bgrain\s+loading\s+stability\b", re.IGNORECASE),
    re.compile(r"\bvalid\s+indefinitely\b", re.IGNORECASE),
    re.compile(r"\bindefinite\s+validity\b", re.IGNORECASE),
    re.compile(r"\bcontinuous\s+synopsis\s+record\b", re.IGNORECASE),
    re.compile(r"\b(?:international\s+)?tonnage\s+certificate\b", re.IGNORECASE),
    re.compile(r"\bitc[\s\-]?69\b", re.IGNORECASE),
    re.compile(r"\bpermanent\b", re.IGNORECASE),
    # Course / training completion and familiarisation records carry no expiry date.
    re.compile(r"\bsuccessfully\s+completed\b", re.IGNORECASE),
    re.compile(r"\bpre[\s\-]?joining\b", re.IGNORECASE),
    re.compile(r"\bfamili[sz]ation\b", re.IGNORECASE),
    re.compile(r"\btraining\s+(?:certificate|course|completion)\b", re.IGNORECASE),
    re.compile(r"\bcertificate\s+of\s+(?:completion|attendance|participation)\b", re.IGNORECASE),
]

KNOWN_AUTHORITIES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\b(?:Nippon\s+Kaiji\s+Kyokai|ClassNK|NKK)\b", re.IGNORECASE), "ClassNK"),
    (re.compile(r"\b(?:Det\s+Norske\s+Veritas|DNV(?:\s*GL)?)\b", re.IGNORECASE), "DNV"),
    (re.compile(r"\b(?:American\s+Bureau\s+of\s+Shipping|ABS)\b", re.IGNORECASE), "American Bureau of Shipping (ABS)"),
    (re.compile(r"\b(?:Lloyd'?s\s+Register|LR)\b", re.IGNORECASE), "Lloyd's Register"),
    (re.compile(r"\b(?:Bureau\s+Veritas|BV)\b", re.IGNORECASE), "Bureau Veritas"),
    (re.compile(r"\b(?:Registro\s+Italiano\s+Navale|RINA)\b", re.IGNORECASE), "RINA"),
    (re.compile(r"\b(?:Korean\s+Register|KR)\b", re.IGNORECASE), "Korean Register"),
    (re.compile(r"\b(?:China\s+Classification\s+Society|CCS)\b", re.IGNORECASE), "China Classification Society"),
    (re.compile(r"\b(?:Indian\s+Register\s+of\s+Shipping|IRClass|IRS)\b", re.IGNORECASE), "Indian Register of Shipping (IRClass)"),
    (re.compile(r"\b(?:Polski\s+Rejestr\s+Statk[oó]w|Polish\s+Register\s+of\s+Shipping|PRS)\b", re.IGNORECASE), "Polish Register of Shipping (PRS)"),
    (re.compile(r"\b(?:T[uü]rk\s+Loydu|Turkish\s+Lloyd)\b", re.IGNORECASE), "Türk Loydu"),
    (re.compile(r"\b(?:Republic\s+of\s+the\s+Marshall\s+Islands|Marshall\s+Islands\s+Maritime)\b", re.IGNORECASE), "Republic of the Marshall Islands"),
    (re.compile(r"\b(?:Republic\s+of\s+Panama|Panama\s+Maritime\s+Authority|Autoridad\s+Mar[íi]tima\s+de\s+Panam[áa])\b", re.IGNORECASE), "Panama Maritime Authority"),
    (re.compile(r"\b(?:Republic\s+of\s+Liberia|Liberian\s+Registry|LISCR)\b", re.IGNORECASE), "Liberian Registry"),
    (re.compile(r"\b(?:Maritime\s+and\s+Port\s+Authority\s+of\s+Singapore|MPA\s+Singapore)\b", re.IGNORECASE), "Maritime and Port Authority of Singapore"),
    (re.compile(r"\b(?:Bahamas\s+Maritime\s+Authority|Commonwealth\s+of\s+[Tt]he\s+Bahamas)\b", re.IGNORECASE), "Bahamas Maritime Authority"),
    (re.compile(r"\b(?:Malta\s+Transport|Transport\s+Malta|Merchant\s+Shipping\s+Directorate)\b", re.IGNORECASE), "Transport Malta"),
    (re.compile(r"\b(?:Cyprus\s+Department\s+of\s+Merchant\s+Shipping|Shipping\s+Deputy\s+Ministry\s+of\s+Cyprus)\b", re.IGNORECASE), "Cyprus Maritime Administration"),
    (re.compile(r"\b(?:Isle\s+of\s+Man\s+Ship\s+Registry)\b", re.IGNORECASE), "Isle of Man Ship Registry"),
    (re.compile(r"\b(?:Hong\s+Kong\s+Marine\s+Department|HKMD)\b", re.IGNORECASE), "Hong Kong Marine Department"),
    (re.compile(r"\b(?:Cayman\s+Islands\s+Shipping\s+Registry|MACI)\b", re.IGNORECASE), "Cayman Islands Shipping Registry"),
    (re.compile(r"\b(?:Antigua\s+and\s+Barbuda\s+Department\s+of\s+Marine\s+Services|ADOMS)\b", re.IGNORECASE), "Antigua & Barbuda Marine Services"),
    (re.compile(r"\b(?:Bermuda\s+Shipping\s+and\s+Maritime\s+Authority)\b", re.IGNORECASE), "Bermuda Shipping Authority"),
    (re.compile(r"\b(?:United\s+States\s+Coast\s+Guard|US\s+Coast\s+Guard|USCG)\b", re.IGNORECASE), "United States Coast Guard"),
    (re.compile(r"\b(?:Government\s+of\s+Japan|Ministry\s+of\s+Land,\s*Infrastructure,\s*Transport)\b", re.IGNORECASE), "Government of Japan"),
    (re.compile(r"\b(?:Panama\s+Canal\s+Authority|Autoridad\s+del\s+Canal\s+de\s+Panam[aá])\b", re.IGNORECASE), "Panama Canal Authority"),
    (re.compile(r"\b(?:Suez\s+Canal\s+Authority)\b", re.IGNORECASE), "Suez Canal Authority"),
    (re.compile(r"\bAnglo[\s\-]?Eastern\b", re.IGNORECASE), "Anglo-Eastern"),
    (re.compile(r"\bOzellar\s+Marine(?:\s+Private\s+Limited)?\b", re.IGNORECASE), "Ozellar Marine Private Limited"),
]

# Training centres / companies that issue course certificates are rarely in the list above, so also
# read the name that follows "issued by" / "certified by" / "conducted by" (single line, org suffix).
_ORG_SUFFIX = r"(?:Private\s+Limited|Pvt\.?\s*Ltd\.?|Limited|Ltd\.?|LLC|Inc\.?|GmbH|Co\.?|Academy|Institute|Training\s+(?:Centre|Center)|Maritime\s+Academy|Shipping|Marine)"
_ISSUED_BY_RE = re.compile(
    rf"\b(?:issued|certified|conducted|awarded|approved)\s+by\s*[:\-]?\s*([A-Z][A-Za-z0-9&.,'\- ]{{2,70}}?\s{_ORG_SUFFIX})\b",
    re.IGNORECASE,
)

ACRONYM_KEYWORDS_MAP: dict[str, list[str]] = {
    "Cargo Ship Safety Construction Certificate": ["safcon", "safety construction", "cargo ship safety construction"],
    "Cargo Ship Safety Equipment Certificate": ["safeq", "safety equipment", "cargo ship safety equipment"],
    "Cargo Ship Safety Radio Certificate": ["safrad", "safety radio", "cargo ship safety radio"],
    "Safety Management Certificate (SMC)": ["smc", "safety management certificate", "ism code"],
    "Document of Compliance (DOC)": ["document of compliance", "company ism", "ism doc"],
    "Statement of Fact": ["statement of fact", "statement of facts", "sof"],
    "International Ship Security Certificate (ISSC)": ["issc", "ship security certificate", "isps code"],
    "Maritime Labour Convention Certificate (MLC)": ["mlc", "maritime labour", "maritime labor", "mlc 2006", "mlc-2006"],
    "International Oil Pollution Prevention Certificate (IOPP)": ["iopp", "oil pollution prevention", "marpol annex i"],
    "Engine International Air Pollution Prevention Certificate (EIAPP)": ["eiapp", "engine international air pollution", "nox technical code", "marine diesel engine"],
    "Engine International Air Pollution Prevention Certificate": ["eiapp", "engine international air pollution", "nox technical code", "marine diesel engine"],
    "International Air Pollution Prevention Certificate (IAPP)": ["iapp", "air pollution prevention", "marpol annex vi"],
    "International Sewage Pollution Prevention Certificate (ISPP)": ["ispp", "sewage pollution prevention", "marpol annex iv"],
    "International Energy Efficiency Certificate (IEEC)": ["ieec", "energy efficiency certificate", "eedi", "eeexi"],
    "Ballast Water Management Certificate (BWMC)": ["bwmc", "bwm", "ballast water management", "bwm convention"],
    "Anti-Fouling System Certificate (AFS)": ["afs", "anti-fouling", "anti fouling", "afs convention"],
    "Certificate of Class (Hull & Machinery)": ["certificate of class", "class certificate", "hull and machinery", "hull & machinery"],
    "International Load Line Certificate": ["load line", "loadline", "illc", "international load line"],
    "International Tonnage Certificate (ITC 69)": ["tonnage certificate", "itc 69", "itc-69", "itc69", "international tonnage"],
    "Certificate of Registry": [
        "certificate of registry",
        "registry certificate",
        "certificate of british registry",
        "certificate of panama registry",
        "ownership and encumbrances",
        "certificado de propiedad y grav",
        "coe",
    ],
    "Minimum Safe Manning Document (MSMD)": ["minimum safe manning", "safe manning document", "msmd"],
    "Ship Radio Station License": ["radio station license", "ship radio license", "radio station licence", "telecommunications licence"],
    "Continuous Synopsis Record (CSR)": ["continuous synopsis record", "csr document", "csr file"],
    "Bunker Convention Certificate (CLC)": ["bunker convention", "clc certificate", "bunker clc", "civil liability convention"],
    "Wreck Removal Convention Certificate": ["wreck removal", "nairobi international convention", "wrc"],
    "Certificate of Financial Responsibility (COFR)": ["cofr", "financial responsibility", "oil pollution act"],
    "Panama Canal Special Tonnage Certificate": ["panama canal special tonnage", "panama canal tonnage", "pc/ums"],
    "Suez Canal Special Tonnage Certificate": ["suez canal special tonnage", "suez canal tonnage"],
}


def parse_date_str(val: str) -> date | None:
    """Safely parse a date string into a datetime.date object."""
    if not val:
        return None
    val = val.strip()

    # Remove ordinal suffixes: 1st, 2nd, 3rd, 15th, 24th
    val = re.sub(r"(\d+)(?:st|nd|rd|th)\b", r"\1", val, flags=re.IGNORECASE)

    # 1. ISO format: YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
    iso_match = re.search(r"\b(20\d\d|19\d\d)[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b", val)
    if iso_match:
        try:
            return date(int(iso_match.group(1)), int(iso_match.group(2)), int(iso_match.group(3)))
        except ValueError:
            pass

    # 2. General fuzzy parsing with fallback default
    try:
        default_dt = datetime(2000, 1, 1)
        dt = dateutil.parser.parse(val, fuzzy=True, dayfirst=True, default=default_dt)
        if 1990 <= dt.year <= 2050:
            return dt.date()
    except Exception:
        pass

    return None


def parse_spanish_date(text: str) -> date | None:
    """Parse Spanish date expressions (e.g. '2 de julio de 2026' or '13 de noviembre de 2023')."""
    m = re.search(
        r"\b([0-2]?\d|3[01])\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+(20\d\d|19\d\d)\b",
        text,
        re.IGNORECASE,
    )
    if m:
        try:
            day = int(m.group(1))
            month = SPANISH_MONTHS[m.group(2).lower()]
            year = int(m.group(3))
            return date(year, month, day)
        except Exception:
            pass
    return None


def find_date_in_window(window: str, pick_last: bool = False) -> date | None:
    """Find the most likely date within a text window following or preceding a keyword."""
    if not window:
        return None

    # Replace newlines with spaces so multiline dates are recognized
    clean_window = re.sub(r"[\r\n]+", " ", window)
    candidates: list[tuple[int, date]] = []

    # 1. Spanish date format (e.g. '2 de julio de 2026')
    for m in re.finditer(
        r"\b([0-2]?\d|3[01])\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+(20\d\d|19\d\d)\b",
        clean_window,
        re.IGNORECASE,
    ):
        sd = parse_spanish_date(m.group(0))
        if sd:
            candidates.append((m.start(), sd))

    # 2. Named months with day: 15th October 2024, 15 Oct 2024, 15-Oct-2024
    for m in re.finditer(
        rf"\b(?:[0-2]?\d|3[01])(?:st|nd|rd|th)?[\s\-\/\.]+{MONTH_PATTERN}[\s\-\/\.,]+(?:20\d\d|19\d\d)\b",
        clean_window,
        re.IGNORECASE,
    ):
        d = parse_date_str(m.group(0))
        if d:
            candidates.append((m.start(), d))

    # 3. Named month first: October 15, 2024 or July 2nd, 2026
    for m in re.finditer(
        rf"\b{MONTH_PATTERN}[\s\-\/\.]+(?:[0-2]?\d|3[01])(?:st|nd|rd|th)?[\s\-\/\.,]+(?:20\d\d|19\d\d)\b",
        clean_window,
        re.IGNORECASE,
    ):
        d = parse_date_str(m.group(0))
        if d:
            candidates.append((m.start(), d))

    # 4. Numeric dates: YYYY-MM-DD or DD-MM-YYYY or DD.MM.YYYY
    for m in re.finditer(
        r"\b(?:(?:20\d\d|19\d\d)[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])|"
        r"(?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.](?:20\d\d|19\d\d))\b",
        clean_window,
    ):
        d = parse_date_str(m.group(0))
        if d:
            candidates.append((m.start(), d))

    # 5. Month and Year only fallback (e.g. "November , 2028" or "November 2028")
    if not candidates:
        for m5 in re.finditer(
            rf"\b{MONTH_PATTERN}[\s\-\/\.,]+(?:20\d\d|19\d\d)\b",
            clean_window,
            re.IGNORECASE,
        ):
            d = parse_date_str(m5.group(0))
            if d:
                candidates.append((m5.start(), d))

    if not candidates:
        return None

    candidates.sort(key=lambda x: x[0])
    return candidates[-1][1] if pick_last else candidates[0][1]


def extract_dates(text: str) -> tuple[date | None, date | None, bool]:
    """Extract (issue_date, expiry_date, has_no_expiry) from document text."""
    if not text:
        return None, None, False

    lower_text = text.lower()
    issue_date: date | None = None
    expiry_date: date | None = None
    has_no_expiry: bool = False

    # Check for permanent / continuous validity
    for pat in PERMANENT_PATTERNS:
        if pat.search(text):
            has_no_expiry = True
            break

    # 1. Search for Issue Date
    for kw in ISSUE_KEYWORDS:
        pos = 0
        while True:
            idx = lower_text.find(kw, pos)
            if idx == -1:
                break
            # 1a. Check following window (Western layout: "Date of issue: 25 July 2026")
            win_after = text[idx + len(kw) : idx + len(kw) + 180]
            d = find_date_in_window(win_after, pick_last=False)
            if not d:
                # 1b. Check preceding window (ClassNK / Asian layout: "25 July 2026\n(Date of Issue)")
                win_before = text[max(0, idx - 80) : idx]
                d = find_date_in_window(win_before, pick_last=True)
            if d:
                issue_date = d
                break
            pos = idx + len(kw)
        if issue_date:
            break

    # 2. Search for Expiry Date (if not permanent)
    if not has_no_expiry:
        for kw in EXPIRY_KEYWORDS:
            pos = 0
            while True:
                idx = lower_text.find(kw, pos)
                if idx == -1:
                    break
                win_after = text[idx + len(kw) : idx + len(kw) + 180]
                d = find_date_in_window(win_after, pick_last=False)
                if not d:
                    win_before = text[max(0, idx - 80) : idx]
                    d = find_date_in_window(win_before, pick_last=True)
                if d:
                    expiry_date = d
                    break
                pos = idx + len(kw)
            if expiry_date:
                break

    # Fallback sanity check: if issue_date and expiry_date both exist but expiry < issue, swap them
    if issue_date and expiry_date and expiry_date < issue_date:
        issue_date, expiry_date = expiry_date, issue_date

    return issue_date, expiry_date, has_no_expiry


def extract_certificate_number(text: str) -> str | None:
    """Extract Certificate Number using regex patterns."""
    if not text:
        return None

    # Strip cited references inside parentheses like (Doc. No.: 10421-2, dated on ...)
    clean_text = re.sub(r"\([^)]*Doc\.?\s*No\.?[^)]*\)", "", text, flags=re.IGNORECASE)

    patterns = [
        # ClassNK / Maritime tabular layout where value precedes "(No.)"
        # e.g.:
        #   26HN010800-CG
        #   (No.)
        re.compile(
            r"\b([A-Za-z0-9][A-Za-z0-9\-\/\.]{3,34})\s*\n[ \t]*\((?:No\.?|Doc\.?\s*No\.?|Certificate\s+No\.?|Number)\)",
            re.IGNORECASE,
        ),
        # Explicit Certificate / Document Number in header or labeled line
        re.compile(
            r"(?<!Class\s)(?<!IMO\s)(?:certificate\s+no|cert\s+no|certificate\s+number)\.?\s*[:#\s]\s*([A-Za-z0-9\-\/\.]{4,35})",
            re.IGNORECASE,
        ),
        re.compile(
            r"(?:document\s+number|n[úu]mero\s+de\s+documento)\.?\s*[:#\s]\s*([A-Za-z0-9\-\/\.]{4,35})",
            re.IGNORECASE,
        ),
        re.compile(
            r"(?:application\s+number|n[úu]mero\s+de\s+solicitud)\.?\s*[:#\s]\s*([A-Za-z0-9\-\/\.]{4,35})",
            re.IGNORECASE,
        ),
        # Header "No. KC26HN010800-EALC" or "No: ..." (ignoring "Class No", "IMO No", "Hull No")
        re.compile(
            r"(?<!Class\s)(?<!IMO\s)(?<!Hull\s)\bNo\.?\s*[:#\s]\s*([A-Za-z0-9\-\/\.]{5,35})",
            re.IGNORECASE,
        ),
        re.compile(r"\b(?:Cert|Certificate)\s*#\s*([A-Za-z0-9\-\/\.]{4,35})", re.IGNORECASE),
        re.compile(r"\bdoc(?:ument)?\s+no\.?\s*[:#\s]\s*([A-Za-z0-9\-\/\.]{4,35})", re.IGNORECASE),
        # Maritime Registration / Official / License / Form / Approval numbers
        re.compile(
            r"(?<!Class\s)(?<!IMO\s)(?:registration\s+no|reg\s+no|official\s+no|licen[sc]e\s+no|approval\s+no|form\s+no)\.?\s*[:#\s]\s*([A-Za-z0-9\-\/\.]{4,35})",
            re.IGNORECASE,
        ),
    ]

    blacklist = {
        "solas", "marpol", "convention", "issued", "regulation",
        "mortgages", "encumbrances", "pending", "there", "entries", "against",
        "certificate", "document", "authorization", "statement", "provisional",
        "management", "compliance", "inspection", "authority", "statutory", "registry",
    }

    for pat in patterns:
        for m in pat.finditer(clean_text):
            candidate = m.group(1).strip().rstrip(".,;")
            if candidate.lower() in blacklist:
                continue
            # A valid certificate number must contain at least one digit
            if not any(c.isdigit() for c in candidate):
                continue
            # If purely digits, must be at least 4 digits
            if candidate.isdigit() and len(candidate) < 4:
                continue
            if len(candidate) >= 4:
                return candidate

    return None


def extract_issuing_authority(text: str, fallback_authority: str | None = None) -> str:
    """Detect Classification Society or Flag Administration that issued the document."""
    if not text:
        return fallback_authority or "Classification Society"

    # 1. Check explicit "Issued by: ..." line first (Recognized Organization / Society that signed it)
    issued_by_match = re.search(
        r"(?:issued\s+by|signed\s+by|issued\s+under\s+the\s+authority\s+of[^\n]*\bby)\s*[:\s]\s*([^\n]+)",
        text,
        re.IGNORECASE,
    )
    if issued_by_match:
        win = issued_by_match.group(0)
        for pat, name in KNOWN_AUTHORITIES:
            if pat.search(win):
                return name

    # 2. Search primarily within the first 3500 chars (header) where the issuing body is stated
    earliest_pos = float("inf")
    best_authority = None
    header_chunk = text[:3500]
    for pat, name in KNOWN_AUTHORITIES:
        m = pat.search(header_chunk)
        if m and m.start() < earliest_pos:
            earliest_pos = m.start()
            best_authority = name

    if best_authority is not None:
        return best_authority

    # 3. Fallback to full text if no authority found in header
    for pat, name in KNOWN_AUTHORITIES:
        m = pat.search(text)
        if m and m.start() < earliest_pos:
            earliest_pos = m.start()
            best_authority = name

    if best_authority is not None:
        return best_authority

    # 4. Not a known society: read the organisation named after "issued by" (training centres, companies)
    m = _ISSUED_BY_RE.search(re.sub(r"[ \t]+", " ", text))
    if m:
        return re.sub(r"\s+", " ", m.group(1)).strip(" .,-")

    return fallback_authority or "Classification Society"


def match_certificate_master(
    text: str,
    filename: str,
    masters: list[models.CertificateMaster],
) -> tuple[models.CertificateMaster | None, float]:
    """Match extracted text and filename against active CertificateMaster catalog."""
    if not masters:
        return None, 0.0

    f_lower = (filename or "").lower()
    header_chunk = f"{filename}\n{text[:1000]}".lower() if text else f_lower
    body_chunk = text[:3000].lower() if text else ""

    best_master: models.CertificateMaster | None = None
    best_score: float = 0.0

    for master in masters:
        score = 0.0
        m_name_lower = master.name.lower()
        clean_m = re.sub(r"\s*\([^\)]*\)", "", m_name_lower).strip()

        # Filename acronym conflict check: if filename explicitly names another cert type, avoid cross-matching
        if "csr" in f_lower and "csr" not in m_name_lower and "synopsis" not in m_name_lower:
            continue
        if "bwm" in f_lower and "bwm" not in m_name_lower and "ballast" not in m_name_lower:
            continue
        if "coe" in f_lower and "coe" not in m_name_lower and "ownership" not in m_name_lower:
            continue
        if "cg3" in f_lower and "cg3" not in m_name_lower and "cg.3" not in m_name_lower and "crane" not in m_name_lower and "cargo gear" not in m_name_lower:
            continue

        # 1. Exact or direct substring match in header or filename (high confidence)
        if m_name_lower in header_chunk:
            score = max(score, 0.95 + min(0.04, len(clean_m) / 500.0))
        elif len(clean_m) >= 6 and clean_m in header_chunk:
            score = max(score, 0.90 + min(0.04, len(clean_m) / 500.0))
        # 1b. Match in deep body text (lower confidence - incidental citations in other forms)
        elif m_name_lower in body_chunk or (len(clean_m) >= 6 and clean_m in body_chunk):
            score = max(score, 0.70)

        # 2. Check acronym / alias keywords
        alias_list = ACRONYM_KEYWORDS_MAP.get(master.name, [])
        if not alias_list:
            for k, v in ACRONYM_KEYWORDS_MAP.items():
                if k.lower() in m_name_lower or m_name_lower in k.lower():
                    alias_list = v
                    break
        for alias in alias_list:
            if len(alias) <= 5:
                if re.search(rf"\b{re.escape(alias)}\b", header_chunk):
                    score = max(score, 0.92)
                elif re.search(rf"\b{re.escape(alias)}\b", body_chunk):
                    score = max(score, 0.70)
            elif alias in header_chunk:
                score = max(score, 0.88)
            elif alias in body_chunk:
                score = max(score, 0.68)

        # 3. Token overlap with master name in header
        words = [w for w in re.findall(r"\b[a-zA-Z]{3,}\b", clean_m) if w not in ("certificate", "international")]
        if words:
            matched_words = sum(1 for w in words if w in header_chunk)
            overlap = matched_words / len(words)
            if overlap >= 0.75:
                score = max(score, 0.80 + 0.1 * overlap)

        if score > best_score:
            best_score = score
            best_master = master

    # Only return matched master if confidence exceeds auto-mapping threshold (0.75)
    if best_score < 0.75:
        return None, best_score

    return best_master, best_score


def extract_raw_certificate_title(text: str, filename: str = "") -> str | None:
    """Extract candidate certificate title from text (lines ending in CERTIFICATE, STATEMENT, etc.) or filename."""
    if text:
        first_chunk = text[:3000]
        title_patterns = [
            # Continuous Synopsis Record (CSR)
            re.compile(
                r"\b(CONTINUOUS\s+SYNOPSIS\s+RECORD(?:\s+FOR\s+THE\s+SHIP)?)\b",
                re.IGNORECASE,
            ),
            # Document of Authorization / Bulk Grain
            re.compile(
                r"\b(DOCUMENT\s+OF\s+AUTHORIZATION(?:\s+APPROVAL\s+OF\s+SHIP['’]?S\s+PLANS)?(?:\s+FOR\s+THE\s+CARRIAGE\s+OF\s+BULK\s+GRAIN)?)\b",
                re.IGNORECASE,
            ),
            # Document of Compliance Special Requirements Carrying Dangerous Goods
            re.compile(
                r"\b(DOCUMENT\s+OF\s+COMPLIANCE(?:\s+SPECIAL\s+REQUIREMENTS\s+FOR\s+SHIP\s+CARRYING\s+DANGEROUS\s+GOODS)?)\b",
                re.IGNORECASE,
            ),
            # Certificate of Test and Thorough Examination (Cranes/Cargo Gear)
            re.compile(
                r"\b(CERTIFICATE\s+OF\s+TEST\s+AND\s+THOROUGH\s+EXAMINATION(?:\s+OF\s+CRANES\s+OR\s+HOISTS(?:\s+AND\s+THEIR\s+ACCESSORY\s+GEAR)?)?)\b",
                re.IGNORECASE,
            ),
            # Certificate of Ownership and Encumbrances
            re.compile(
                r"\b(CERTIFICATE\s+OF\s+OWNERSHIP\s+AND\s+ENCUMBRANCES)\b",
                re.IGNORECASE,
            ),
            # Titles starting with CERTIFICATE OF / DOCUMENT OF
            re.compile(
                r"\b((?:INTERNATIONAL\s+|CARGO\s+SHIP\s+|INTERIM\s+|PROVISIONAL\s+)?(?:CERTIFICATE|DOCUMENT|STATEMENT)\s+OF\s+[A-Za-z0-9\s,\-–\(\)\/]{3,70})\b",
                re.IGNORECASE,
            ),
            # Standard English Maritime Titles
            re.compile(
                r"\b((?:INTERNATIONAL\s+|CARGO\s+SHIP\s+|INTERIM\s+|PROVISIONAL\s+)?[A-Z][A-Za-z0-9\s,\-–\(\)]{2,70}\s+(?:CERTIFICATE|STATEMENT\s+OF\s+FACT|DOCUMENT\s+OF\s+COMPLIANCE|SAFETY\s+MANAGEMENT\s+CERTIFICATE|RADIO\s+LICENSE|TONNAGE\s+CERTIFICATE|LOAD\s+LINE\s+CERTIFICATE))\b",
                re.IGNORECASE,
            ),
            # Lines ending in CERTIFICATE or CERTIFICADO
            re.compile(
                r"^[ \t]*([A-Z0-9\s,\-–\(\)]{5,80}\s+(?:CERTIFICATE|CERTIFICADO|STATEMENT|APPROVAL))[ \t]*$",
                re.IGNORECASE | re.MULTILINE,
            ),
        ]
        for pat in title_patterns:
            m = pat.search(first_chunk)
            if m:
                cand = m.group(1).strip()
                cand = re.sub(r"\s+", " ", cand)
                cand = re.sub(r"\b([A-Za-z]+)\s+\1\b", r"\1", cand, flags=re.IGNORECASE)
                # Strip trailing labels or headers that bleed into the title line
                cand = re.sub(r"\s+(?:NAME\s+OF\s+SHIP|SHIP\s+NAME|PARTICULARS\s+OF\s+SHIP|FOR\s+THE\s+SHIP).*$", "", cand, flags=re.IGNORECASE).strip()
                if len(cand) >= 8 and not re.match(r"^(THIS IS TO CERTIFY|CERTIFICATE NUMBER|CERTIFICATE NO)\b", cand, re.IGNORECASE):
                    return cand.title()

    if filename:
        clean_fn = re.sub(r"\.[^.]+$", "", filename)
        clean_fn = clean_fn.replace("_", " ").replace("-", " ")
        m = re.search(r"\b((?:Certificate\s+of\s+|Document\s+of\s+)?[A-Za-z0-9\s]{4,60}\s+(?:Certificate|Statement|Approval|Record|CSR))\b", clean_fn, re.IGNORECASE)
        if m:
            cand = re.sub(r"\s+", " ", m.group(1).strip())
            cand = re.sub(r"\b([A-Za-z]+)\s+\1\b", r"\1", cand, flags=re.IGNORECASE)
            return cand.title()

    return None


def extract_vessel_name_from_text(text: str, filename: str = "") -> str | None:
    """Extract ship name from document header/fields or filename fallback."""
    if text:
        ship_patterns = [
            re.compile(
                r"(?:SHIP\s+NAME\s*(?:\/\s*NOMBRE\s+DE\s+LA\s+NAVE)?|NAME\s+OF\s+SHIP|VESSEL\s+NAME|NOMBRE\s+DE\s+LA\s+NAVE)\s*[:#\n]\s*([A-Za-z0-9\s\.\-]{3,40})",
                re.IGNORECASE,
            ),
            re.compile(r"\b(?:M\/V|MV)\s+([A-Za-z0-9\s\.\-]{3,35})\b", re.IGNORECASE),
        ]

        for pat in ship_patterns:
            for m in pat.finditer(text):
                raw_cand = m.group(1).strip()
                for line in raw_cand.splitlines():
                    cand = line.strip()
                    # Remove trailing field labels if any
                    cand = re.sub(r"\s+(?:SHIP\s+ID|IMO|PORT|TYPE|OFFICIAL|CALL).*$", "", cand, flags=re.IGNORECASE).strip()
                    if cand.lower() in (
                        "official number or letters", "official number", "distinctive number or letters",
                        "imo no", "imo no.", "call sign", "port of registry", "de la nave", "of ship", "the vessel",
                    ):
                        continue
                    if len(cand) >= 3:
                        return cand

    # Filename fallback if text did not yield a name (e.g. "Elephanta_Certificate of Ownership.pdf")
    if filename:
        clean_fname = os.path.splitext(os.path.basename(filename))[0]
        prefix_match = re.match(r"^([A-Za-z0-9\s\.\-]{3,35}?)[_\-\–]", clean_fname)
        if prefix_match:
            candidate = prefix_match.group(1).strip()
            if candidate.lower() not in ("certificate", "cert", "statutory", "class", "scan", "doc", "document"):
                return candidate

    return None


def match_vessel(
    text: str,
    vessels: list[models.Vessel],
    filename: str = "",
) -> tuple[models.Vessel | None, float, str | None]:
    """Match vessel by IMO number, Vessel Name from text or filename, and return (matched_vessel, conf, detected_vessel_name)."""
    detected_name = extract_vessel_name_from_text(text, filename)

    if not vessels:
        return None, 0.0, detected_name

    # 1. Match by IMO Number (100% deterministic, with OCR digit repair)
    if text:
        imo_matches = re.findall(r"(?:\bIMO\s*(?:No\.?|Number)?[:\s=]*|\bimo=)([0-9IOl]{7})\b", text, re.IGNORECASE)
        for raw in imo_matches:
            cleaned_imo = raw.replace("O", "0").replace("o", "0").replace("I", "1").replace("l", "1")
            if cleaned_imo.isdigit() and len(cleaned_imo) == 7:
                for v in vessels:
                    if v.imo and v.imo.strip() == cleaned_imo:
                        return v, 1.0, detected_name or v.name

    # 2. Match by exact or detected Vessel Name from text
    if text:
        lower_text = text.lower()
        for v in vessels:
            if not v.name:
                continue
            v_name_lower = v.name.strip().lower()
            if len(v_name_lower) >= 4 and re.search(rf"\b{re.escape(v_name_lower)}\b", lower_text):
                return v, 0.85, detected_name or v.name

    # 3. Match against filename directly
    if filename:
        f_lower = filename.lower()
        for v in vessels:
            if not v.name:
                continue
            v_name_lower = v.name.strip().lower()
            if len(v_name_lower) >= 4 and re.search(rf"\b{re.escape(v_name_lower)}\b", f_lower):
                return v, 0.85, detected_name or v.name

    # 4. Check if detected name matches any vessel in DB closely
    if detected_name:
        d_lower = detected_name.lower()
        for v in vessels:
            if v.name and (v.name.lower() in d_lower or d_lower in v.name.lower()):
                return v, 0.80, detected_name or v.name

    return None, 0.0, detected_name


def extract_text_from_file_bytes(file_bytes: bytes, filename: str) -> str:
    """Extract clean text from PDF or image using PyMuPDF and OCR fallback."""
    if not file_bytes:
        return ""

    fname_lower = (filename or "").lower()

    if fname_lower.endswith(".pdf"):
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            if len(doc) == 0:
                return ""

            sample_indices = list(range(min(len(doc), 4)))
            if len(doc) > 4 and (len(doc) - 1) not in sample_indices:
                sample_indices.append(len(doc) - 1)

            text_chunks = [doc[i].get_text() for i in sample_indices]
            combined_text = "\n".join(text_chunks).strip()

            if len(combined_text) > 50:
                from ..ocr.extract import clean_and_validate_ocr_text
                return clean_and_validate_ocr_text(combined_text)

            logger.info("PDF has insufficient embedded text; running OCR fallback on %s...", filename)
            from ..ocr.extract import extract_text
            return extract_text(file_bytes, filename, "application/pdf")
        except Exception as exc:
            logger.warning("PyMuPDF extraction failed on %s: %s", filename, exc)
            try:
                from ..ocr.extract import extract_text
                return extract_text(file_bytes, filename, "application/pdf")
            except Exception:
                return ""

    try:
        from ..ocr.extract import extract_text
        return extract_text(file_bytes, filename, "image/png")
    except Exception as exc:
        logger.warning("Image OCR failed on %s: %s", filename, exc)
        return ""


def extract_spatial_fields_from_pdf(file_bytes: bytes) -> dict[str, Any]:
    """Inspect 2D physical bounding boxes of PDF text blocks to extract key-value pairs
    where labels and values are spatially decoupled (e.g. value above or beside label in a grid).
    """
    if not file_bytes:
        return {}

    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception:
        return {}

    spatial: dict[str, Any] = {}
    blacklist = {
        "page", "imo", "solas", "marpol", "convention", "table", "form",
        "statutory", "provisional", "regulation", "index", "section",
        "republic", "government", "society", "authority",
    }

    max_pages = min(len(doc), 3)
    for p_idx in range(max_pages):
        page = doc[p_idx]
        blocks = page.get_text("blocks")
        tb = [b for b in blocks if b[6] == 0 and b[4].strip()]

        for b in tb:
            txt = b[4].strip()
            x0, y0, x1, y1 = b[:4]

            # 1. Certificate Number
            if not spatial.get("certificate_number"):
                is_num_label = bool(
                    re.search(r"^\((?:No\.?|Doc\.?\s*No\.?|Certificate\s+No\.?|Number)\)$", txt, re.IGNORECASE)
                    or re.search(r"^(?:Certificate\s+No|Cert\s+No|Document\s+Number|Número\s+de\s+Documento|Official\s+No|Registration\s+No|No\.?)\s*[:#]?$", txt, re.IGNORECASE)
                )
                if is_num_label:
                    cands = []
                    for o in tb:
                        if o == b:
                            continue
                        ox0, oy0, ox1, oy1, otxt = o[0], o[1], o[2], o[3], o[4].strip()
                        if any(bl in otxt.lower() for bl in blacklist):
                            continue
                        # Above
                        if abs(ox0 - x0) < 120 and 0 < y0 - oy1 < 45:
                            cands.append((y0 - oy1, otxt))
                        # Right
                        elif abs(oy0 - y0) < 25 and 0 < ox0 - x1 < 160:
                            cands.append((ox0 - x1, otxt))
                        # Below
                        elif abs(ox0 - x0) < 120 and 0 < oy0 - y1 < 45:
                            cands.append((oy0 - y1, otxt))
                    cands.sort(key=lambda c: c[0])
                    for dist, val in cands:
                        cleaned = val.split("\n")[0].strip().rstrip(".,;")
                        if any(ch.isdigit() for ch in cleaned) and len(cleaned) >= 4 and not cleaned.lower().startswith("imo"):
                            spatial["certificate_number"] = cleaned
                            break

            # 2. Issue Date
            if not spatial.get("issue_date"):
                is_issue_label = bool(
                    re.search(r"^\((?:Date\s+of\s+Issue|Date\s+of\s+issuance)\)$", txt, re.IGNORECASE)
                    or re.search(r"^(?:Date\s+of\s+issue|Date\s+of\s+issuance|Fecha\s+de\s+expedici[óo]n|Issued\s+on|Issued\s+at)\s*[:#]?$", txt, re.IGNORECASE)
                )
                if is_issue_label:
                    cands = []
                    for o in tb:
                        if o == b:
                            continue
                        ox0, oy0, ox1, oy1, otxt = o[0], o[1], o[2], o[3], o[4].strip()
                        if abs(ox0 - x0) < 120 and 0 < y0 - oy1 < 45:
                            cands.append((y0 - oy1, otxt))
                        elif abs(oy0 - y0) < 25 and 0 < ox0 - x1 < 160:
                            cands.append((ox0 - x1, otxt))
                        elif abs(ox0 - x0) < 120 and 0 < oy0 - y1 < 45:
                            cands.append((oy0 - y1, otxt))
                    cands.sort(key=lambda c: c[0])
                    for dist, val in cands:
                        d = find_date_in_window(val)
                        if d:
                            spatial["issue_date"] = d
                            break

            # 3. Expiry Date
            if not spatial.get("expiry_date"):
                is_expiry_label = bool(
                    re.search(r"^\((?:Date\s+of\s+Expiry|Expiry\s+date|Valid\s+until)\)$", txt, re.IGNORECASE)
                    or re.search(r"^(?:Valid\s+until|Date\s+of\s+expiry|Expiry\s+date|Due\s+date|Vence\s+el|Vigente\s+hasta)\s*[:#]?$", txt, re.IGNORECASE)
                )
                if is_expiry_label:
                    cands = []
                    for o in tb:
                        if o == b:
                            continue
                        ox0, oy0, ox1, oy1, otxt = o[0], o[1], o[2], o[3], o[4].strip()
                        if abs(ox0 - x0) < 120 and 0 < y0 - oy1 < 45:
                            cands.append((y0 - oy1, otxt))
                        elif abs(oy0 - y0) < 25 and 0 < ox0 - x1 < 160:
                            cands.append((ox0 - x1, otxt))
                        elif abs(ox0 - x0) < 120 and 0 < oy0 - y1 < 45:
                            cands.append((oy0 - y1, otxt))
                    cands.sort(key=lambda c: c[0])
                    for dist, val in cands:
                        d = find_date_in_window(val)
                        if d:
                            spatial["expiry_date"] = d
                            break

            # 4. Vessel Name
            if not spatial.get("vessel_name"):
                is_vessel_label = bool(
                    re.search(r"^(?:Name\s+of\s+ship|Ship\s+Name|Nombre\s+de\s+la\s+nave)\s*[:#]?$", txt, re.IGNORECASE)
                )
                if is_vessel_label:
                    cands = []
                    for o in tb:
                        if o == b:
                            continue
                        ox0, oy0, ox1, oy1, otxt = o[0], o[1], o[2], o[3], o[4].strip()
                        if abs(oy0 - y0) < 25 and 0 < ox0 - x1 < 160:
                            cands.append((ox0 - x1, otxt))
                        elif abs(ox0 - x0) < 120 and 0 < oy0 - y1 < 45:
                            cands.append((oy0 - y1, otxt))
                    cands.sort(key=lambda c: c[0])
                    for dist, val in cands:
                        clean_v = val.split("\n")[0].strip()
                        if len(clean_v) >= 3 and not any(bl in clean_v.lower() for bl in blacklist):
                            spatial["vessel_name"] = clean_v
                            break

    return spatial


def extract_certificate_metadata(
    file_bytes: bytes,
    filename: str,
    masters: list[models.CertificateMaster],
    vessels: list[models.Vessel],
    target_vessel_id: int | None = None,
) -> dict[str, Any]:
    """Primary extraction entrypoint: Extracts text, dates, certificate type, cert number, authority, and vessel."""
    extracted_text = extract_text_from_file_bytes(file_bytes, filename)

    # 1. Dates & Validity from text
    issue_date, expiry_date, has_no_expiry = extract_dates(extracted_text)

    # 2. Vessel Matching & Detection (Vessel First)
    matched_vessel, vessel_conf, detected_vessel_name = match_vessel(extracted_text, vessels, filename)
    vessel_matched_in_doc = (matched_vessel is not None)
    if not matched_vessel and target_vessel_id:
        fallback_v = next((v for v in vessels if v.id == target_vessel_id), None)
        if fallback_v:
            matched_vessel = fallback_v
            vessel_conf = 0.5
            if not detected_vessel_name:
                detected_vessel_name = fallback_v.name

    # 3. Certificate Master matching (ranked by vessel applicability if known)
    matched_master, master_conf = match_certificate_master(extracted_text, filename, masters)
    detected_cert_title = None
    if not matched_master:
        detected_cert_title = extract_raw_certificate_title(extracted_text, filename)

    # 4. If matched master has no expiry (or permanent), treat as permanent
    _flag = getattr(matched_master, "no_expiry", None) if matched_master else None
    _permanent = _flag if isinstance(_flag, bool) else (matched_master is not None and matched_master.default_validity_years is None and getattr(matched_master, "default_validity_months", None) is None)
    if matched_master and _permanent:
        has_no_expiry = True
        expiry_date = None

    # If expiry_date is missing and not permanent, use default validity years/months if available
    if not has_no_expiry and issue_date and not expiry_date and matched_master and (matched_master.default_validity_years or getattr(matched_master, "default_validity_months", None)):
        try:
            import calendar
            from datetime import timedelta
            total_months = (matched_master.default_validity_years or 0) * 12 + (getattr(matched_master, "default_validity_months", None) or 0)
            if total_months > 0:
                m_target = (issue_date.month - 1) + total_months
                y_target = issue_date.year + (m_target // 12)
                m_target = (m_target % 12) + 1
                max_days = calendar.monthrange(y_target, m_target)[1]
                day = min(issue_date.day, max_days)
                expiry_date = date(y_target, m_target, day) - timedelta(days=1)
        except Exception:
            pass

    # 5. Certificate / Document Number
    cert_number = extract_certificate_number(extracted_text)

    # 6. Issuing Authority
    default_auth = matched_master.issuing_authority if matched_master else None
    authority = extract_issuing_authority(extracted_text, default_auth)

    # 7. Tier 1.5: 2D Spatial Layout Fallback for Tabular / Grid PDFs
    if (filename or "").lower().endswith(".pdf") and (
        cert_number is None
        or issue_date is None
        or (not has_no_expiry and expiry_date is None)
        or not detected_vessel_name
    ):
        try:
            spatial_data = extract_spatial_fields_from_pdf(file_bytes)
            if not cert_number and spatial_data.get("certificate_number"):
                cert_number = spatial_data["certificate_number"]
            if not issue_date and spatial_data.get("issue_date"):
                issue_date = spatial_data["issue_date"]
            if not has_no_expiry and not expiry_date and spatial_data.get("expiry_date"):
                expiry_date = spatial_data["expiry_date"]
            if not detected_vessel_name and spatial_data.get("vessel_name"):
                detected_vessel_name = spatial_data["vessel_name"]
                if not matched_vessel and vessels:
                    matched_vessel, vessel_conf, detected_vessel_name = match_vessel(
                        detected_vessel_name, vessels, filename
                    )
        except Exception as s_exc:
            logger.debug("Spatial grid extraction skipped: %s", s_exc)

    # 8. Tier 2: Vision AI Fallback (Local Offline DocVQA via Florence-2)
    try:
        from ..config import settings
        if getattr(settings, "enable_vision_ai", False):
            needs_vision = (
                cert_number is None
                or issue_date is None
                or (not has_no_expiry and expiry_date is None)
                or not detected_vessel_name
            )
            if needs_vision:
                from .vision_extractor import extract_with_vision_ai
                vision_data = extract_with_vision_ai(file_bytes, filename)
                if vision_data:
                    if not cert_number and vision_data.get("certificate_number"):
                        cert_number = vision_data["certificate_number"]
                    if not issue_date and vision_data.get("issue_date"):
                        issue_date = vision_data["issue_date"]
                    if not has_no_expiry and not expiry_date and vision_data.get("expiry_date"):
                        expiry_date = vision_data["expiry_date"]
                    if not has_no_expiry and vision_data.get("has_no_expiry"):
                        has_no_expiry = True
                        expiry_date = None
                    if not detected_vessel_name and vision_data.get("vessel_name"):
                        detected_vessel_name = vision_data["vessel_name"]
                        if not matched_vessel and vessels:
                            matched_vessel, vessel_conf, _ = match_vessel(
                                detected_vessel_name, vessels, filename
                            )
                    if not matched_master and not detected_cert_title and vision_data.get("certificate_title"):
                        detected_cert_title = vision_data["certificate_title"]
                    if (not authority or authority == "Classification Society") and vision_data.get("issuing_authority"):
                        authority = vision_data["issuing_authority"]
    except Exception as v_exc:
        logger.debug("Vision AI fallback skipped or failed: %s", v_exc)

    return {
        "success": True,
        "filename": filename,
        "vessel_matched_in_doc": vessel_matched_in_doc,
        "vessel_id": matched_vessel.id if matched_vessel else None,
        "vessel_name": matched_vessel.name if matched_vessel else detected_vessel_name,
        "detected_vessel_name": detected_vessel_name,
        "certificate_master_id": matched_master.id if matched_master else None,
        "certificate_name": matched_master.name if matched_master else None,
        "detected_certificate_title": detected_cert_title,
        "category": matched_master.category if matched_master else None,
        "certificate_number": cert_number,
        "issuing_authority": authority,
        "issue_date": issue_date.isoformat() if issue_date else None,
        "expiry_date": expiry_date.isoformat() if expiry_date else None,
        "has_no_expiry": has_no_expiry,
        "confidence": {
            "certificate_type": master_conf,
            "vessel": vessel_conf,
            "issue_date": 0.95 if issue_date else 0.0,
            "expiry_date": 0.95 if (expiry_date or has_no_expiry) else 0.0,
            "certificate_number": 0.85 if cert_number else 0.0,
        },
        "raw_text_preview": (extracted_text[:400] + "...") if len(extracted_text) > 400 else extracted_text,
    }
