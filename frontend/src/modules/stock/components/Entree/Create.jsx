import { DashboardSection } from "@/modules/admin/components/AdminUi";

import { Input, Select, Submit } from "../shared/ui";

export function EntryCreate({
  form,
  setForm,
  products,
  depots,
  suppliers,
  directEntry,
  setDirectEntry,
  onSubmit,
}) {
  return (
    <DashboardSection
      title="Entrée de stock"
      description="Renseignez l'approvisionnement, le dépôt, le lot et le prix d'achat au moment de la réception."
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
          label="Prix d'achat"
          type="number"
          value={form.unit_price}
          onChange={(unit_price) => setForm({ ...form, unit_price })}
        />
        <Select
          label="Fournisseur"
          value={form.supplier_id}
          onChange={(supplier_id) => setForm({ ...form, supplier_id })}
          options={[
            ["", "Non renseigné"],
            ...suppliers.map((s) => [s.id, s.name]),
          ]}
        />
        <Input
          label="N° de lot (optionnel)"
          value={form.lot_number}
          onChange={(lot_number) => setForm({ ...form, lot_number })}
        />
        <Input
          label="Date de péremption"
          type="date"
          value={form.expiry_date}
          onChange={(expiry_date) => setForm({ ...form, expiry_date })}
        />
        <Input
          label="Observation"
          value={form.reason}
          onChange={(reason) => setForm({ ...form, reason })}
        />
        <label className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <span className="flex min-h-6 items-center gap-2 font-black text-slate-800">
            <input
              type="checkbox"
              checked={form.in_purchase_unit}
              onChange={(event) =>
                setForm({ ...form, in_purchase_unit: event.target.checked })
              }
            />
            Saisie en unité d'achat
          </span>
          <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">
            À cocher si vous saisissez une quantité achetée en sac, carton, casier ou paquet.
            Le système convertit ensuite vers l'unité de stock du produit si un facteur d'achat est défini.
          </span>
        </label>
        <label className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <span className="flex min-h-6 items-center gap-2 font-black text-slate-800">
            <input
              type="checkbox"
              checked={directEntry}
              onChange={(event) => setDirectEntry(event.target.checked)}
            />
            Entrée directe
          </span>
          <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">
            À cocher pour augmenter le stock immédiatement sans passer par un achat fournisseur détaillé.
            Utile pour un stock initial, une correction simple ou un approvisionnement rapide.
          </span>
        </label>
        <div className="md:col-span-2 xl:col-span-3">
          <Submit label="Enregistrer l'entrée" />
        </div>
      </form>
    </DashboardSection>
  );
}
