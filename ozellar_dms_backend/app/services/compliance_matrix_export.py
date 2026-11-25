"""Export service for Fleet Compliance Matrix (Excel and PDF)
Formatted for Port State Control (PSC) & Oil Major Vetting Audits.
"""
from __future__ import annotations

import io
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import or_

from ..db import models
from ..config import site_alias_matches


def _ship_type_matches(rule_type: str | None, vessel_type: str | None) -> bool:
    a = (rule_type or "").strip().lower()
    b = (vessel_type or "").strip().lower()
    return bool(a) and a == b


def get_matrix_data(
    db: Any,
    vessel_ids: list[int] | None = None,
    category: str | None = None,
    search: str | None = None,
    status: str | None = None,
    site_key: str | None = None,
) -> dict[str, Any]:
    """Retrieve filtered matrix data with full audit metadata."""
    today = date.today()
    d30 = today + timedelta(days=30)

    # 1. Vessels
    v_query = db.query(models.Vessel).filter(models.Vessel.is_provisioned == True)
    if vessel_ids:
        v_query = v_query.filter(models.Vessel.id.in_(vessel_ids))
    if site_key and site_key.strip().lower() != "all":
        clean_site = site_key.strip().lower()
        all_v = v_query.order_by(models.Vessel.name.asc()).all()
        vessels = [
            v for v in all_v
            if any(site_alias_matches(str(s).strip(), clean_site) for s in (v.provisioned_site_ids or []))
            or (v.provisioned_site_key and site_alias_matches(str(v.provisioned_site_key).strip(), clean_site))
        ]
    else:
        vessels = v_query.order_by(models.Vessel.name.asc()).all()

    # 2. Mandatory Certificate Masters
    m_query = db.query(models.CertificateMaster).filter(models.CertificateMaster.is_mandatory == True)
    if category and category.lower() != "all":
        cat_list = [c.strip() for c in category.split(",") if c.strip() and c.lower() != "all"]
        if cat_list:
            m_query = m_query.filter(or_(*[models.CertificateMaster.category.ilike(f"%{c}%") for c in cat_list]))
    masters = m_query.order_by(models.CertificateMaster.category.asc(), models.CertificateMaster.name.asc()).all()

    # Apply search filter if provided (matches vessel name, IMO, or certificate name)
    if search and search.strip():
        term = search.strip().lower()
        matching_vessels = [v for v in vessels if term in (v.name or "").lower() or term in (v.imo or "").lower()]
        matching_masters = [m for m in masters if term in (m.name or "").lower() or term in (m.category or "").lower()]
        if matching_masters and not matching_vessels:
            masters = matching_masters
        elif matching_vessels and not matching_masters:
            vessels = matching_vessels
        elif matching_vessels or matching_masters:
            if matching_vessels:
                vessels = matching_vessels
            if matching_masters:
                masters = matching_masters

    # 3. Rules & Certificates
    rules = db.query(models.CertificateApplicability).all()
    certs = db.query(models.Certificate).filter(models.Certificate.status.notin_(("superseded", "deleted"))).all()

    def _cert_rank(c: models.Certificate) -> tuple[int, date]:
        if c.has_no_expiry or c.expiry_date is None:
            return (2, date.max)
        return (1 if c.expiry_date >= today else 0, c.expiry_date)

    cert_map: dict[tuple[int, int], models.Certificate] = {}
    for c in certs:
        key = (c.vessel_id, c.certificate_master_id)
        held_now = cert_map.get(key)
        if held_now is None or _cert_rank(c) > _cert_rank(held_now):
            cert_map[key] = c

    matrix_rows = []
    total_valid = 0
    total_due_soon = 0
    total_overdue = 0
    total_missing = 0
    total_required = 0

    all_detailed_records = []
    deficiencies = []

    for v in vessels:
        v_type = (v.vessel_type or "").strip().lower()
        row_items = []
        v_valid = 0
        v_due_soon = 0
        v_overdue = 0
        v_missing = 0
        v_req = 0

        for m in masters:
            is_req = False
            for r in rules:
                if r.certificate_master_id == m.id and r.is_required:
                    if r.scope == "all_ships":
                        is_req = True
                    elif r.scope == "ship_type" and _ship_type_matches(r.ship_type, v_type):
                        is_req = True
                    elif r.scope == "vessel" and r.vessel_id == v.id:
                        is_req = True

            if not is_req:
                continue

            v_req += 1
            active_cert = cert_map.get((v.id, m.id))
            expiry_str = None
            cert_num = None
            authority = None
            issue_str = None
            days_left = None

            if active_cert is None:
                cell_status = "missing"
                v_missing += 1
            else:
                cert_num = active_cert.certificate_number
                authority = active_cert.issuing_authority
                issue_str = active_cert.issue_date.isoformat() if active_cert.issue_date else None
                if active_cert.expiry_date:
                    expiry_str = active_cert.expiry_date.isoformat()
                    days_left = (active_cert.expiry_date - today).days

                if active_cert.has_no_expiry or active_cert.expiry_date is None:
                    cell_status = "valid"
                    v_valid += 1
                elif active_cert.expiry_date < today:
                    cell_status = "overdue"
                    v_overdue += 1
                elif active_cert.expiry_date <= d30:
                    cell_status = "due_soon"
                    v_due_soon += 1
                    v_valid += 1
                else:
                    cell_status = "valid"
                    v_valid += 1

            cell_data = {
                "master_id": m.id,
                "name": m.name,
                "category": m.category,
                "status": cell_status,
                "expiry": expiry_str,
                "certificate_number": cert_num,
                "issuing_authority": authority,
                "issue_date": issue_str,
                "days_left": days_left,
            }
            row_items.append(cell_data)

            detailed_record = {
                "vessel_name": v.name,
                "vessel_imo": v.imo or "—",
                "vessel_type": v.vessel_type or "—",
                "category": m.category,
                "certificate_name": m.name,
                "certificate_number": cert_num or "—",
                "issuing_authority": authority or "—",
                "issue_date": issue_str or "—",
                "expiry_date": expiry_str or ("Permanent / No Expiry" if active_cert and active_cert.has_no_expiry else "—"),
                "status": cell_status.upper().replace("_", " "),
                "days_left": days_left if days_left is not None else "—",
            }

            matches_status = True
            if status:
                st = status.lower()
                if st == "overdue":
                    matches_status = (cell_status == "overdue")
                elif st in ("due_7_days", "due_7"):
                    matches_status = (days_left is not None and 0 <= days_left <= 7)
                elif st in ("due_30_days", "due_30", "due_soon"):
                    matches_status = (cell_status == "due_soon" or (days_left is not None and 0 <= days_left <= 30))
                elif st in ("due_90_days", "due_90"):
                    matches_status = (days_left is not None and 0 <= days_left <= 90)
                elif st == "missing":
                    matches_status = (cell_status == "missing")
                elif st == "valid":
                    matches_status = (cell_status == "valid")

            if matches_status:
                all_detailed_records.append(detailed_record)

            if cell_status in ("overdue", "due_soon", "missing"):
                if not status or matches_status:
                    action_needed = "Upload new certificate immediately" if cell_status == "missing" else (
                        "Renew expired certificate" if cell_status == "overdue" else "Schedule renewal survey"
                    )
                    deficiencies.append({
                        "vessel_name": v.name,
                        "vessel_imo": v.imo or "—",
                        "category": m.category,
                        "certificate_name": m.name,
                        "status": cell_status.upper().replace("_", " "),
                        "expiry_date": expiry_str or "MISSING",
                        "days_left": days_left if days_left is not None else "N/A",
                        "action_required": action_needed,
                    })

        na_c = max(len(masters) - v_req, 0)
        c_held = v_valid + na_c
        c_tot = v_req + na_c
        rate = round((c_held / c_tot * 100), 1) if c_tot > 0 else 100.0
        matrix_rows.append({
            "vessel_id": v.id,
            "vessel_name": v.name,
            "vessel_imo": v.imo or "—",
            "vessel_type": v.vessel_type or "—",
            "compliance_rate": rate,
            "combined_held": c_held,
            "combined_total": c_tot,
            "required_count": v_req,
            "valid_count": v_valid,
            "due_soon_count": v_due_soon,
            "overdue_count": v_overdue,
            "missing_count": v_missing,
            "mandatory_held": v_valid,
            "mandatory_total": v_req,
            "optional_held": 0,
            "optional_total": 0,
            "na_count": na_c,
            "count_valid": max(v_valid - v_due_soon, 0),
            "count_due_7": 0,
            "count_due_30": v_due_soon,
            "count_due_90": 0,
            "count_overdue": v_overdue,
            "cells": row_items,
        })

        total_valid += v_valid
        total_due_soon += v_due_soon
        total_overdue += v_overdue
        total_missing += v_missing
        total_required += v_req

    avg_rate = round((total_valid / total_required * 100), 1) if total_required > 0 else 100.0

    filters_applied = []
    if category and category.lower() != "all":
        filters_applied.append(f"Category: {category.strip()}")
    if status:
        filters_applied.append(f"Status: {status.upper().replace('_', ' ')}")
    if search and search.strip():
        filters_applied.append(f"Search: '{search.strip()}'")
    if vessel_ids:
        filters_applied.append(f"{len(vessels)} Vessel(s) Selected")

    scope_text = "Port State Control (PSC) & Oil Major Vetting Audit Compliance Summary"
    if filters_applied:
        scope_text += f" [Filtered: {', '.join(filters_applied)}]"

    return {
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "audit_title": "FLEET CERTIFICATE COMPLIANCE MATRIX",
        "audit_scope": scope_text,
        "summary": {
            "total_vessels": len(vessels),
            "average_compliance_rate": avg_rate,
            "total_required": total_required,
            "total_valid": total_valid,
            "total_due_soon": total_due_soon,
            "total_overdue": total_overdue,
            "total_missing": total_missing,
        },
        "columns": [{"id": m.id, "name": m.name, "category": m.category} for m in masters],
        "rows": matrix_rows,
        "detailed_records": all_detailed_records,
        "deficiencies": deficiencies,
    }


