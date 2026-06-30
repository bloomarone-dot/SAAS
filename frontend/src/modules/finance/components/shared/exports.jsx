import { Download } from "lucide-react";

import { today } from "./format";

export function ExportActions({ title, filename, rows, columns, onExport }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={async () => {
          await onExport?.("excel");
          exportExcel(`${filename}-${today()}.xls`, title, rows, columns);
        }}
        className="lte-btn lte-btn-default"
      >
        <Download size={16} />
        Exporter Excel
      </button>
      <button
        type="button"
        onClick={async () => {
          await onExport?.("pdf");
          exportPdf(title, rows, columns);
        }}
        className="lte-btn lte-btn-default"
      >
        <Download size={16} />
        Exporter PDF
      </button>
    </div>
  );
}

export function exportExcel(filename, title, rows, columns) {
  const blob = new Blob([buildExportDocument(title, rows, columns)], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportPdf(title, rows, columns) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    window.alert("Export PDF bloqué par le navigateur.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(buildExportDocument(title, rows, columns, true));
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);
}

function buildExportDocument(title, rows, columns, printable = false) {
  const exportedAt = new Date().toLocaleString("fr-FR");
  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #172033; padding: ${printable ? "28px" : "12px"}; }
          h1 { margin: 0 0 6px; color: #0f172a; }
          p { margin: 0 0 16px; color: #475569; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #0f172a; color: white; text-align: left; }
          th, td { border: 1px solid #d8dee9; padding: 8px; }
          tr:nth-child(even) td { background: #f8fafc; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p>Exporté le ${escapeHtml(exportedAt)}</p>
        <table>
          <thead><tr>${columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead>
          <tbody>${rows.map((row) => `<tr>${columns.map(([key]) => `<td>${escapeHtml(row[key])}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </body>
    </html>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
