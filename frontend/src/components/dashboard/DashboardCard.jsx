import { DashboardIcon } from "./icons";

export function DashboardCard({ title, value, icon, accent = "#0F8AB1" }) {
  return (
    <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl text-white"
          style={{ backgroundColor: accent }}
        >
          <DashboardIcon name={icon} />
        </div>
      </div>

      <p className="text-sm text-slate-500">{title}</p>
      <h2 className="mt-3 text-3xl font-black text-slate-900">{value}</h2>
    </div>
  );
}
