import { DashboardSection } from "@/modules/admin/components/AdminUi";

import { qty } from "../shared/format";
import { ExportActions } from "../shared/exports";
import { Select, Submit, Table } from "../shared/ui";

export function InventoryForm({
  depots,
  depotId,
  setDepotId,
  rows,
  setRows,
  onSubmit,
  onExport,
  inventories,
}) {
  const exportRows = rows.map((row) => ({
    product: row.name,
    theoretical: qty(row.theoretical_quantity),
    real: qty(row.real_quantity),
    gap: qty(
      Number(row.theoretical_quantity || 0) - Number(row.real_quantity || 0),
    ),
    justification: row.justification || "",
  }));
  const exportColumns = [
    ["product", "Produit"],
    ["theoretical", "Stock théorique"],
    ["real", "Stock réel"],
    ["gap", "Écart"],
    ["justification", "Justification"],
  ];
  return (
    <section className="space-y-4">
      <DashboardSection
        title="Inventaire"
        description="Sélectionnez un dépôt, saisissez le stock réel et justifiez les écarts constatés."
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <Select
            label="Dépôt"
            value={depotId}
            onChange={setDepotId}
            options={depots.map((d) => [d.id, d.name])}
          />
          <ExportActions
            title="Inventaire"
            filename="inventaire"
            rows={exportRows}
            columns={exportColumns}
            onExport={(format) => onExport?.("inventory", format)}
          />
          <Table
            columns={["Produit", "Théorique", "Réel", "Écart", "Justification"]}
            rows={rows.map((row, index) => [
              row.name,
              qty(row.theoretical_quantity),
              <input
                key={row.product_id}
                className="min-h-9 w-28 rounded-md border border-slate-200 px-2"
                type="number"
                value={row.real_quantity}
                onChange={(event) => {
                  const next = [...rows];
                  next[index] = { ...row, real_quantity: event.target.value };
                  setRows(next);
                }}
              />,
              qty(
                Number(row.theoretical_quantity || 0) -
                  Number(row.real_quantity || 0),
              ),
              <input
                key={`${row.product_id}-justification`}
                className="min-h-9 w-64 rounded-md border border-slate-200 px-2"
                value={row.justification || ""}
                onChange={(event) => {
                  const next = [...rows];
                  next[index] = { ...row, justification: event.target.value };
                  setRows(next);
                }}
                placeholder="Motif de l'écart"
              />,
            ])}
          />
          <Submit label="Enregistrer l'inventaire" />
        </form>
      </DashboardSection>
      <DashboardSection
        title="Historique inventaires"
        description={`${inventories.length.toLocaleString("fr-FR")} inventaire(s) enregistré(s)`}
      >
        <Table
          columns={["Date", "Dépôt", "Statut", "Lignes"]}
          rows={inventories.map((inventory) => [
            new Date(inventory.inventory_date).toLocaleDateString("fr-FR"),
            inventory.depot_id,
            inventory.status,
            inventory.details?.length || 0,
          ])}
        />
      </DashboardSection>
    </section>
  );
}
