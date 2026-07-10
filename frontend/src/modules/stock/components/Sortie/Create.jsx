import { DashboardSection } from "@/modules/admin/components/AdminUi";

import { Input, Select, Submit } from "../shared/ui";

export function OutputCreate({
  form,
  setForm,
  products,
  depots,
  isLoss,
  setIsLoss,
  onSubmit,
}) {
  const destinationOptions = depots.map((depot) => [depot.id, depot.name]);

  return (
    <DashboardSection
      title="Sortie de stock"
      description="Enregistrez une consommation, vente, perte ou casse depuis le dépôt source vers une destination."
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
          onChange={(source_depot_id) => setForm({ ...form, source_depot_id })}
          options={depots.map((d) => [d.id, d.name])}
        />
        <Select
          label="Destination"
          value={form.destination_depot_id}
          onChange={(destination_depot_id) => setForm({ ...form, destination_depot_id })}
          options={[["", "Sortie externe / consommation"], ...destinationOptions]}
        />
        <Input
          label="Quantité"
          type="number"
          required
          value={form.quantity}
          onChange={(quantity) => setForm({ ...form, quantity })}
        />
        <Select
          label="Motif"
          required
          value={form.reason}
          onChange={(reason) => setForm({ ...form, reason })}
          options={[
            ["consommation", "Consommation"],
            ["vente", "Vente"],
            ["perte", "Perte"],
            ["casse", "Casse"],
            ["perime", "Périmé"],
            ["avarie", "Avarie"],
            ["autre", "Autre"],
          ]}
        />
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isLoss}
            onChange={(event) => setIsLoss(event.target.checked)}
          />{" "}
          Comptabiliser comme perte / avarie
        </label>
        <Submit label="Enregistrer la sortie" />
      </form>
    </DashboardSection>
  );
}
