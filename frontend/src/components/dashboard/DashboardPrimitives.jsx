import { useEffect, useState } from "react";

import { DashboardIcon } from "./icons";

export function DashboardHeader({ title, subtitle, right }) {
  const today = useTodayLabel();
  const displayedDate = right ?? today;

  return (
    <div className="hidden">
      <div>
        <h1 className="text-2xl font-black text-slate-950">{title}</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p>
      </div>
      <button className="flex h-10 w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 shadow-sm">
        <DashboardIcon name="CalendarDays" size={16} className="text-slate-500" />
        {displayedDate}
      </button>
    </div>
  );
}

export function formatTodayDate() {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function useTodayLabel() {
  const [today, setToday] = useState(formatTodayDate);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setToday(formatTodayDate());
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  return today;
}

export function KpiGrid({ kpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <MetricCard key={kpi.label} {...kpi} />
      ))}
    </div>
  );
}

function MetricCard({ label, value, trend, icon, tone }) {
  const colors = {
    pink: "bg-[var(--dashboard-primary)]",
    blue: "bg-cyan-500",
    green: "bg-emerald-600",
    purple: "bg-violet-600",
    orange: "bg-amber-500",
  };

  return (
    <div className={`relative min-h-24 overflow-hidden rounded text-white shadow-sm sm:min-h-28 ${colors[tone] ?? colors.pink}`}>
      <div className="relative z-10 p-3 sm:p-4">
        <p className="truncate text-2xl font-bold leading-none sm:text-3xl">{value}</p>
        <p className="mt-2 truncate text-xs font-semibold sm:text-sm">{label}</p>
        <p className="mt-1 truncate text-xs text-white/75">{trend}</p>
      </div>
      <div className="absolute -right-2 top-2 text-black/15">
        <DashboardIcon name={icon} size={64} />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-1 bg-black/10" />
    </div>
  );
}

