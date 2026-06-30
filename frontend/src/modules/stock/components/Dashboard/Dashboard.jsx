import { AlertTriangle, Boxes, Factory, PackageX } from "lucide-react";

import { money, qty } from "../shared/format";
import { movementLabels } from "../shared/constants";

export function Dashboard({ summary }) {
  const cards = [
    ["Produits", summary?.product_count, Boxes],
    ["Valeur stock", money(summary?.stock_value), Factory],
    ["Sous seuil", summary?.low_stock_count, AlertTriangle],
    ["Ruptures", summary?.out_of_stock_count, PackageX],
  ];
  return (
    <section className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        {cards.map(([label, value, Icon]) => (
          <div
            key={label}
            className="rounded-md border border-slate-200 bg-white p-4"
          >
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-sm">{label}</span>
              <Icon size={18} />
            </div>
            <strong className="mt-3 block text-2xl text-slate-950">
              {value ?? 0}
            </strong>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <MovementList
          title="Dernières entrées"
          rows={summary?.latest_entries || []}
        />
        <MovementList
          title="Dernières sorties"
          rows={summary?.latest_outputs || []}
        />
        <MovementList
          title="Derniers transferts"
          rows={summary?.latest_transfers || []}
        />
      </div>
    </section>
  );
}

function MovementList({ title, rows }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-950">{title}</h3>
      <div className="mt-3 space-y-2">
        {rows.slice(0, 5).map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm"
          >
            <span>{movementLabels[row.movement_type] || row.movement_type}</span>
            <strong>{qty(row.quantity)}</strong>
          </div>
        ))}
        {!rows.length && (
          <p className="text-sm text-slate-500">Aucun mouvement.</p>
        )}
      </div>
    </div>
  );
}
