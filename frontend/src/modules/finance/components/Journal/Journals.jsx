import { journalTypes } from "../shared/constants";
import { Input, Panel, Select, SimpleRows, Submit } from "../shared/ui";

export function Journals({ journals, form, setForm, onSubmit }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <Panel
        title="Créer un journal"
        description="Définissez les journaux de saisie pour classer les opérations comptables."
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            label="Code"
            required
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
            label="Type"
            required
            value={form.type}
            onChange={(type) => setForm({ ...form, type })}
            options={journalTypes}
          />
          <Submit />
        </form>
      </Panel>
      <SimpleRows
        title="Journaux"
        description={`${journals.length.toLocaleString("fr-FR")} journal(aux) configuré(s)`}
        rows={journals}
        columns={["code", "name", "type", "is_active"]}
      />
    </section>
  );
}
