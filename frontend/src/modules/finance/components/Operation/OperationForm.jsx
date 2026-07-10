import { money, today } from "../shared/format";
import { Input, Panel, Select, SimpleRows, Submit } from "../shared/ui";

export function OperationForm({
  title,
  rows,
  form,
  setForm,
  dateField,
  endpoint,
  submit,
  helperText,
}) {
  const amount = Number(form.amount || 0);
  const taxRate = Number(form.tax_rate || 0);
  const taxAmount = Math.round(amount * taxRate) / 100;
  const totalAmount = amount + taxAmount;

  async function save(event) {
    event.preventDefault();
    const created = await submit(endpoint, {
      ...form,
      amount,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      apply_vat: false,
    });
    if (created?.id) {
      await submit(
        `${endpoint}/${created.id}/validate?payment_method=${form.payment_method}`,
        {},
        null,
        "PATCH",
      );
      setForm({
        [dateField]: today(),
        amount: "",
        tax_rate: form.tax_rate || "19.25",
        description: "",
        payment_method: form.payment_method || "cash",
      });
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <Panel
        title={`Créer ${title.toLowerCase()}`}
        description={helperText || "Saisissez le montant HT, le taux de taxe et le mode de paiement. Le total TTC est calculé automatiquement."}
      >
        <form onSubmit={save} className="space-y-3">
          <Input
            label="Date"
            type="date"
            required
            value={form[dateField]}
            onChange={(value) => setForm({ ...form, [dateField]: value })}
          />
          <Input
            label="Montant HT"
            type="number"
            required
            value={form.amount}
            onChange={(amountValue) => setForm({ ...form, amount: amountValue })}
          />
          <Input
            label="Taxe (%)"
            type="number"
            required
            value={form.tax_rate}
            onChange={(tax_rate) => setForm({ ...form, tax_rate })}
          />
          <TaxSummary
            amount={amount}
            taxRate={taxRate}
            taxAmount={taxAmount}
            totalAmount={totalAmount}
          />
          <Input
            label="Description"
            required
            value={form.description}
            onChange={(description) => setForm({ ...form, description })}
          />
          <Select
            label="Paiement"
            required
            value={form.payment_method}
            onChange={(payment_method) => setForm({ ...form, payment_method })}
            options={[
              ["cash", "Caisse"],
              ["bank", "Banque"],
              ["mobile_money", "Paiement mobile"],
              ["other", "Autre"],
            ]}
          />
          <Submit />
        </form>
      </Panel>
      <SimpleRows
        title={title}
        description={`${rows.length.toLocaleString("fr-FR")} opération(s) enregistrée(s)`}
        rows={rows}
        columns={[
          dateField,
          "description",
          "amount",
          "tax_rate",
          "tax_amount",
          "total_amount",
          "payment_status",
          "status",
        ]}
      />
    </section>
  );
}

function TaxSummary({ amount, taxRate, taxAmount, totalAmount }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
      <div className="flex justify-between gap-3">
        <span>Sous-total HT</span>
        <strong>{money(amount)}</strong>
      </div>
      <div className="mt-1 flex justify-between gap-3">
        <span>Taxe ({Number(taxRate || 0).toLocaleString("fr-FR")} %)</span>
        <strong>{money(taxAmount)}</strong>
      </div>
      <div className="mt-2 flex justify-between gap-3 border-t border-slate-200 pt-2 text-slate-950">
        <span className="font-black">Total TTC</span>
        <strong>{money(totalAmount)}</strong>
      </div>
    </div>
  );
}
