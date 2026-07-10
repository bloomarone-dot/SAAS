import { DashboardSection } from "@/modules/admin/components/AdminUi";

import { Input, Select, Submit } from "../shared/ui";

export function DepotCreate({ form, setForm, onSubmit }) {
  return (
    <DashboardSection
      title="Créer un dépôt"
      description="Ajoutez un espace de stockage exploitable dans les mouvements et inventaires."
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <Input
          label="Nom"
          required
          value={form.name}
          onChange={(name) => setForm({ ...form, name })}
        />
        <Input
          label="Code"
          required
          value={form.code}
          onChange={(code) => setForm({ ...form, code: code.toUpperCase() })}
        />
        <Select
          label="Type"
          required
          value={form.type}
          onChange={(type) => setForm({ ...form, type })}
          options={[
            ["principal", "Principal"],
            ["cuisine", "Cuisine"],
            ["boisson", "Boisson"],
            ["avarie", "Avarie"],
            ["autre", "Autre"],
          ]}
        />
        <Input
          label="Description"
          value={form.description}
          onChange={(description) => setForm({ ...form, description })}
        />
        <Submit label="Créer" />
      </form>
    </DashboardSection>
  );
}
