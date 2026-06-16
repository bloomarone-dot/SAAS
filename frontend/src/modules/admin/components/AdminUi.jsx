import { useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { validationFor } from "@/utils/validation";

export function AdminPage({ eyebrow, title, subtitle, action, children }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          {eyebrow && (
            <p className="text-sm font-black text-[var(--dashboard-primary)]">{eyebrow}</p>
          )}
          <h1 className="mt-1 text-2xl font-bold tracking-normal text-slate-800">{title}</h1>
          {subtitle && <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// Box AdminLTE : bordure haute (thème), en-tête + outils repliables, corps, pied.
export function AdminCard({ title, icon, action, children, footer, collapsible = false, bodyClassName, className = "" }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasHeader = title || action || icon;

  return (
    <div className={`lte-card ${className}`}>
      {hasHeader && (
        <div className="lte-card-header">
          <h2 className="lte-card-title">
            {icon && <DashboardIcon name={icon} size={17} />}
            {title}
          </h2>
          <div className="lte-card-tools">
            {action}
            {collapsible && (
              <button type="button" onClick={() => setCollapsed((value) => !value)} className="lte-tool-btn" title={collapsed ? "Déplier" : "Replier"}>
                <DashboardIcon name={collapsed ? "Plus" : "Minus"} size={14} />
              </button>
            )}
          </div>
        </div>
      )}
      {!collapsed && <div className={bodyClassName ?? (hasHeader ? "lte-card-body" : "")}>{children}</div>}
      {!collapsed && footer && <div className="lte-card-footer">{footer}</div>}
    </div>
  );
}

// Table AdminLTE : <DataTable head={["Col", ...]}>{rows}</DataTable>
export function DataTable({ head = [], children, minWidth, striped = false, className = "" }) {
  return (
    <div className="overflow-x-auto">
      <table className={`lte-table ${striped ? "lte-table-striped" : ""} ${className}`} style={minWidth ? { minWidth } : undefined}>
        {head.length > 0 && (
          <thead>
            <tr>
              {head.map((label, index) => (
                <th key={typeof label === "string" ? label : index} className={typeof label === "object" && label?.align === "right" ? "text-right" : undefined}>
                  {typeof label === "object" ? label.label : label}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// Pied de table AdminLTE : compteur d'éléments + actions de pagination optionnelles.
export function TableFooter({ count, label = "élément", plural, right, flush = true, className = "" }) {
  const word = count === 1 ? label : plural ?? `${label}s`;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-xs font-semibold text-slate-500 ${flush ? "-mx-4 -mb-4 mt-3" : ""} ${className}`}>
      <span>{count.toLocaleString("fr-FR")} {word}</span>
      {right}
    </div>
  );
}

export function AdminKpis({ items }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded bg-white p-3 shadow-sm sm:p-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full sm:h-14 sm:w-14 ${item.tone === "warn" ? "bg-orange-50 text-orange-500" : "bg-emerald-50 text-[var(--dashboard-primary)]"}`}>
              <DashboardIcon name={item.icon} size={22} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-600 sm:text-sm">{item.label}</p>
              <p className="mt-1 truncate text-xl font-black text-slate-950 sm:text-3xl">{item.value}</p>
              {item.trend && <p className="mt-1 truncate text-xs font-black text-emerald-600 sm:mt-2">↗ {item.trend}</p>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PrimaryAction({ icon = "Plus", children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`lte-btn lte-btn-primary ${props.className ?? ""}`}
    >
      <DashboardIcon name={icon} size={17} />
      {children}
    </button>
  );
}

export function SecondaryAction({ icon, children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`lte-btn lte-btn-default ${props.className ?? ""}`}
    >
      {icon && <DashboardIcon name={icon} size={16} />}
      {children}
    </button>
  );
}

export function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="flex h-10 items-center gap-2 rounded border border-slate-300 bg-white px-3 focus-within:border-[var(--dashboard-primary)]">
      <DashboardIcon name="Search" size={16} className="text-slate-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
      />
    </label>
  );
}

export function Field({ label, required, hint, as = "input", children, className = "", ...props }) {
  const Component = as;
  return (
    <label className={`lte-form-group ${className}`}>
      {label && (
        <span className="lte-label">
          {label} {required && <span className="req">*</span>}
        </span>
      )}
      {children ?? (
        <Component
          {...props}
          {...validationFor(props.name)}
          className="form-control"
        />
      )}
      {hint && <span className="lte-help">{hint}</span>}
    </label>
  );
}

export function StatusPill({ children, tone = "green" }) {
  const colors = {
    green: "bg-emerald-50 text-emerald-700",
    orange: "bg-orange-50 text-orange-600",
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-600",
    slate: "bg-slate-100 text-slate-600",
    purple: "bg-violet-50 text-violet-700",
  };
  return <span className={`inline-flex items-center rounded-md px-3 py-1 text-xs font-black ${colors[tone] ?? colors.slate}`}>{children}</span>;
}

export function IconButton({ icon, title, tone = "slate", ...props }) {
  const color = tone === "red" ? "text-red-600 hover:bg-red-50" : "text-slate-700 hover:border-[var(--dashboard-primary)] hover:text-[var(--dashboard-primary)]";
  return (
    <button
      type="button"
      title={title}
      {...props}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white ${color} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <DashboardIcon name={icon} size={16} />
    </button>
  );
}

export function EmptyState({ icon = "ClipboardList", title, text }) {
  return (
    <div className="px-5 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-emerald-50 text-[var(--dashboard-primary)]">
        <DashboardIcon name={icon} size={24} />
      </div>
      <p className="mt-4 text-lg font-black text-[var(--dashboard-secondary)]">{title}</p>
      {text && <p className="mt-1 text-sm font-medium text-slate-500">{text}</p>}
    </div>
  );
}