def build_matrix_excel(data: dict[str, Any]) -> bytes:
    """Generate professional 3-sheet Excel workbook using openpyxl."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    wb = Workbook()

    # Common Styles
    title_font = Font(name="Calibri", size=15, bold=True, color="FFFFFF")
    subtitle_font = Font(name="Calibri", size=10, italic=True, color="E2E8F0")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    bold_cell_font = Font(name="Calibri", size=10, bold=True)
    normal_cell_font = Font(name="Calibri", size=10)
    center_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    left_align = Alignment(horizontal="left", vertical="center")

    thin_border_side = Side(style="thin", color="CBD5E1")
    grid_border = Border(left=thin_border_side, right=thin_border_side, top=thin_border_side, bottom=thin_border_side)

    navy_fill = PatternFill(start_color="0B2A4A", end_color="0B2A4A", fill_type="solid")
    steel_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    kpi_bar_fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")

    valid_fill = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")
    valid_font = Font(name="Calibri", size=9, bold=True, color="166534")

    due_soon_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
    due_soon_font = Font(name="Calibri", size=9, bold=True, color="92400E")

    overdue_fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
    overdue_font = Font(name="Calibri", size=9, bold=True, color="991B1B")

    missing_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    missing_font = Font(name="Calibri", size=9, color="64748B")

    # -------------------------------------------------------------
    # SHEET 1: FLEET COMPLIANCE MATRIX
    # -------------------------------------------------------------
    ws1 = wb.active
    ws1.title = "Compliance Matrix"
    ws1.views.sheetView[0].showGridLines = True

    cols = data.get("columns", [])
    total_cols = 5 + len(cols)
    last_col_letter = get_column_letter(max(total_cols, 6))

    # Row 1: Title Banner
    ws1.merge_cells(f"A1:{last_col_letter}1")
    cell_a1 = ws1["A1"]
    cell_a1.value = "OZELLAR MARINE — FLEET CERTIFICATE COMPLIANCE MATRIX"
    cell_a1.font = title_font
    cell_a1.fill = navy_fill
    cell_a1.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws1.row_dimensions[1].height = 36

    # Row 2: Subtitle
    ws1.merge_cells(f"A2:{last_col_letter}2")
    cell_a2 = ws1["A2"]
    cell_a2.value = f"{data.get('audit_scope', '')} · Generated: {data.get('generated_at', '')}"
    cell_a2.font = subtitle_font
    cell_a2.fill = navy_fill
    cell_a2.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws1.row_dimensions[2].height = 20

    # Row 3: KPI Summary Strip
    s = data.get("summary", {})
    ws1.merge_cells(f"A3:{last_col_letter}3")
    kpi_text = (
        f"Fleet Summary: {s.get('total_vessels', 0)} Vessels Audited  |  "
        f"Fleet Compliance Rate: {s.get('average_compliance_rate', 0)}%  |  "
        f"Valid: {s.get('total_valid', 0)}  |  "
        f"Due Soon (<=30d): {s.get('total_due_soon', 0)}  |  "
        f"Overdue: {s.get('total_overdue', 0)}  |  "
        f"Missing Mandatory: {s.get('total_missing', 0)}"
    )
    cell_a3 = ws1["A3"]
    cell_a3.value = kpi_text
    cell_a3.font = Font(name="Calibri", size=10, bold=True, color="38BDF8")
    cell_a3.fill = kpi_bar_fill
    cell_a3.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws1.row_dimensions[3].height = 22

    # Row 4: Spacer
    ws1.row_dimensions[4].height = 8

    # Row 5: Column Headers
    headers = ["Vessel Name", "IMO Number", "Ship Type", "Compliance %", "Valid / Req"]
    for c in cols:
        headers.append(f"{c['name']}\n({c['category']})")

    ws1.row_dimensions[5].height = 38
    for col_idx, h_text in enumerate(headers, start=1):
        cell = ws1.cell(row=5, column=col_idx)
        cell.value = h_text
        cell.font = header_font
        cell.fill = steel_fill
        cell.alignment = center_align if col_idx > 1 else left_align
        cell.border = grid_border

    # Data Rows
    current_row = 6
    for v_row in data.get("rows", []):
        ws1.row_dimensions[current_row].height = 24

        c1 = ws1.cell(row=current_row, column=1, value=v_row["vessel_name"])
        c1.font = bold_cell_font
        c1.alignment = left_align
        c1.border = grid_border

        c2 = ws1.cell(row=current_row, column=2, value=v_row["vessel_imo"])
        c2.font = normal_cell_font
        c2.alignment = center_align
        c2.border = grid_border

        c3 = ws1.cell(row=current_row, column=3, value=v_row["vessel_type"])
        c3.font = normal_cell_font
        c3.alignment = center_align
        c3.border = grid_border

        rate_val = f"{v_row['compliance_rate']}%"
        c4 = ws1.cell(row=current_row, column=4, value=rate_val)
        c4.alignment = center_align
        c4.border = grid_border
        if v_row["compliance_rate"] >= 100:
            c4.font = valid_font
            c4.fill = valid_fill
        elif v_row["compliance_rate"] >= 80:
            c4.font = due_soon_font
            c4.fill = due_soon_fill
        else:
            c4.font = overdue_font
            c4.fill = overdue_fill

        c5 = ws1.cell(row=current_row, column=5, value=f"{v_row['valid_count']} / {v_row['required_count']}")
        c5.font = bold_cell_font
        c5.alignment = center_align
        c5.border = grid_border

        # Certificate Cells
        cell_dict = {item["master_id"]: item for item in v_row.get("cells", [])}
        for c_idx, m_col in enumerate(cols, start=6):
            cell = ws1.cell(row=current_row, column=c_idx)
            cell.border = grid_border
            cell.alignment = center_align

            item = cell_dict.get(m_col["id"])
            if not item:
                cell.value = "N/A"
                cell.font = Font(name="Calibri", size=9, color="94A3B8")
                continue

            st = item["status"]
            exp = item.get("expiry")
            if st == "valid":
                cell.value = f"VALID\n{exp}" if exp else "VALID"
                cell.font = valid_font
                cell.fill = valid_fill
            elif st == "due_soon":
                cell.value = f"DUE SOON\n{exp}"
                cell.font = due_soon_font
                cell.fill = due_soon_fill
            elif st == "overdue":
                cell.value = f"OVERDUE\n{exp}"
                cell.font = overdue_font
                cell.fill = overdue_fill
            else:
                cell.value = "MISSING"
                cell.font = missing_font
                cell.fill = missing_fill

        current_row += 1

    # Freeze Panes & AutoFilter
    ws1.freeze_panes = "C6"
    ws1.auto_filter.ref = f"A5:{last_col_letter}{current_row - 1}"

    # Column Widths
    ws1.column_dimensions["A"].width = 24
    ws1.column_dimensions["B"].width = 13
    ws1.column_dimensions["C"].width = 16
    ws1.column_dimensions["D"].width = 15
    ws1.column_dimensions["E"].width = 14
    for idx in range(6, total_cols + 1):
        ws1.column_dimensions[get_column_letter(idx)].width = 20

    # -------------------------------------------------------------
    # SHEET 2: CERTIFICATE REGISTRY (AUDITOR DETAIL)
    # -------------------------------------------------------------
    ws2 = wb.create_sheet(title="Certificate Registry")
    ws2.views.sheetView[0].showGridLines = True

    reg_headers = [
        "Vessel Name", "IMO Number", "Vessel Type", "Category",
        "Certificate Name", "Certificate Number", "Issuing Authority",
        "Issue Date", "Expiry Date", "Compliance Status", "Days to Expiry"
    ]
    ws2.row_dimensions[1].height = 28
    for col_idx, h_text in enumerate(reg_headers, start=1):
        cell = ws2.cell(row=1, column=col_idx, value=h_text)
        cell.font = header_font
        cell.fill = steel_fill
        cell.alignment = center_align if col_idx not in (1, 5, 6, 7) else left_align
        cell.border = grid_border

    r_row = 2
    for item in data.get("detailed_records", []):
        ws2.row_dimensions[r_row].height = 20
        row_vals = [
            item["vessel_name"], item["vessel_imo"], item["vessel_type"], item["category"],
            item["certificate_name"], item["certificate_number"], item["issuing_authority"],
            item["issue_date"], item["expiry_date"], item["status"], item["days_left"]
        ]
        for c_idx, val in enumerate(row_vals, start=1):
            cell = ws2.cell(row=r_row, column=c_idx, value=val)
            cell.font = normal_cell_font
            cell.alignment = center_align if c_idx in (2, 3, 4, 8, 9, 10, 11) else left_align
            cell.border = grid_border

            # Highlight status
            if c_idx == 10:
                if val == "VALID":
                    cell.font = valid_font
                    cell.fill = valid_fill
                elif val == "DUE SOON":
                    cell.font = due_soon_font
                    cell.fill = due_soon_fill
                elif val == "OVERDUE":
                    cell.font = overdue_font
                    cell.fill = overdue_fill
                elif val == "MISSING":
                    cell.font = missing_font
                    cell.fill = missing_fill
        r_row += 1

    ws2.freeze_panes = "A2"
    ws2.auto_filter.ref = f"A1:{get_column_letter(len(reg_headers))}{max(r_row - 1, 1)}"
    reg_widths = [22, 13, 16, 18, 38, 20, 22, 14, 15, 18, 14]
    for idx, w in enumerate(reg_widths, start=1):
        ws2.column_dimensions[get_column_letter(idx)].width = w

    # -------------------------------------------------------------
    # SHEET 3: AUDIT DEFICIENCIES & ACTION ITEMS
    # -------------------------------------------------------------
    ws3 = wb.create_sheet(title="Audit Action Items")
    ws3.views.sheetView[0].showGridLines = True

    def_headers = [
        "Vessel Name", "IMO Number", "Category", "Certificate Name",
        "Status", "Expiry Date", "Days Remaining / Overdue", "Required Action"
    ]
    ws3.row_dimensions[1].height = 28
    for col_idx, h_text in enumerate(def_headers, start=1):
        cell = ws3.cell(row=1, column=col_idx, value=h_text)
        cell.font = header_font
        cell.fill = PatternFill(start_color="991B1B", end_color="991B1B", fill_type="solid")
        cell.alignment = center_align if col_idx not in (1, 4, 8) else left_align
        cell.border = grid_border

    d_row = 2
    for item in data.get("deficiencies", []):
        ws3.row_dimensions[d_row].height = 20
        d_vals = [
            item["vessel_name"], item["vessel_imo"], item["category"], item["certificate_name"],
            item["status"], item["expiry_date"], item["days_left"], item["action_required"]
        ]
        for c_idx, val in enumerate(d_vals, start=1):
            cell = ws3.cell(row=d_row, column=c_idx, value=val)
            cell.font = normal_cell_font
            cell.alignment = center_align if c_idx in (2, 3, 5, 6, 7) else left_align
            cell.border = grid_border
            if c_idx == 5:
                if val == "OVERDUE":
                    cell.font = overdue_font
                    cell.fill = overdue_fill
                elif val == "DUE SOON":
                    cell.font = due_soon_font
                    cell.fill = due_soon_fill
                else:
                    cell.font = missing_font
                    cell.fill = missing_fill
        d_row += 1

    ws3.freeze_panes = "A2"
    ws3.auto_filter.ref = f"A1:{get_column_letter(len(def_headers))}{max(d_row - 1, 1)}"
    def_widths = [22, 13, 18, 38, 16, 15, 24, 32]
    for idx, w in enumerate(def_widths, start=1):
        ws3.column_dimensions[get_column_letter(idx)].width = w

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def build_matrix_pdf(data: dict[str, Any]) -> bytes:
    """Generate high-resolution landscape A4 PDF report using fitz (PyMuPDF)."""
    import fitz

    doc = fitz.open()

    # Dimensions for A4 Landscape
    PAGE_WIDTH = 842
    PAGE_HEIGHT = 595
    LEFT_MARGIN = 40
    RIGHT_MARGIN = 40
    USABLE_WIDTH = PAGE_WIDTH - LEFT_MARGIN - RIGHT_MARGIN

    summary = data.get("summary", {})
    rows = data.get("rows", [])
    columns = data.get("columns", [])

    # Maximum certificates to display as matrix columns on landscape page
    MAX_CERT_COLS = min(len(columns), 7)
    display_cols = columns[:MAX_CERT_COLS]

    # Calculate column widths
    VESSEL_W = 120
    IMO_W = 55
    TYPE_W = 75
    RATE_W = 60
    fixed_w = VESSEL_W + IMO_W + TYPE_W + RATE_W
    cert_w = (USABLE_WIDTH - fixed_w) / max(len(display_cols), 1)

    # Pagination: ~14 vessels per page
    VESSELS_PER_PAGE = 14
    total_pages = max(1, (len(rows) + VESSELS_PER_PAGE - 1) // VESSELS_PER_PAGE)

    for page_idx in range(total_pages):
        page = doc.new_page(width=PAGE_WIDTH, height=PAGE_HEIGHT)
        page_vessels = rows[page_idx * VESSELS_PER_PAGE : (page_idx + 1) * VESSELS_PER_PAGE]

        # Top Header Banner
        page.draw_rect(fitz.Rect(LEFT_MARGIN, 30, PAGE_WIDTH - RIGHT_MARGIN, 74), color=None, fill=(0.043, 0.165, 0.290))
        page.insert_text(fitz.Point(LEFT_MARGIN + 14, 52), "OZELLAR MARINE", fontsize=13, fontname="helv", color=(1, 1, 1))
        page.insert_text(fitz.Point(LEFT_MARGIN + 14, 66), "FLEET COMPLIANCE MATRIX — PORT STATE CONTROL (PSC) & VETTING AUDIT", fontsize=8.5, fontname="helv", color=(0.8, 0.9, 1))

        gen_date = f"Audit Date: {data.get('generated_at', '')}  |  Page {page_idx + 1} of {total_pages}"
        page.insert_text(fitz.Point(PAGE_WIDTH - RIGHT_MARGIN - 230, 58), gen_date, fontsize=8, fontname="helv", color=(0.75, 0.85, 0.95))

        # KPI Summary Cards (on first page)
        curr_y = 86
        if page_idx == 0:
            kpi_box_w = (USABLE_WIDTH - 30) / 4
            kpis = [
                ("FLEET COMPLIANCE", f"{summary.get('average_compliance_rate', 0)}%", (0.05, 0.45, 0.35)),
                ("TOTAL VESSELS", str(summary.get("total_vessels", 0)), (0.07, 0.25, 0.45)),
                ("VALID CERTS", str(summary.get("total_valid", 0)), (0.08, 0.58, 0.42)),
                ("DEFICIENCIES (OVERDUE/MISSING)", str(summary.get("total_overdue", 0) + summary.get("total_missing", 0)), (0.85, 0.2, 0.2)),
            ]
            for i, (k_title, k_val, k_color) in enumerate(kpis):
                bx = LEFT_MARGIN + i * (kpi_box_w + 10)
                by = curr_y
                page.draw_rect(fitz.Rect(bx, by, bx + kpi_box_w, by + 34), color=(0.85, 0.9, 0.95), fill=(0.96, 0.98, 1))
                page.insert_text(fitz.Point(bx + 8, by + 13), k_title, fontsize=6.5, fontname="helv", color=(0.4, 0.48, 0.58))
                page.insert_text(fitz.Point(bx + 8, by + 28), k_val, fontsize=12, fontname="helv", color=k_color)
            curr_y += 44

        # Table Header Row
        hdr_h = 24
        page.draw_rect(fitz.Rect(LEFT_MARGIN, curr_y, PAGE_WIDTH - RIGHT_MARGIN, curr_y + hdr_h), color=None, fill=(0.118, 0.227, 0.541))
        
        # Headers
        page.insert_text(fitz.Point(LEFT_MARGIN + 6, curr_y + 16), "Vessel Name", fontsize=8, fontname="helv", color=(1, 1, 1))
        page.insert_text(fitz.Point(LEFT_MARGIN + VESSEL_W + 6, curr_y + 16), "IMO", fontsize=8, fontname="helv", color=(1, 1, 1))
        page.insert_text(fitz.Point(LEFT_MARGIN + VESSEL_W + IMO_W + 6, curr_y + 16), "Type", fontsize=8, fontname="helv", color=(1, 1, 1))
        page.insert_text(fitz.Point(LEFT_MARGIN + VESSEL_W + IMO_W + TYPE_W + 6, curr_y + 16), "Compliance", fontsize=8, fontname="helv", color=(1, 1, 1))

        for c_i, c_col in enumerate(display_cols):
            cx = LEFT_MARGIN + fixed_w + c_i * cert_w
            # Shorten cert name if needed
            c_label = c_col["name"][:14] + "…" if len(c_col["name"]) > 15 else c_col["name"]
            page.insert_text(fitz.Point(cx + 4, curr_y + 16), c_label, fontsize=7.5, fontname="helv", color=(1, 1, 1))

        curr_y += hdr_h

        # Table Body Rows
        row_h = 24
        for r_idx, v_row in enumerate(page_vessels):
            ry = curr_y + r_idx * row_h
            bg_color = (0.98, 0.99, 1.0) if r_idx % 2 == 1 else (1.0, 1.0, 1.0)
            page.draw_rect(fitz.Rect(LEFT_MARGIN, ry, PAGE_WIDTH - RIGHT_MARGIN, ry + row_h), color=(0.88, 0.92, 0.96), fill=bg_color)

            # Vessel Info
            v_name = v_row["vessel_name"]
            if len(v_name) > 18:
                v_name = v_name[:17] + "…"
            page.insert_text(fitz.Point(LEFT_MARGIN + 6, ry + 15), v_name, fontsize=8, fontname="helv", color=(0.08, 0.12, 0.18))
            page.insert_text(fitz.Point(LEFT_MARGIN + VESSEL_W + 6, ry + 15), v_row["vessel_imo"], fontsize=7.5, fontname="helv", color=(0.3, 0.35, 0.42))
            
            v_type = v_row["vessel_type"] or "—"
            if len(v_type) > 11:
                v_type = v_type[:10] + "…"
            page.insert_text(fitz.Point(LEFT_MARGIN + VESSEL_W + IMO_W + 6, ry + 15), v_type, fontsize=7.5, fontname="helv", color=(0.3, 0.35, 0.42))

            # Compliance Badge
            c_rate = v_row["compliance_rate"]
            badge_color = (0.08, 0.62, 0.42) if c_rate >= 100 else ((0.85, 0.55, 0.05) if c_rate >= 80 else (0.85, 0.15, 0.15))
            page.insert_text(fitz.Point(LEFT_MARGIN + VESSEL_W + IMO_W + TYPE_W + 6, ry + 15), f"{c_rate}%", fontsize=8, fontname="helv", color=badge_color)

            # Cert Cells
            cell_lookup = {item["master_id"]: item for item in v_row.get("cells", [])}
            for c_i, c_col in enumerate(display_cols):
                cx = LEFT_MARGIN + fixed_w + c_i * cert_w
                item = cell_lookup.get(c_col["id"])
                if not item:
                    page.insert_text(fitz.Point(cx + 6, ry + 15), "—", fontsize=7.5, fontname="helv", color=(0.6, 0.65, 0.7))
                    continue

                st = item["status"]
                if st == "valid":
                    st_text = "VALID"
                    st_col = (0.05, 0.55, 0.35)
                elif st == "due_soon":
                    st_text = "DUE SOON"
                    st_col = (0.8, 0.48, 0.05)
                elif st == "overdue":
                    st_text = "OVERDUE"
                    st_col = (0.85, 0.15, 0.15)
                else:
                    st_text = "MISSING"
                    st_col = (0.55, 0.6, 0.65)

                page.insert_text(fitz.Point(cx + 6, ry + 15), st_text, fontsize=7, fontname="helv", color=st_col)

        # Footer
        footer_y = PAGE_HEIGHT - 22
        page.draw_line(fitz.Point(LEFT_MARGIN, footer_y - 8), fitz.Point(PAGE_WIDTH - RIGHT_MARGIN, footer_y - 8), color=(0.85, 0.88, 0.92), width=0.6)
        page.insert_text(fitz.Point(LEFT_MARGIN, footer_y), "Confidential — For Authorized Port State Control & Oil Major Vetting Audit Use Only", fontsize=7.5, fontname="helv", color=(0.55, 0.6, 0.68))
        page.insert_text(fitz.Point(PAGE_WIDTH - RIGHT_MARGIN - 90, footer_y), f"Page {page_idx + 1} of {total_pages}", fontsize=7.5, fontname="helv", color=(0.55, 0.6, 0.68))

    return doc.tobytes()
