import { money, today } from "../shared/format";
import { Input, Panel, Select, SimpleRows, Submit } from "../shared/ui";

const EXPENSE_PAYMENT_OPTIONS = [
  ["cash", "Espèces (caisse du restaurant)"],
  ["mobile_money", "Mobile Money (Orange / MTN)"],
];

const REVENUE_PAYMENT_OPTIONS = [
  ["cash", "Espèces (caisse)"],
  ["mobile_money", "Mobile Money"],
];

export function OperationForm({
  title,
  rows,
  form,
  setForm,
  dateField,
  endpoint,
  submit,
  helperText,
  variant = "generic",
  expenseCategories = [],
}) {
  const totalAmount = Number(form.total_amount || 0);
  const taxRate = Number(form.tax_rate || 0);
  const amount = taxRate > 0 ? totalAmount / (1 + taxRate / 100) : totalAmount;
  const taxAmount = Math.max(0, totalAmount - amount);
  const isExpense = variant === "expense";
  const paymentOptions = isExpense ? EXPENSE_PAYMENT_OPTIONS : REVENUE_PAYMENT_OPTIONS;

  async function save(event) {
    event.preventDefault();
    const payload = {
      ...form,
      amount: Math.round(amount * 100) / 100,
      tax_rate: taxRate,
      tax_amount: Math.round(taxAmount * 100) / 100,
      total_amount: totalAmount,
      apply_vat: false,
    };
    if (isExpense && !payload.category_id) delete payload.category_id;
    const created = await submit(endpoint, payload);
    if (created?.id) {
      await submit(
        `${endpoint}/${created.id}/validate?payment_method=${form.payment_method}`,
        {},
        null,
        "PATCH",
      );
      setForm({
        [dateField]: today(),
        total_amount: "",
        tax_rate: isExpense ? "0" : form.tax_rate || "19.25",
        description: "",
        payment_method: form.payment_method || "cash",
        ...(isExpense ? { category_id: form.category_id || "" } : {}),
      });
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(320px,400px)_1fr] xl:items-start">
      <Panel
        title={isExpense ? "Enregistrer une sortie d'argent" : `Créer ${title.toLowerCase()}`}
        description={
          helperText ||
          (isExpense
            ? "Indiquez ce que vous avez payé et comment. Le montant sera retiré de la caisse (ou du mobile money)."
            : "Saisissez le montant TTC : le HT et la taxe sont calculés automatiquement.")
        }
      >
        <form onSubmit={save} className="space-y-3">
          {isExpense && expenseCategories.length > 0 && (
            <Select
              label="Type de dépense"
              required
              value={form.category_id || ""}
              onChange={(category_id) => setForm({ ...form, category_id })}
              options={expenseCategories.map((cat) => [cat.id, cat.name])}
            />
          )}
          <Input
            label="Date du paiement"
            type="date"
            required
            value={form[dateField]}
            onChange={(value) => setForm({ ...form, [dateField]: value })}
          />
          <Input
            label={isExpense ? "Montant payé (FCFA)" : "Montant TTC"}
            type="number"
            required
            value={form.total_amount}
            onChange={(total_amount) => setForm({ ...form, total_amount })}
          />
          {!isExpense && (
            <Input
              label="Taxe (%)"
              type="number"
              required
              value={form.tax_rate}
              onChange={(tax_rate) => setForm({ ...form, tax_rate })}
            />
          )}
          {isExpense ? (
            <details className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
              <summary className="cursor-pointer font-bold text-slate-700">Détail TVA (optionnel)</summary>
              <div className="mt-3">
                <Input
                  label="Taxe (%)"
                  type="number"
                  value={form.tax_rate}
                  onChange={(tax_rate) => setForm({ ...form, tax_rate })}
                />
              </div>
            </details>
          ) : null}
          {!isExpense && (
            <TaxSummary
              amount={amount}
              taxRate={taxRate}
              taxAmount={taxAmount}
              totalAmount={totalAmount}
            />
          )}
          <Input
            label={isExpense ? "Motif (ex : essence livreur, loyer mars…)" : "Description"}
            required
            value={form.description}
            onChange={(description) => setForm({ ...form, description })}
          />
          <Select
            label={isExpense ? "Payé comment ?" : "Paiement"}
            required
            value={form.payment_method}
            onChange={(payment_method) => setForm({ ...form, payment_method })}
            options={paymentOptions}
          />
          <Submit />
        </form>
      </Panel>
      <SimpleRows
        title={isExpense ? "Historique des sorties" : title}
        description={`${rows.length.toLocaleString("fr-FR")} opération(s) enregistrée(s)`}
        rows={rows}
        columns={
          isExpense
            ? [dateField, "description", "total_amount", "payment_status", "status"]
            : [dateField, "description", "amount", "tax_rate", "tax_amount", "total_amount", "payment_status", "status"]
        }
      />
    </section>
  );
}

function TaxSummary({ amount, taxRate, taxAmount, totalAmount }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
      <div className="flex justify-between gap-3">
        <span>Montant HT (calculé)</span>
        <strong>{money(amount)}</strong>
      </div>
      <div className="mt-1 flex justify-between gap-3">
        <span>Taxe ({Number(taxRate || 0).toLocaleString("fr-FR")} %)</span>
        <strong>{money(taxAmount)}</strong>
      </div>
      <div className="mt-2 flex justify-between gap-3 border-t border-slate-200 pt-2 text-slate-950">
        <span className="font-black">Total TTC saisi</span>
        <strong>{money(totalAmount)}</strong>
      </div>
    </div>
  );
}
