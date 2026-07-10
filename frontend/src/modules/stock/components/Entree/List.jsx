import { SecondaryAction } from "@/modules/admin/components/AdminUi";

import { MovementList } from "../shared/MovementList";

export function EntryList({ entries, productName, depotName, onCreate, onEdit, onCancel }) {
  return (
    <MovementList
      title="Liste des entrées"
      description="Consultez les approvisionnements et entrées directes enregistrés."
      movements={entries}
      productName={productName}
      depotName={depotName}
      onEdit={onEdit}
      onCancel={onCancel}
      action={
        <SecondaryAction icon="Plus" onClick={onCreate}>
          Nouvelle entrée
        </SecondaryAction>
      }
    />
  );
}