export function Panel({ title, action, link, children }) {
  return (
    <div className="overflow-hidden rounded border-t-4 border-t-[var(--dashboard-primary)] bg-white shadow-sm">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-base font-semibold text-slate-700">{title}</h2>
        <div className="flex items-center gap-2">
          {action && (
            <span className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500">
              {action}
            </span>
          )}
          {link && <button className="text-xs font-bold text-[var(--dashboard-primary)]">{link}</button>}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function LineChart() {
  const points = "0,120 65,92 130,70 195,60 260,48 325,15 390,38";
  return (
    <div className="h-[220px]">
      <svg viewBox="0 0 430 180" className="h-full w-full overflow-visible">
        {[20, 60, 100, 140].map((y) => (
          <line key={y} x1="0" x2="410" y1={y} y2={y} stroke="#e5e7eb" strokeWidth="1" />
        ))}
        <defs>
          <linearGradient id="salesGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--dashboard-primary, #078d50)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--dashboard-primary, #078d50)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`M ${points} L 390 155 L 0 155 Z`} fill="url(#salesGradient)" />
        <polyline points={points} fill="none" stroke="var(--dashboard-primary, #078d50)" strokeWidth="3" />
        {points.split(" ").map((point) => {
          const [cx, cy] = point.split(",");
          return <circle key={point} cx={cx} cy={cy} r="4" fill="var(--dashboard-primary, #078d50)" stroke="white" strokeWidth="2" />;
        })}
      </svg>
      <div className="-mt-4 grid grid-cols-7 text-center text-xs font-bold text-slate-500">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => <span key={day}>{day}</span>)}
      </div>
    </div>
  );
}

export function DonutChart({ total, label, segments }) {
  const gradient = `conic-gradient(${segments[0]} 0 38%, ${segments[1]} 38% 66%, ${segments[2]} 66% 86%, ${segments[3] ?? segments[0]} 86% 100%)`;
  return (
    <div className="mx-auto flex h-[172px] w-[172px] items-center justify-center rounded-full" style={{ background: gradient }}>
      <div className="flex h-[100px] w-[100px] flex-col items-center justify-center rounded-full bg-white text-center">
        <span className="text-xs font-bold text-slate-500">Total</span>
        <strong className="mt-1 text-lg font-black text-slate-950">{total}</strong>
        <span className="text-xs font-bold text-slate-500">{label}</span>
      </div>
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="flex flex-col justify-center gap-4">
      {items.map(([label, value, color]) => (
        <div key={label} className="flex items-center justify-between gap-4 text-sm">
          <span className="flex items-center gap-2 font-bold text-slate-700">
            <span className={`h-3 w-3 rounded-full ${color}`} />
            {label}
          </span>
          <span className="font-black text-slate-500">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function OrdersTable() {
  const rows = [
    ["#CMD-00128", "Table 5", "10:45", "En cours"],
    ["#CMD-00127", "Table 3", "10:30", "En cours"],
    ["#CMD-00126", "Table 8", "10:15", "Servie"],
    ["#CMD-00125", "Table 2", "09:50", "Servie"],
    ["#CMD-00124", "Table 7", "09:30", "Payée"],
  ];
  return <StatusTable rows={rows} />;
}

export function KitchenTable() {
  const rows = [
    ["#CMD-00129", "Table 6", "10:50", "Haute"],
    ["#CMD-00128", "Table 5", "10:45", "Haute"],
    ["#CMD-00130", "Table 9", "10:40", "Normale"],
    ["#CMD-00131", "Table 1", "10:35", "Normale"],
    ["#CMD-00132", "Table 7", "10:30", "Basse"],
  ];
  return <StatusTable rows={rows} action="Préparer" />;
}

function StatusTable({ rows, action }) {
  return (
    <div className="overflow-x-auto">
      <table className="lte-table min-w-[520px]">
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, index) => (
                <td key={`${row[0]}-${cell}`} className={`py-3 ${index === 0 ? "font-black text-slate-950" : "font-semibold text-slate-500"}`}>
                  {index === 3 ? <StatusBadge label={cell} /> : cell}
                </td>
              ))}
              {action && (
                <td className="py-3 text-right">
                  <button className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-black text-white">{action}</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ label }) {
  const colors = {
    "En cours": "bg-blue-50 text-blue-600",
    Servie: "bg-emerald-50 text-emerald-600",
    Payée: "bg-violet-50 text-violet-600",
    Haute: "bg-red-50 text-red-500",
    Normale: "bg-slate-50 text-slate-600",
    Basse: "bg-blue-50 text-blue-500",
  };
  return <span className={`rounded-md px-3 py-1 text-xs font-black ${colors[label] ?? colors.Normale}`}>{label}</span>;
}

export function SimpleRows({ rows }) {
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((row) => (
        <div key={row.join("-")} className="grid grid-cols-[1fr_auto_auto] gap-4 py-3 text-sm">
          <span className="font-bold text-slate-700">{row[0]}</span>
          <span className="font-black text-slate-950">{row[1]}</span>
          <span className="font-black text-emerald-500">{row[2]}</span>
        </div>
      ))}
    </div>
  );
}

export function LowStockRows() {
  const rows = [
    ["Mayonnaise", "Stock actuel: 2", "Min: 10"],
    ["Tomate", "Stock actuel: 3", "Min: 10"],
    ["Fromage Cheddar", "Stock actuel: 1", "Min: 5"],
    ["Coca Cola", "Stock actuel: 5", "Min: 20"],
    ["Pain Burger", "Stock actuel: 8", "Min: 20"],
  ];
  return (
    <div className="divide-y divide-slate-100">
      {rows.map(([name, stock, min]) => (
        <div key={name} className="flex items-center justify-between gap-4 py-3">
          <div>
            <p className="text-sm font-black text-slate-950">{name}</p>
            <p className="text-xs font-semibold text-slate-500">{stock}</p>
          </div>
          <span className="rounded-md bg-red-50 px-3 py-1 text-xs font-black text-red-500">{min}</span>
        </div>
      ))}
    </div>
  );
}

export function BarChart() {
  const bars = [
    [45, 82],
    [36, 72],
    [46, 84],
    [44, 82],
  ];
  return (
    <div className="flex h-[250px] items-end justify-around gap-6 px-4">
      {bars.map(([expense, revenue], index) => (
        <div key={index} className="flex flex-1 flex-col items-center gap-3">
          <div className="flex h-[190px] items-end gap-3">
            <span className="w-8 rounded-t-md bg-[var(--dashboard-primary)]" style={{ height: `${expense}%` }} />
            <span className="w-8 rounded-t-md bg-[#31b86f]" style={{ height: `${revenue}%` }} />
          </div>
          <span className="text-xs font-bold text-slate-500">Sem {index + 1}</span>
        </div>
      ))}
    </div>
  );
}

export function SummaryCard({ label, value, trend, tone }) {
  const styles = tone === "green" ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-[#f04438]";
  return (
    <div className={`rounded-lg p-5 ${styles}`}>
      <p className="text-sm font-black">{label}</p>
      <p className="mt-3 text-lg font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-black">{trend}</p>
    </div>
  );
}
