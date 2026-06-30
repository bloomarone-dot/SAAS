import { DashboardSection } from "@/modules/admin/components/AdminUi";

import { depotTypeLabels } from "../shared/constants";
import { Table } from "../shared/ui";

export function DepotList({ depots }) {
  return (
    <DashboardSection
      title="Dépôts"
      description={`${depots.length.toLocaleString("fr-FR")} dépôt(s) actif(s) ou configuré(s)`}
    >
      <Table
        columns={["Nom", "Code", "Type", "Statut"]}
        rows={depots.map((depot) => [
          depot.name,
          depot.code,
          depotTypeLabels[depot.type],
          depot.is_active ? "Actif" : "Inactif",
        ])}
      />
    </DashboardSection>
  );
}
