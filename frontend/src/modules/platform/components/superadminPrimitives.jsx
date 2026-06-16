import { useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { nextSort, SortButton, sortRows } from "@/utils/sort";
import { formatApiError } from "@/utils/network";

// Primitives UI et utilitaires partages des sections superadmin.
// Extrait de SuperadminSections.jsx pour reduire la taille du composant.

export function AdminSurface({ eyebrow, title, description, actionLabel, onAction, actions, children }) {
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-normal text-[#f04438]">
            {eyebrow}
          </p>
          <h1 className="text-4xl font-black text-[#07133d]">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[#64708b]">
            {description}
          </p>
        </div>
        {actions ?? (actionLabel ? (
          <button type="button" onClick={onAction} className="h-11 bg-[#07133d] px-5 text-sm font-black text-white transition-all hover:bg-[#172554]">
            {actionLabel}
          </button>
        ) : null)}
      </div>
      {children}
    </section>
  );
}

export function Toolbar({ children }) {
  return (
    <div className="grid gap-3 border border-[#eadfd7] bg-white p-4 shadow-[0_14px_40px_rgba(15,23,42,0.04)] xl:grid-cols-[1fr_repeat(3,auto)]">
      {children}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="flex h-11 items-center gap-3 border border-[#eadfd7] bg-white px-4">
      <DashboardIcon name="Search" size={18} className="text-[#667085]" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-sm font-semibold text-[#172033] outline-none placeholder:text-[#98a2b3]"
      />
    </label>
  );
}

export function FilterSelect({ value, onChange, options }) {
  return (
    <label className="flex h-11 items-center gap-3 border border-[#eadfd7] bg-white px-4">
      <DashboardIcon name="SlidersHorizontal" size={18} className="text-[#f04438]" />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent text-sm font-black text-[#172033] outline-none"
      >
        {options.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Metric({ label, value }) {
  return (
    <div className="min-w-[120px] border border-[#eadfd7] px-4 py-2 text-center text-xs font-black">
      <p className="text-[#98a2b3]">{label}</p>
      <p className="mt-1 text-base text-[#07133d]">{value}</p>
    </div>
  );
}

export function MetricCard({ icon, label, value }) {
  return (
    <div className="border border-[#eadfd7] bg-white p-5">
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center bg-[#fff4ed] text-[#f04438]">
          <DashboardIcon name={icon} size={22} />
        </div>
        <div>
          <p className="text-xs font-black uppercase text-[#98a2b3]">{label}</p>
          <p className="mt-1 text-2xl font-black text-[#07133d]">{value}</p>
        </div>
      </div>
    </div>
  );
}

export function DataTable({ columns, sort, onSort, emptyTitle, emptyText, children }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <div className="overflow-hidden border border-[#eadfd7] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
      <div className="overflow-x-auto">
        <table className="lte-table min-w-[860px]">
          <thead className="bg-[#fffaf5] text-xs font-black uppercase text-[#9a3412]">
            <tr>
              {columns.map((column) => {
                const config = typeof column === "string" ? { label: column } : column;
                return (
                <th key={config.label} className="px-5 py-4 last:text-right">
                  {config.key ? (
                    <SortButton label={config.label} column={config.key} sort={sort} onSort={onSort} />
                  ) : (
                    config.label
                  )}
                </th>
              );
              })}
            </tr>
          </thead>
          <tbody>
            {hasRows ? (
              children
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center">
                  <p className="text-lg font-black text-[#07133d]">{emptyTitle}</p>
                  <p className="mt-2 text-sm font-semibold text-[#64708b]">{emptyText}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StatusBadge({ status }) {
  const className =
    status === "Actif"
      ? "bg-emerald-100 text-emerald-700"
      : status === "Attention"
        ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-600";

  return <span className={`px-3 py-1 text-xs font-black ${className}`}>{status}</span>;
}

export function TableAction({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border border-[#eadfd7] px-3 py-1.5 text-xs font-black text-[#172033] hover:border-[#f04438] hover:text-[#f04438]"
    >
      {label}
    </button>
  );
}

export function SettingsPanel({ title, children }) {
  return (
    <div className="border border-[#eadfd7] bg-white p-5">
      <h2 className="font-black text-[#07133d]">{title}</h2>
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  );
}

export function DetailLine({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border border-[#eadfd7] bg-[#fffaf5] px-4 py-3 text-sm">
      <span className="font-black text-[#64708b]">{label}</span>
      <span className="text-right font-bold text-[#172033]">{value ?? "-"}</span>
    </div>
  );
}

export function SubscriptionEditor({ row, form, onChange, onSubmit, isSaving }) {
  if (!row || !form) {
    return (
      <div className="border border-[#eadfd7] bg-[#fffaf5] p-5">
        <h2 className="font-black text-[#07133d]">Configuration abonnement</h2>
        <p className="mt-3 text-sm font-semibold leading-6 text-[#64708b]">
          Sélectionnez un restaurant dans le tableau pour définir son plan, son montant, son statut et la date de renouvellement.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="border border-[#eadfd7] bg-[#fffaf5] p-5">
      <h2 className="font-black text-[#07133d]">{row.restaurant_name}</h2>
      <p className="mt-1 text-xs font-semibold text-[#64708b]">{row.restaurant_slug}</p>
      <div className="mt-5 space-y-4">
        <TextField label="Plan" value={form.plan} onChange={(value) => onChange({ ...form, plan: value })} required />
        <TextField label="Montant mensuel" type="number" min="0" value={form.amount} onChange={(value) => onChange({ ...form, amount: value })} required />
        <TextField label="Devise" value={form.currency} maxLength={3} onChange={(value) => onChange({ ...form, currency: value.toUpperCase() })} required />
        <SelectField
          label="Statut"
          value={form.status}
          onChange={(value) => onChange({ ...form, status: value })}
          options={["Actif", "A configurer", "Suspendu", "En retard"]}
        />
        <TextField label="Renouvellement" type="date" value={form.renewal_date} onChange={(value) => onChange({ ...form, renewal_date: value })} />
        <label className="block">
          <span className="mb-2 block text-sm font-black text-[#172033]">Notes</span>
          <textarea
            value={form.notes}
            onChange={(event) => onChange({ ...form, notes: event.target.value })}
            className="min-h-24 w-full border border-[#eadfd7] bg-white px-4 py-3 text-sm font-semibold text-[#172033] outline-none focus:border-[#f04438]"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={isSaving}
        className="mt-5 w-full lte-btn lte-btn-primary"
      >
        {isSaving ? "Sauvegarde..." : "Sauvegarder l'abonnement"}
      </button>
    </form>
  );
}

export function TextField({ label, value, onChange, type = "text", required, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-[#172033]">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="h-11 w-full border border-[#eadfd7] bg-white px-4 text-sm font-semibold text-[#172033] outline-none focus:border-[#f04438]"
        {...props}
      />
    </label>
  );
}

export function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-[#172033]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full border border-[#eadfd7] bg-white px-4 text-sm font-semibold text-[#172033] outline-none focus:border-[#f04438]"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ToggleField({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 border border-[#eadfd7] bg-white px-4 py-3">
      <span className="text-sm font-black text-[#172033]">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-[#f04438]"
      />
    </label>
  );
}

export function LoadingState({ label }) {
  return (
    <div className="border border-[#eadfd7] bg-white px-6 py-12 text-center text-sm font-black text-[#64708b]">
      {label}
    </div>
  );
}

export function Progress({ label, value, max, suffix = "" }) {
  const percent = Math.min(100, Math.round((value / max) * 100));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm font-black">
        <span className="text-[#172033]">{label}</span>
        <span className="text-[#f04438]">{suffix ? `${value}${suffix}` : `${percent}%`}</span>
      </div>
      <div className="h-2 bg-[#ffead5]">
        <div className="h-full bg-[#f04438]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function formatDate(date) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("fr-FR");
}

export function formatDateTime(date) {
  if (!date) return "-";
  return new Date(date).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatMoney(value, currency) {
  return `${Number(value || 0).toLocaleString("fr-FR")} ${currency || "XAF"}`;
}

export function uniquePlanOptions(rows) {
  const plans = [...new Set(rows.map((row) => row.plan).filter(Boolean))];
  return [["all", "Tous les plans"], ...plans.map((item) => [item, item])];
}

export function optionalText(value) {
  const trimmed = typeof value === "string" ? value.trim() : value;
  return trimmed || null;
}

export async function platformApi(apiBaseUrl, path, options = {}) {
  const token = localStorage.getItem("access_token");
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(formatApiError(data?.detail, "Action plateforme impossible."));
  }
  return data;
}

export function ExportActions({ title, filename, rows, columns, fullWidth = false }) {
  return (
    <div className={`flex flex-wrap gap-2 ${fullWidth ? "w-full" : "justify-end"}`}>
      <button
        type="button"
        onClick={() => exportExcel(`${filename}.xls`, rows, columns, title)}
        className={`${fullWidth ? "flex-1" : ""} inline-flex h-10 items-center justify-center gap-2 border border-[#eadfd7] bg-white px-4 text-sm font-black text-[#172033] hover:border-[#f04438] hover:text-[#f04438]`}
      >
        <DashboardIcon name="FileText" size={16} />
        Exporter en Excel
      </button>
      <button
        type="button"
        onClick={() => exportPdf(title, rows, columns)}
        className={`${fullWidth ? "flex-1" : ""} inline-flex h-10 items-center justify-center gap-2 border border-[#eadfd7] bg-white px-4 text-sm font-black text-[#172033] hover:border-[#f04438] hover:text-[#f04438]`}
      >
        <DashboardIcon name="ReceiptText" size={16} />
        Exporter en PDF
      </button>
    </div>
  );
}

export function exportExcel(filename, rows, columns, title) {
  const html = buildExportTable(title, rows, columns);
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportPdf(title, rows, columns) {
  printHtmlDocument(buildPdfDocument(title, rows, columns), () => {
    window.alert("Export PDF bloqué par le navigateur. Autorisez les fenêtres pop-up puis réessayez.");
  });
}

export function buildExportTable(title, rows, columns) {
  return `
    <html>
      <head><meta charset="utf-8" /></head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        ${buildTableMarkup(rows, columns)}
      </body>
    </html>
  `;
}

export function buildPdfDocument(title, rows, columns) {
  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 28px; color: #172033; }
          h1 { color: #07133d; margin: 0 0 18px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #07133d; color: #fff; text-align: left; }
          th, td { border: 1px solid #d8dee9; padding: 8px; }
          tr:nth-child(even) td { background: #f8fafc; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        ${buildTableMarkup(rows, columns)}
      </body>
    </html>
  `;
}

export function buildTableMarkup(rows, columns) {
  return `
    <table border="1">
      <thead>
        <tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(column.value(row))}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

export function printHtmlDocument(html, onBlocked) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    onBlocked?.();
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  const print = () => {
    printWindow.focus();
    printWindow.print();
  };

  if (printWindow.document.readyState === "complete") {
    setTimeout(print, 250);
    return;
  }

  printWindow.onload = () => setTimeout(print, 250);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const subscriptionExportColumns = [
  { label: "Restaurant", value: (row) => row.restaurant_name },
  { label: "Tenant", value: (row) => row.restaurant_slug },
  { label: "Plan", value: (row) => row.plan },
  { label: "Montant", value: (row) => row.amount },
  { label: "Devise", value: (row) => row.currency },
  { label: "Statut", value: (row) => row.status },
  { label: "Renouvellement", value: (row) => row.renewal_date },
];

export const platformExportColumns = [
  { label: "Service", value: (row) => row.label },
  { label: "Etat", value: (row) => row.value },
  { label: "Statut", value: (row) => row.status },
];

export const paymentExportColumns = [
  { label: "Reference", value: (row) => row.reference },
  { label: "Restaurant", value: (row) => row.restaurant_name },
  { label: "Tenant", value: (row) => row.restaurant_slug },
  { label: "Montant", value: (row) => row.amount },
  { label: "Devise", value: (row) => row.currency },
  { label: "Statut", value: (row) => row.status },
  { label: "Date", value: (row) => formatDateTime(row.paid_at ?? row.due_date) },
  { label: "Methode", value: (row) => row.method },
];

export const ownerExportColumns = [
  { label: "Restaurant", value: (row) => row.restaurant },
  { label: "Tenant", value: (row) => row.tenant },
  { label: "Email", value: (row) => row.email },
  { label: "Statut", value: (row) => row.status },
  { label: "Creation", value: (row) => formatDate(row.createdAt) },
];
