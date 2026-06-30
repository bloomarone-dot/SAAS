import { DashboardSection } from "@/modules/admin/components/AdminUi";

import { Input, Select, Submit } from "../shared/ui";

export function TransferCreate({ form, setForm, products, depots, onSubmit }) {
  return (
    <DashboardSection
      title="Transfert entre dépôts"
      description="Déplacez un produit entre dépôts et renseignez le coût de production si nécessaire."
    >
      <form
        onSubmit={onSubmit}
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <Input
          label="Date"
          type="date"
          required
          value={form.movement_date}
          onChange={(movement_date) => setForm({ ...form, movement_date })}
        />
        <Select
          label="Produit"
          required
          value={form.product_id}
          onChange={(product_id) => setForm({ ...form, product_id })}
          options={products.map((p) => [p.id, p.name])}
        />
        <Select
          label="Dépôt source"
          required
          value={form.source_depot_id}
          onChange={(source_depot_id) =>
            setForm({
              ...form,
              source_depot_id,
              destination_depot_id:
                form.destination_depot_id &&
                form.destination_depot_id !== source_depot_id
                  ? form.destination_depot_id
                  : depots.find((depot) => depot.id !== source_depot_id)?.id ||
                    "",
            })
          }
          options={depots.map((d) => [d.id, d.name])}
        />
        <Select
          label="Dépôt destination"
          required
          value={form.destination_depot_id}
          onChange={(destination_depot_id) =>
            setForm({ ...form, destination_depot_id })
          }
          options={depots.map((d) => [d.id, d.name])}
        />
        <Input
          label="Quantité"
          type="number"
          required
          value={form.quantity}
          onChange={(quantity) => setForm({ ...form, quantity })}
        />
        <Input
          label="Coût de production"
          type="number"
          value={form.production_cost}
          onChange={(production_cost) => setForm({ ...form, production_cost })}
        />
        <Input
          label="Motif"
          value={form.reason}
          onChange={(reason) => setForm({ ...form, reason })}
        />
        <Input
          label="Référence"
          value={form.reference}
          onChange={(reference) => setForm({ ...form, reference })}
        />
        <Submit label="Enregistrer le transfert" />
      </form>
    </DashboardSection>
  );
}
