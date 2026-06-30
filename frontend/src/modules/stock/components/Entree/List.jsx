import { DashboardSection, SecondaryAction } from "@/modules/admin/components/AdminUi";

import { money, qty } from "../shared/format";
import { movementLabels } from "../shared/constants";
import { Table } from "../shared/ui";

export function EntryList({ entries, productName, depotName, onCreate }) {
  return (
    <DashboardSection
      title="Liste des entrées"
      description="Consultez les approvisionnements et entrées directes enregistrés."
      action={
        <SecondaryAction icon="Plus" onClick={onCreate}>
          Nouvelle entrée
        </SecondaryAction>
      }
    >
      <Table
        columns={[
          "Date",
          "Type",
          "Produit",
          "Dépôt",
          "Quantité",
          "Prix d'achat",
          "Total",
          "Observation",
        ]}
        rows={entries.map((entry) => [
          entry.movement_date
            ? new Date(entry.movement_date).toLocaleDateString("fr-FR")
            : "-",
          movementLabels[entry.movement_type] || entry.movement_type,
          productName(entry.product_id),
          depotName(entry.destination_depot_id),
          qty(entry.quantity),
          money(entry.unit_price),
          money(entry.total_amount),
          entry.reason || entry.reference || "-",
        ])}
      />
    </DashboardSection>
  );
}
