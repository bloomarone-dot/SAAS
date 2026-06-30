import { accountTypes } from "../shared/constants";
import { Input, Panel, Select, SimpleRows, Submit } from "../shared/ui";

export function Accounts({ accounts, form, setForm, onSubmit }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <Panel
        title="Créer un compte"
        description="Ajoutez un compte au plan comptable utilisé par les écritures et états financiers."
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
            options={accountTypes}
          />
          <Submit />
        </form>
      </Panel>
      <SimpleRows
        title="Plan comptable"
        description={`${accounts.length.toLocaleString("fr-FR")} compte(s) configuré(s)`}
        rows={accounts}
        columns={["code", "name", "type", "is_active"]}
      />
    </section>
  );
}
