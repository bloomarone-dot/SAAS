import { DashboardSection } from "@/modules/admin/components/AdminUi";

import { qty } from "../shared/format";
import { Table } from "../shared/ui";

export function LotList({ lots, productName, depotName }) {
  const now = Date.now();
  const soon = now + 7 * 24 * 3600 * 1000;
  const status = (lot) => {
    if (!lot.expiry_date) return null;
    const t = new Date(lot.expiry_date).getTime();
    if (t < now) return { label: "Périmé", cls: "bg-red-100 text-red-700" };
    if (t <= soon)
      return { label: "Périme bientôt", cls: "bg-amber-100 text-amber-700" };
    return { label: "OK", cls: "bg-emerald-100 text-emerald-700" };
  };
  const sorted = [...lots].sort(
    (a, b) =>
      new Date(a.expiry_date || "2999-01-01") -
      new Date(b.expiry_date || "2999-01-01"),
  );
  return (
    <DashboardSection title="Lots et péremptions">
      <Table
        columns={[
          "Produit",
          "Dépôt",
          "N° lot",
          "Péremption",
          "Restant",
          "État",
        ]}
        rows={sorted.map((lot) => {
          const s = status(lot);
          return [
            productName ? productName(lot.product_id) : lot.product_id,
            depotName ? depotName(lot.depot_id) : lot.depot_id,
            lot.lot_number || "-",
            lot.expiry_date ? String(lot.expiry_date).slice(0, 10) : "—",
            qty(lot.quantity_remaining),
            s ? (
              <span
                key="status"
                className={`rounded px-2 py-1 text-xs font-bold ${s.cls}`}
              >
                {s.label}
              </span>
            ) : (
              <span key="status" className="text-slate-400">
                non daté
              </span>
            ),
          ];
        })}
      />
    </DashboardSection>
  );
}
