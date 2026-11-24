"""Report of every document in every vessel folder — all vessels and all
groups in one table / one Excel workbook (replaces downloading one workbook
per vessel from the Migration Assistant's "Vessel Excel Export").

Columns:  Document Name (link) · Vessel Name · Main Folder · Group · Category
- Main Folder = the folder above the vessel (e.g. "Technical and Crewing New",
                "Commercial and Chartering", "Insurance");
- Group       = the folder directly under the vessel (Month End Reports,
                Registration, Certificates, Incidents, To be Classified …).
                The "Drawings and Manuals" wrapper is split into "Drawings"
                and "Manuals", as in the old per-vessel workbook;
- Category    = the folder directly inside the group (e.g. "Electrical");
                a file placed directly in the group gets "General".
Only files inside a vessel's folder are included. In the workbook the header
row has filter drop-downs (Excel AutoFilter) and stays frozen.

Sheet "Summary": per vessel, the number of documents in each group.

Built from the cached dashboard document index (get_dashboard_documents),
so it never walks SharePoint itself and is fast for every vessel at once.
"""
from __future__ import annotations

import io

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

GENERAL = "General"
VESSEL_ROOT = "(Vessel folder)"
_DRAWING_MANUAL = {"drawings": "Drawings", "drawing": "Drawings", "manuals": "Manuals", "manual": "Manuals"}
_HEADER_FILL = PatternFill("solid", fgColor="0B2A4A")
_HEADER_FONT = Font(bold=True, color="FFFFFF")
_LINK_FONT = Font(color="0563C1", underline="single")
COLUMNS = [("name", "Document Name", 60), ("vessel", "Vessel Name", 24), ("main_folder", "Main Folder", 28),
           ("group", "Group", 24), ("category", "Category", 28)]


def _is_wrapper(folder: str) -> bool:
    """'Drawings and Manuals' — a container whose children are the real groups."""
    f = folder.casefold()
    return "drawing" in f and "manual" in f


def classify(doc: dict) -> tuple[str, str, str] | None:
    """(main_folder, group, category) for a file inside a vessel's folder, else None."""
    vessel = (doc.get("vessel") or "").strip()
    if not vessel or vessel == "Not Listed":
        return None
    parts = [" ".join(p.split()) for p in (doc.get("subFolderPath") or "").split(">") if p.strip()]
    lowered = [p.casefold() for p in parts]
    v = " ".join(vessel.split()).casefold()
    if v not in lowered:
        return None
    at = lowered.index(v)
    main_folder = parts[at - 1] if at >= 1 else ""
    rel = parts[at + 1:]
    if not rel:
        return main_folder, VESSEL_ROOT, GENERAL
    i = 0
    group = rel[0]
    if _is_wrapper(rel[0]) and len(rel) > 1:
        i = 1
        group = _DRAWING_MANUAL.get(rel[1].casefold(), rel[1])
    elif rel[0].casefold() in _DRAWING_MANUAL:
        group = _DRAWING_MANUAL[rel[0].casefold()]
    category = rel[i + 1] if i + 1 < len(rel) else GENERAL
    return main_folder, group, category


def _style_header(ws, widths: list[int], last_row: int) -> None:
    for i, width in enumerate(widths, start=1):
        cell = ws.cell(row=1, column=i)
        cell.fill, cell.font = _HEADER_FILL, _HEADER_FONT
        cell.alignment = Alignment(vertical="center")
        ws.column_dimensions[get_column_letter(i)].width = width
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(widths))}{max(last_row, 1)}"


def report_rows(docs: list[dict]) -> list[dict]:
    """The report's rows (files in vessel folders), sorted by vessel, main
    folder, group, category, name — the same rows the Reports page shows."""
    rows = []
    for d in docs:
        hit = classify(d)
        if hit:
            rows.append({"name": d.get("name") or "", "vessel": d["vessel"].strip(), "main_folder": hit[0],
                         "group": hit[1], "category": hit[2], "web_url": d.get("webUrl") or "", "id": d.get("id")})
    rows.sort(key=lambda r: (r["vessel"].casefold(), r["main_folder"].casefold(), r["group"].casefold(),
                             r["category"].casefold(), r["name"].casefold()))
    return rows


def filter_rows(rows: list[dict], vessels: list[str] | None = None, categories: list[str] | None = None,
                groups: list[str] | None = None, q: str | None = None,
                names: list[str] | None = None, main_folders: list[str] | None = None) -> list[dict]:
    """Same filters as the Reports page: each list keeps rows whose value is
    in it (empty = no filter); q matches any column (case-insensitive)."""
    def keep(values):
        return {v.casefold() for v in values or [] if v is not None}
    wanted = {"vessel": keep(vessels), "category": keep(categories), "group": keep(groups),
              "name": keep(names), "main_folder": keep(main_folders)}
    needle = (q or "").strip().casefold()
    out = []
    for r in rows:
        if any(vals and r[key].casefold() not in vals for key, vals in wanted.items()):
            continue
        if needle and not any(needle in str(r[k]).casefold() for k, _label, _w in COLUMNS):
            continue
        out.append(r)
    return out


def build_workbook(docs: list[dict], rows: list[dict] | None = None) -> bytes:
    """Workbook for `rows` (already filtered), or every row derived from `docs`."""
    rows = rows if rows is not None else report_rows(docs)

    wb = Workbook()
    ws = wb.active
    ws.title = "Documents"
    ws.append([label for _k, label, _w in COLUMNS])
    for r in rows:
        ws.append([r[k] for k, _label, _w in COLUMNS])
        if r.get("web_url"):
            cell = ws.cell(row=ws.max_row, column=1)
            cell.hyperlink = r["web_url"]
            cell.font = _LINK_FONT
    _style_header(ws, [w for _k, _l, w in COLUMNS], ws.max_row)

    groups = sorted({r["group"] for r in rows}, key=str.casefold)
    counts: dict[str, dict[str, int]] = {}
    for r in rows:
        c = counts.setdefault(r["vessel"], {})
        c[r["group"]] = c.get(r["group"], 0) + 1
    ss = wb.create_sheet("Summary")
    ss.append(["Vessel Name", *groups, "Total"])
    for vessel in sorted(counts, key=str.casefold):
        c = counts[vessel]
        ss.append([vessel, *[c.get(g, 0) for g in groups], sum(c.values())])
    last = ss.max_row
    if counts:
        ss.append(["Total", *[sum(counts[v].get(g, 0) for v in counts) for g in groups],
                   sum(sum(c.values()) for c in counts.values())])
        for col in range(1, len(groups) + 3):
            ss.cell(row=ss.max_row, column=col).font = Font(bold=True)
    _style_header(ss, [28, *[max(12, min(24, len(g) + 4)) for g in groups], 10], last)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
