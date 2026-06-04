import { DashboardIcon } from "@/components/dashboard/icons";
import { validationFor } from "@/utils/validation";

export function AdminPage({ eyebrow, title, subtitle, action, children }) {
  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          {eyebrow && (
            <p className="text-sm font-black text-[var(--dashboard-primary)]">{eyebrow}</p>
          )}
          <h1 className="mt-2 text-3xl font-black tracking-normal text-[var(--dashboard-secondary)] md:text-4xl">{title}</h1>
          {subtitle && <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AdminCard({ title, action, children, className = "" }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          {title && <h2 className="text-base font-black text-[var(--dashboard-secondary)]">{title}</h2>}
          {action}
        </div>
      )}
      <div className={title || action ? "p-5" : ""}>{children}</div>
    </div>
  );
}

export function AdminKpis({ items }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${item.tone === "warn" ? "bg-orange-50 text-orange-500" : "bg-emerald-50 text-[var(--dashboard-primary)]"}`}>
              <DashboardIcon name={item.icon} size={24} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-600">{item.label}</p>
              <p className="mt-1 text-3xl font-black text-slate-950">{item.value}</p>
              {item.trend && <p className="mt-2 text-xs font-black text-emerald-600">↗ {item.trend}</p>}
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
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[var(--dashboard-primary)] px-5 text-sm font-black text-white shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 ${props.className ?? ""}`}
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
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:border-[var(--dashboard-primary)] hover:text-[var(--dashboard-primary)] disabled:cursor-not-allowed disabled:opacity-60 ${props.className ?? ""}`}
    >
      {icon && <DashboardIcon name={icon} size={16} />}
      {children}
    </button>
  );
}

export function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4">
      <DashboardIcon name="Search" size={18} className="text-slate-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
      />
    </label>
  );
}

export function Field({ label, required, as = "input", children, className = "", ...props }) {
  const Component = as;
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-xs font-black text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children ?? (
        <Component
          {...props}
          {...validationFor(props.name)}
          className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none transition focus:border-[var(--dashboard-primary)] focus:ring-4 focus:ring-emerald-50"
        />
      )}
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
