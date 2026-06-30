import { DashboardSection } from "@/modules/admin/components/AdminUi";

import { money, qty } from "../shared/format";
import { movementLabels } from "../shared/constants";
import { ExportActions } from "../shared/exports";
import { Input, MiniStat, Select, Submit, Table } from "../shared/ui";

export function Reports({
  filters,
  setFilters,
  depots,
  products,
  report,
  movements,
  onSubmit,
  isLoading,
  onExport,
  productName,
  depotName,
}) {
  const rows = report?.movements || movements;
  const exportRows = rows.map((movement) => ({
    date: new Date(
      movement.movement_date || movement.created_at,
    ).toLocaleDateString("fr-FR"),
    type: movementLabels[movement.movement_type] || movement.movement_type,
    product: productName(movement.product_id),
    source: depotName(movement.source_depot_id),
    destination: depotName(movement.destination_depot_id),
    quantity: qty(movement.quantity),
    amount: money(movement.total_amount),
    production_cost: money(movement.production_cost),
  }));
  const exportColumns = [
    ["date", "Date"],
    ["type", "Type"],
    ["product", "Produit"],
    ["source", "Source"],
    ["destination", "Destination"],
    ["quantity", "Quantité"],
    ["amount", "Montant"],
    ["production_cost", "Coût production"],
  ];
  return (
    <DashboardSection
      title="Rapports de stock"
      description="Analysez les mouvements, valeurs et écarts selon la période, le dépôt et le produit."
    >
      <form
        onSubmit={onSubmit}
        className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5"
      >
        <Input
          label="Début"
          type="date"
          value={filters.start_date}
          onChange={(start_date) => setFilters({ ...filters, start_date })}
        />
        <Input
          label="Fin"
          type="date"
          value={filters.end_date}
          onChange={(end_date) => setFilters({ ...filters, end_date })}
        />
        <Select
          label="Dépôt"
          value={filters.depot_id}
          onChange={(depot_id) => setFilters({ ...filters, depot_id })}
          options={[["", "Tous"], ...depots.map((d) => [d.id, d.name])]}
        />
        <Select
          label="Produit"
          value={filters.product_id}
          onChange={(product_id) => setFilters({ ...filters, product_id })}
          options={[["", "Tous"], ...products.map((p) => [p.id, p.name])]}
        />
        <Select
          label="Type"
          value={filters.movement_type}
          onChange={(movement_type) =>
            setFilters({ ...filters, movement_type })
          }
          options={[["", "Tous"], ...Object.entries(movementLabels)]}
        />
        <Submit label="Filtrer" />
      </form>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-slate-500">
          Période {filters.start_date || "-"} au {filters.end_date || "-"} ·
          Dépôt {filters.depot_id ? depotName(filters.depot_id) : "Tous"}
        </p>
        <ExportActions
          title="Rapport stock"
          filename="rapport-stock"
          rows={exportRows}
          columns={exportColumns}
          onExport={(format) => onExport?.("stock-report", format)}
        />
      </div>
      {isLoading && (
        <div className="mb-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
          Chargement du rapport...
        </div>
      )}
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <MiniStat label="Valeur stock" value={money(report?.stock_value)} />
        <MiniStat label="Entrées" value={money(report?.entries_value)} />
        <MiniStat label="Sorties" value={money(report?.outputs_value)} />
        <MiniStat label="Stock faible" value={report?.low_stock_count || 0} />
      </div>
      <Table
        columns={[
          "Date",
          "Type",
          "Produit",
          "Source",
          "Destination",
          "Quantité",
          "Montant",
          "Coût production",
        ]}
        rows={rows.map((movement) => [
          new Date(
            movement.movement_date || movement.created_at,
          ).toLocaleDateString("fr-FR"),
          movementLabels[movement.movement_type] || movement.movement_type,
          productName(movement.product_id),
          depotName(movement.source_depot_id),
          depotName(movement.destination_depot_id),
          qty(movement.quantity),
          money(movement.total_amount),
          money(movement.production_cost),
        ])}
      />
    </DashboardSection>
  );
}
