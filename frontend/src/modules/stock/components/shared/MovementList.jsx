import { DashboardSection } from "@/modules/admin/components/AdminUi";

import { formatLocalDate, money, qty } from "./format";
import { movementLabels } from "./constants";
import { Table } from "./ui";

export function MovementList({
  title,
  description,
  movements,
  productName,
  depotName,
  onEdit,
  onCancel,
  action,
}) {
  const columns = [
    "Date",
    "Type",
    "Produit",
    "Source",
    "Destination",
    "Quantité",
    "Montant",
    "Statut",
    ...(onEdit || onCancel ? ["Actions"] : []),
  ];

  const rows = movements.map((movement) => {
    const base = [
      formatLocalDate(movement.movement_date || movement.created_at),
      movementLabels[movement.movement_type] || movement.movement_type,
      productName(movement.product_id),
      depotName(movement.source_depot_id),
      depotName(movement.destination_depot_id),
      qty(movement.quantity),
      money(movement.total_amount),
      movement.status === "cancelled" ? "Annulé" : "Validé",
    ];
    if (!onEdit && !onCancel) return base;
    return [
      ...base,
      movement.status === "validated" ? (
        <div className="flex flex-wrap gap-2">
          {onEdit && (
            <button type="button" className="lte-btn lte-btn-default lte-btn-sm" onClick={() => onEdit(movement)}>
              Modifier
            </button>
          )}
          {onCancel && (
            <button type="button" className="lte-btn lte-btn-danger lte-btn-sm" onClick={() => onCancel(movement)}>
              Supprimer
            </button>
          )}
        </div>
      ) : "-",
    ];
  });

  return (
    <DashboardSection title={title} description={description} action={action}>
      <Table columns={columns} rows={rows} />
    </DashboardSection>
  );
}
