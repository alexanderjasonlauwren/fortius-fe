/**
 * Client-side file export.
 *
 * A real backend would stream these from a reporting endpoint; here we build
 * them in the browser so every "Unduh" button in the console actually produces
 * a file the user can open.
 */

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give Safari a beat to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeCell(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function timestampSuffix(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
}

/**
 * Exports rows as CSV. Uses `;` — Excel on Indonesian locales splits on
 * semicolons, and comma-separated files open as a single column.
 */
export function exportCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
) {
  const lines = [
    headers.map(escapeCell).join(";"),
    ...rows.map((row) => row.map(escapeCell).join(";")),
  ];
  // BOM so Excel reads UTF-8 (Indonesian names carry accents).
  const blob = new Blob(["﻿" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  download(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

/* ── Excel ─────────────────────────────────────────────────────────────── */

export type ExcelValue = string | number | Date | null | undefined;

export interface ExcelColumn<T> {
  header: string;
  value: (row: T) => ExcelValue;
  /** Drives the cell type, so numbers stay summable and dates stay sortable. */
  type?: "text" | "number" | "currency" | "date";
  /** Column width in characters. */
  width?: number;
}

/** Excel refuses to open a workbook containing raw control characters. */
function stripControlChars(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl = code < 0x20 || (code >= 0x7f && code <= 0x9f);
    const isAllowedWhitespace = code === 0x09 || code === 0x0a || code === 0x0d;
    if (isControl && !isAllowedWhitespace) continue;
    out += ch;
  }
  return out;
}

function xmlEscape(value: string): string {
  return stripControlChars(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function excelCell(value: ExcelValue, type: ExcelColumn<unknown>["type"]) {
  if (value == null || value === "") return `<Cell/>`;

  if (type === "number" || type === "currency") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return `<Cell><Data ss:Type="String">${xmlEscape(String(value))}</Data></Cell>`;
    const style = type === "currency" ? "rp" : "num";
    return `<Cell ss:StyleID="${style}"><Data ss:Type="Number">${n}</Data></Cell>`;
  }

  if (type === "date") {
    const d = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(d.getTime()))
      return `<Cell><Data ss:Type="String">${xmlEscape(String(value))}</Data></Cell>`;
    const pad = (n: number) => String(n).padStart(2, "0");
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours(),
    )}:${pad(d.getMinutes())}:00.000`;
    return `<Cell ss:StyleID="dt"><Data ss:Type="DateTime">${iso}</Data></Cell>`;
  }

  return `<Cell><Data ss:Type="String">${xmlEscape(String(value))}</Data></Cell>`;
}

/**
 * Writes a real spreadsheet rather than a CSV.
 *
 * Uses SpreadsheetML 2003, which Excel and LibreOffice open natively and which
 * needs no dependency — the point being that numbers arrive as numbers and
 * dates as dates, so the recipient can sum a column or pivot it without
 * re-typing anything. A CSV loses all of that.
 */
export function exportExcel<T>(
  filename: string,
  sheetName: string,
  columns: ExcelColumn<T>[],
  rows: T[],
) {
  const header = columns
    .map((c) => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${xmlEscape(c.header)}</Data></Cell>`)
    .join("");

  const body = rows
    .map(
      (row) =>
        `<Row>${columns.map((c) => excelCell(c.value(row), c.type)).join("")}</Row>`,
    )
    .join("");

  const cols = columns
    .map((c) => `<Column ss:AutoFitWidth="0" ss:Width="${(c.width ?? 16) * 7}"/>`)
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Top"/><Font ss:FontName="Calibri" ss:Size="11"/></Style>
  <Style ss:ID="hdr">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#171A16" ss:Pattern="Solid"/>
   <Alignment ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="num"><NumberFormat ss:Format="#,##0"/></Style>
  <Style ss:ID="rp"><NumberFormat ss:Format="&quot;Rp&quot;\\ #,##0"/></Style>
  <Style ss:ID="dt"><NumberFormat ss:Format="dd/mm/yyyy"/></Style>
 </Styles>
 <Worksheet ss:Name="${xmlEscape(sheetName).slice(0, 31)}">
  <Table>
   ${cols}
   <Row ss:Height="20">${header}</Row>
   ${body}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal>
   <TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;

  download(new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" }),
    filename.endsWith(".xls") ? filename : `${filename}.xls`);
}

export function exportJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  download(blob, filename.endsWith(".json") ? filename : `${filename}.json`);
}

/**
 * Escapes text for a printDocument body. Everything a user typed --
 * descriptions, names, references -- goes through this: the print frame
 * shares this origin, so unescaped markup there would run as the console.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Opens the browser print dialog against a standalone document, which is how
 * the console produces a PDF (surat jalan, monthly recap) without a server.
 */
export function printDocument(title: string, bodyHtml: string) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }

  doc.open();
  doc.write(`<!doctype html><html lang="id"><head><meta charset="utf-8" />
<title>${title}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Archivo", Helvetica, Arial, sans-serif; color: #171a16; font-size: 11px; }
  h1 { font-size: 18px; letter-spacing: -0.02em; margin: 0 0 2px; }
  .eyebrow { font-size: 9px; letter-spacing: .12em; text-transform: uppercase; color: #676b62; }
  .rule { border: 0; border-top: 2px solid #171a16; margin: 10px 0 14px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th { text-align: left; font-size: 9px; letter-spacing: .09em; text-transform: uppercase;
       color: #676b62; border-bottom: 1px solid #171a16; padding: 6px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid #e1e3dc; vertical-align: top; }
  .num { font-family: "IBM Plex Mono", ui-monospace, monospace; text-align: right; font-variant-numeric: tabular-nums; }
  .code { font-family: "IBM Plex Mono", ui-monospace, monospace; }
  tfoot td { font-weight: 700; border-top: 2px solid #171a16; border-bottom: 0; }
  .meta { display: flex; gap: 28px; margin-top: 6px; }
  .meta div { font-size: 10px; color: #676b62; }
  .meta strong { display: block; color: #171a16; font-size: 11px; }
  .sign { margin-top: 42px; display: flex; justify-content: space-between; }
  .sign div { width: 40%; font-size: 10px; color: #676b62; }
  .sign span { display: block; margin-top: 46px; border-top: 1px solid #171a16; padding-top: 4px; color: #171a16; }
</style></head><body>${bodyHtml}</body></html>`);
  doc.close();

  const run = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  };

  if (doc.readyState === "complete") setTimeout(run, 250);
  else frame.onload = () => setTimeout(run, 250);
}
