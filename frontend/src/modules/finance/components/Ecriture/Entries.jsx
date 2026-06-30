import { Input, Panel, Select, SimpleRows, Submit } from "../shared/ui";

export function Entries({ entries, accounts, journals, form, setForm, onSubmit }) {
  return (
    <section className="space-y-4">
      <Panel
        title="Créer une écriture équilibrée"
        description="Saisissez une opération avec un débit et un crédit du même montant."
      >
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-3">
          <Input
            label="Date"
            type="date"
            required
            value={form.entry_date}
            onChange={(entry_date) => setForm({ ...form, entry_date })}
          />
          <Select
            label="Journal"
            required
            value={form.journal_id}
            onChange={(journal_id) => setForm({ ...form, journal_id })}
            options={journals.map((j) => [j.id, `${j.code} - ${j.name}`])}
          />
          <Input
            label="Libellé"
            required
            value={form.description}
            onChange={(description) => setForm({ ...form, description })}
          />
          <Select
            label="Compte débit"
            required
            value={form.debit_account_id}
            onChange={(debit_account_id) =>
              setForm({ ...form, debit_account_id })
            }
            options={accounts.map((a) => [a.id, `${a.code} - ${a.name}`])}
          />
          <Select
            label="Compte crédit"
            required
            value={form.credit_account_id}
            onChange={(credit_account_id) =>
              setForm({ ...form, credit_account_id })
            }
            options={accounts.map((a) => [a.id, `${a.code} - ${a.name}`])}
          />
          <Input
            label="Montant"
            type="number"
            required
            value={form.amount}
            onChange={(amount) => setForm({ ...form, amount })}
          />
          <div className="md:col-span-3">
            <Submit />
          </div>
        </form>
      </Panel>
      <SimpleRows
        title="Écritures"
        description={`${entries.length.toLocaleString("fr-FR")} écriture(s) comptable(s)`}
        rows={entries}
        columns={[
          "entry_date",
          "entry_number",
          "description",
          "status",
          "total_debit",
          "total_credit",
          "is_balanced",
        ]}
      />
    </section>
  );
}
