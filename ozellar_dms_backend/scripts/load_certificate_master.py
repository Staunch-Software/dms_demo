#!/usr/bin/env python3
"""Load the client's Certificate Master Excel into the certificate_master table.

The Excel sheet "Certificate Master" has these columns:
    ID | Category | Subcategory | Certificate / Service Name | Mandatory / Optional |
    Responsible Person | Issue Authority | Applicable Ship Type | Renewal / Validity | Remarks

What the script does (all in ONE database transaction - nothing is saved if any step fails):
  1. Renames ship types to the client's names (Oil Tanker -> Oil Carrier, Reffer Carrier -> Reefer Carrier)
     in the ship type list, on vessels and in certificate rules, and adds any ship type the Excel uses
     that is missing.
  2. Creates or updates every certificate type in the Excel (matched by name, ignoring case).
     Its "All ships" / ship-type rules are replaced by the Excel's; rules for single vessels are kept.
  3. Removes old certificate types that are not in the Excel.
     A type that already has certificates uploaded is NOT removed; it is listed instead
     (add --delete-old-certificates to remove those certificates and their history too).

Usage (run from the backend folder, with the venv active):
    python scripts/load_certificate_master.py --file Ship_Certificate_and_Service_Master_Reworked.xlsx
        -> dry run: prints what would change, saves nothing
    python scripts/load_certificate_master.py --file <xlsx> --apply
        -> saves the changes
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import openpyxl  # noqa: E402

from app.db import models  # noqa: E402
from app.db.base import SessionLocal  # noqa: E402

SHEET_NAME = "Certificate Master"
EXPECTED_HEADERS = [
    "ID", "Category", "Subcategory", "Certificate / Service Name", "Mandatory / Optional",
    "Responsible Person", "Issue Authority", "Applicable Ship Type", "Renewal / Validity", "Remarks",
]

# Our old ship type name -> the client's name.
SHIP_TYPE_RENAMES = {
    "Oil Tanker": "Oil Carrier",
    "Reffer Carrier": "Reefer Carrier",
}

# Wording that means the certificate does not expire.
_NO_EXPIRY_PREFIXES = ("permanent", "until ", "continuous")


def parse_validity(text: str | None) -> tuple[int | None, int | None, bool]:
    """Turn the Excel "Renewal / Validity" wording into (years, months, no_expiry).

    Only clear wording is converted. Anything else (e.g. "Per maker/flag", "Jurisdiction-specific")
    gives (None, None, False): no default period, and the expiry date is taken from the document.
    """
    t = (text or "").strip().lower()
    if not t:
        return None, None, False
    if t.startswith(_NO_EXPIRY_PREFIXES):
        # "Continuous; annual examination" is a register with yearly checks, not a permanent
        # certificate: take the date from the document.
        if ";" in t or "annual" in t:
            return None, None, False
        return None, None, True
    if t.startswith("annual endorsement"):
        # e.g. DOC copy: valid for several years and only endorsed yearly.
        return None, None, False
    m = re.match(r"^(\d+)\s*-?\s*years?\b", t)
    if m:
        return int(m.group(1)), None, False
    m = re.match(r"^(\d+)\s*months?\b", t)
    if m:
        return None, int(m.group(1)), False
    if t.startswith("annual"):
        return 1, None, False
    m = re.match(r"^typically\s+(\d+)\s*years?\b", t)
    if m:
        return int(m.group(1)), None, False
    return None, None, False


def _clean(v) -> str:
    return "" if v is None else str(v).strip()


def read_excel(path: Path) -> list[dict]:
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    if SHEET_NAME not in wb.sheetnames:
        raise SystemExit(f"Sheet '{SHEET_NAME}' not found. Sheets in the file: {wb.sheetnames}")
    rows = list(wb[SHEET_NAME].iter_rows(values_only=True))
    if not rows:
        raise SystemExit("The sheet is empty.")
    headers = [_clean(h) for h in rows[0]][: len(EXPECTED_HEADERS)]
    if headers != EXPECTED_HEADERS:
        raise SystemExit(f"Unexpected columns.\n  expected: {EXPECTED_HEADERS}\n  found:    {headers}")

    out: list[dict] = []
    errors: list[str] = []
    seen: dict[str, int] = {}
    for line_no, r in enumerate(rows[1:], start=2):
        r = list(r) + [None] * (len(EXPECTED_HEADERS) - len(r))
        name = _clean(r[3])
        if not name and not any(_clean(c) for c in r):
            continue  # blank row
        if not name:
            errors.append(f"row {line_no}: Certificate / Service Name is empty")
            continue
        key = name.lower()
        if key in seen:
            errors.append(f"row {line_no}: '{name}' is a duplicate of row {seen[key]}")
            continue
        seen[key] = line_no
        category = _clean(r[1])
        if not category:
            errors.append(f"row {line_no}: Category is empty for '{name}'")
            continue
        mand = _clean(r[4]).lower()
        if mand not in ("mandatory", "optional"):
            errors.append(f"row {line_no}: Mandatory / Optional must be Mandatory or Optional, got '{_clean(r[4])}'")
            continue
        ship_raw = _clean(r[7])
        if not ship_raw or ship_raw.lower() in ("all ships", "all"):
            ship_types: list[str] = []
        else:
            ship_types = [s.strip() for s in ship_raw.split(",") if s.strip()]
        validity_text = _clean(r[8])
        years, months, no_expiry = parse_validity(validity_text)
        out.append({
            "line": line_no,
            "excel_id": _clean(r[0]),
            "category": category,
            "sub_category": _clean(r[2]) or None,
            "name": name,
            "is_mandatory": mand == "mandatory",
            "responsible_person": _clean(r[5]) or None,
            "issuing_authority": _clean(r[6]) or None,
            "ship_types": ship_types,  # empty = all ships
            "validity_note": validity_text or None,
            "years": years,
            "months": months,
            "no_expiry": no_expiry,
            "remarks": _clean(r[9]) or None,
        })
    if errors:
        raise SystemExit("The Excel has problems, nothing was loaded:\n  " + "\n  ".join(errors))
    for row in out:
        if len(row["name"]) > 255 or len(row["category"]) > 100 or len(row["sub_category"] or "") > 100 \
                or len(row["validity_note"] or "") > 255 or len(row["responsible_person"] or "") > 150 \
                or len(row["issuing_authority"] or "") > 150:
            raise SystemExit(f"row {row['line']}: a value is longer than the database allows")
    return out


def _fmt_validity(row: dict) -> str:
    if row["no_expiry"]:
        return "Permanent"
    if row["years"]:
        return f"{row['years']} year(s)"
    if row["months"]:
        return f"{row['months']} month(s)"
    return "from document"


def run(path: Path, apply: bool, delete_old_certs: bool) -> None:
    rows = read_excel(path)
    print(f"Read {len(rows)} certificate types from '{path.name}'.\n")

    with SessionLocal() as db:
        # ---- 1. Ship types
        print("== Ship types")
        all_types = {t.name.lower(): t for t in db.query(models.ShipType).all()}
        for old_name, new_name in SHIP_TYPE_RENAMES.items():
            old = all_types.get(old_name.lower())
            new = all_types.get(new_name.lower())
            n_vessels = db.query(models.Vessel).filter(models.Vessel.vessel_type == old_name).update(
                {models.Vessel.vessel_type: new_name}, synchronize_session=False)
            n_rules = db.query(models.CertificateApplicability).filter(
                models.CertificateApplicability.ship_type == old_name).update(
                {models.CertificateApplicability.ship_type: new_name}, synchronize_session=False)
            if old and not new:
                old.name = new_name
                all_types.pop(old_name.lower())
                all_types[new_name.lower()] = old
                print(f"  rename '{old_name}' -> '{new_name}' ({n_vessels} vessel(s), {n_rules} rule(s) updated)")
            elif old and new:
                db.delete(old)
                all_types.pop(old_name.lower())
                print(f"  merge '{old_name}' into existing '{new_name}' ({n_vessels} vessel(s), {n_rules} rule(s) updated)")
            elif n_vessels or n_rules:
                print(f"  '{old_name}' -> '{new_name}' on {n_vessels} vessel(s), {n_rules} rule(s)")
        db.flush()

        needed = sorted({t for r in rows for t in r["ship_types"]}, key=str.lower)
        max_order = max([t.sort_order or 0 for t in all_types.values()] + [0])
        for t in needed:
            existing = all_types.get(t.lower())
            if existing is None:
                max_order += 1
                obj = models.ShipType(name=t, active=True, sort_order=max_order)
                db.add(obj)
                all_types[t.lower()] = obj
                print(f"  add ship type '{t}'")
            elif not existing.active:
                existing.active = True
                print(f"  re-activate ship type '{t}'")
        db.flush()
        type_name = {k: v.name for k, v in all_types.items()}
        print("  ship types used by the Excel: " + ", ".join(needed) + "\n")

        # ---- 2. Create / update certificate types
        print("== Certificate types")
        masters = {m.name.lower(): m for m in db.query(models.CertificateMaster).all()}
        created = updated = 0
        for r in rows:
            m = masters.get(r["name"].lower())
            is_new = m is None
            if is_new:
                m = models.CertificateMaster(name=r["name"], category=r["category"], enable_email_automation=False)
                db.add(m)
            m.name = r["name"]
            m.category = r["category"]
            m.sub_category = r["sub_category"]
            m.reference_no = None
            m.responsible_person = r["responsible_person"]
            m.issuing_authority = r["issuing_authority"]
            m.is_mandatory = r["is_mandatory"]
            m.default_validity_years = r["years"]
            m.default_validity_months = r["months"]
            m.no_expiry = r["no_expiry"]
            m.validity_note = r["validity_note"]
            m.remarks = r["remarks"]
            db.flush()

            # Replace the fleet-wide rules; keep any single-vessel rules an admin added.
            db.query(models.CertificateApplicability).filter(
                models.CertificateApplicability.certificate_master_id == m.id,
                models.CertificateApplicability.scope.in_(("all_ships", "ship_type")),
            ).delete(synchronize_session=False)
            if r["ship_types"]:
                for t in r["ship_types"]:
                    db.add(models.CertificateApplicability(
                        certificate_master_id=m.id, scope="ship_type",
                        ship_type=type_name[t.lower()], is_required=r["is_mandatory"]))
            else:
                db.add(models.CertificateApplicability(
                    certificate_master_id=m.id, scope="all_ships", is_required=r["is_mandatory"]))

            if is_new:
                created += 1
                masters[r["name"].lower()] = m
            else:
                updated += 1
            ships = ", ".join(r["ship_types"]) or "All ships"
            print(f"  {'NEW ' if is_new else 'UPD '} {r['excel_id']:>4} | {r['name'][:60]:<60} | "
                  f"{'Mandatory' if r['is_mandatory'] else 'Optional ':<9} | {ships[:40]:<40} | {_fmt_validity(r)}")
        db.flush()

        # ---- 3. Remove old types not in the Excel
        print("\n== Old certificate types (not in the Excel)")
        keep = {r["name"].lower() for r in rows}
        removed = kept = 0
        for key, m in sorted(masters.items()):
            if key in keep:
                continue
            cert_q = db.query(models.Certificate).filter(models.Certificate.certificate_master_id == m.id)
            n_certs = cert_q.count()
            if n_certs and not delete_old_certs:
                kept += 1
                print(f"  KEEP '{m.name}': {n_certs} certificate(s) uploaded "
                      "(re-run with --delete-old-certificates to remove them too)")
                continue
            if n_certs:
                cert_ids = [c.id for c in cert_q.all()]
                db.query(models.CertificateHistory).filter(
                    models.CertificateHistory.certificate_id.in_(cert_ids)).delete(synchronize_session=False)
                cert_q.delete(synchronize_session=False)
            db.delete(m)
            removed += 1
            print(f"  REMOVE '{m.name}'" + (f" and its {n_certs} certificate(s)" if n_certs else ""))
        if not removed and not kept:
            print("  none")
        db.flush()

        total = db.query(models.CertificateMaster).count()
        print(f"\nSummary: {created} created, {updated} updated, {removed} old removed, {kept} old kept. "
              f"Certificate types after load: {total}.")

        if apply:
            db.commit()
            print("Saved.")
        else:
            db.rollback()
            print("DRY RUN - nothing was saved. Add --apply to save.")


def main() -> None:
    ap = argparse.ArgumentParser(description="Load the client's Certificate Master Excel.")
    ap.add_argument("--file", required=True, help="Path to the Excel file")
    ap.add_argument("--apply", action="store_true", help="Save the changes (default is a dry run)")
    ap.add_argument("--delete-old-certificates", action="store_true",
                    help="Also delete certificates (and their history) that belong to old types being removed")
    args = ap.parse_args()
    path = Path(args.file).expanduser().resolve()
    if not path.is_file():
        raise SystemExit(f"File not found: {path}")
    run(path, args.apply, args.delete_old_certificates)


if __name__ == "__main__":
    main()
