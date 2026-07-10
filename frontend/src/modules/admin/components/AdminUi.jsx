import { useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { PERIOD_OPTIONS } from "@/utils/greeting";
import { validationFor } from "@/utils/validation";

export function AdminPage({ eyebrow, title, subtitle, action, children }) {
  return (
    <section className="space-y-5">
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm xl:flex-row xl:items-end">
        <div>
          {eyebrow && <p className="text-xs font-black uppercase tracking-wide text-[var(--dashboard-primary)]">{eyebrow}</p>}
          <h1 className="mt-1 text-2xl font-bold tracking-normal text-slate-800">{title}</h1>
          {subtitle && <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PageContainer({ children, className = "" }) {
  return <section className={`mx-auto w-full max-w-[1500px] space-y-5 ${className}`}>{children}</section>;
}

export function PageHeader({ eyebrow, title, subtitle, primaryAction, secondaryActions, meta }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="text-xs font-black uppercase tracking-wide text-[var(--dashboard-primary)]">{eyebrow}</p>}
          <h2 className="mt-1 text-2xl font-bold tracking-normal text-slate-900 sm:text-3xl">{title}</h2>
          {subtitle && <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">{subtitle}</p>}
          {meta && <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">{meta}</div>}
        </div>
        {(primaryAction || secondaryActions) && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {secondaryActions}
            {primaryAction}
          </div>
        )}
      </div>
    </div>
  );
}

export function FilterBar({ children, right, className = "" }) {
  return (
    <div className={`flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between ${className}`}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {right && <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon = "BarChart3", trend, tone = "default" }) {
  const tones = {
    default: "bg-slate-50 text-slate-700",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
    info: "bg-sky-50 text-sky-700",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 truncate text-2xl font-black text-slate-950">{value}</p>
          {trend && <p className="mt-1 truncate text-xs font-semibold text-slate-500">{trend}</p>}
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tones[tone] ?? tones.default}`}>
          <DashboardIcon name={icon} size={19} />
        </span>
      </div>
    </div>
  );
}

export function DashboardSection({ title, description, action, children, className = "" }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || action) && (
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title && <h2 className="text-base font-bold text-slate-900">{title}</h2>}
            {description && <p className="mt-1 text-sm font-medium text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
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

export function LoadingState({ label = "Chargement..." }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-40 rounded bg-slate-100" />
        <div className="h-10 rounded bg-slate-100" />
        <div className="h-10 rounded bg-slate-100" />
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-500">{label}</p>
    </div>
  );
}

export function ErrorState({ title = "Une erreur est survenue", text, action }) {
  return (
    <div className="rounded-lg border border-red-100 bg-red-50 p-5 text-red-700">
      <div className="flex gap-3">
        <DashboardIcon name="AlertTriangle" size={20} className="shrink-0" />
        <div>
          <p className="font-black">{title}</p>
          {text && <p className="mt-1 text-sm font-semibold leading-6">{text}</p>}
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}

export function FormSection({ title, description, children, footer, className = "" }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm font-medium text-slate-500">{description}</p>}
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-2">{children}</div>
      {footer && <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">{footer}</div>}
    </section>
  );
}

export function FormFooter({ children, className = "" }) {
  return (
    <div className={`sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-6px_18px_rgba(15,23,42,0.05)] backdrop-blur ${className}`}>
      {children}
    </div>
  );
}

export function Tabs({ items, value, onChange, className = "" }) {
  return (
    <div className={`flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 shadow-sm ${className}`}>
      {items.map((item) => {
        const active = value === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
              active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
            }`}
          >
            {item.icon && <DashboardIcon name={item.icon} size={16} />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function ExportButtons({ onPdf, onExcel, disabled = false }) {
  return (
    <div className="flex flex-wrap gap-2">
      <SecondaryAction icon="FileText" onClick={onPdf} disabled={disabled}>PDF</SecondaryAction>
      <SecondaryAction icon="Download" onClick={onExcel} disabled={disabled}>Excel</SecondaryAction>
    </div>
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

export function AdminFormModal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = "md",
}) {
  if (!open) return null;

  const maxWidth = {
    sm: "max-w-md",
    md: "max-w-xl",
    lg: "max-w-2xl",
    xl: "max-w-3xl",
  }[size] ?? "max-w-xl";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className={`lte-card mb-0 flex max-h-[90vh] w-full flex-col ${maxWidth}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="lte-card-header shrink-0">
          <div>
            <h2 className="lte-card-title">{title}</h2>
            {description && <p className="mt-1 text-sm font-medium text-slate-500">{description}</p>}
          </div>
          <div className="lte-card-tools">
            <button type="button" onClick={onClose} className="lte-tool-btn">
              <DashboardIcon name="X" size={14} />
            </button>
          </div>
        </div>
        <div className="lte-card-body min-h-0 overflow-y-auto">{children}</div>
        {footer && <div className="lte-card-footer shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

export function ModuleFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Rechercher...",
  period,
  onPeriodChange,
  customPeriod,
  onCustomPeriodChange,
  showPeriod = true,
  branchId,
  onBranchChange,
  branches = [],
  showBranch = true,
  children,
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        {onSearchChange != null && (
          <div className="min-w-[200px] flex-1">
            <SearchBox value={search ?? ""} onChange={onSearchChange} placeholder={searchPlaceholder} />
          </div>
        )}
        {showBranch && branches.length > 0 && onBranchChange && (
          <select
            value={branchId ?? ""}
            onChange={(event) => onBranchChange(event.target.value)}
            className="form-control h-10 w-48"
          >
            <option value="">Toutes les branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        )}
        {showPeriod && period != null && onPeriodChange && (
          <select
            value={period}
            onChange={(event) => onPeriodChange(event.target.value)}
            className="form-control h-10 w-44"
          >
            {PERIOD_OPTIONS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
            <option value="custom">Personnalisée</option>
          </select>
        )}
        {period === "custom" && customPeriod && onCustomPeriodChange && (
          <>
            <input
              type="date"
              value={customPeriod.start}
              onChange={(event) => onCustomPeriodChange({ ...customPeriod, start: event.target.value })}
              className="form-control h-10 w-40"
            />
            <input
              type="date"
              value={customPeriod.end}
              onChange={(event) => onCustomPeriodChange({ ...customPeriod, end: event.target.value })}
              className="form-control h-10 w-40"
            />
          </>
        )}
        {children}
      </div>
    </div>
  );
}
