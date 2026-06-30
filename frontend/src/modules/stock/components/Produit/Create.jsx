import { DashboardSection } from "@/modules/admin/components/AdminUi";

import { uniqueUnits } from "../shared/format";
import { Input, Select, Submit } from "../shared/ui";

export function ProductCreate({ units, form, setForm, onSubmit }) {
  const unitOptions = uniqueUnits(units).map((unit) => [
    unit.id,
    unit.name === unit.symbol ? unit.name : `${unit.name} (${unit.symbol})`,
  ]);

  return (
    <DashboardSection
      title="Ajouter un produit"
      description="Créez la fiche stock sans prix d'achat. Le coût est renseigné à l'entrée stock."
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <Input
          label="Code"
          value={form.code}
          onChange={(code) => setForm({ ...form, code })}
        />
        <Input
          label="Nom"
          required
          value={form.name}
          onChange={(name) => setForm({ ...form, name })}
        />
        <Select
          label="Unité"
          required
          value={form.unit_id}
          onChange={(unit_id) => setForm({ ...form, unit_id })}
          options={unitOptions}
        />
        <Input
          label="Seuil minimum"
          type="number"
          value={form.minimum_stock}
          onChange={(minimum_stock) => setForm({ ...form, minimum_stock })}
        />
        <Submit label="Créer" />
      </form>
    </DashboardSection>
  );
}
