import { useEffect, useState } from "react";

import { money, today } from "../shared/format";
import { Input, Panel, Select, Submit } from "../shared/ui";

export function Echeancier({ api, onMessage }) {
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState({
    direction: "payable",
    label: "",
    due_date: today(),
    amount: "",
  });

  async function load() {
    try {
      setSummary(await api("/api/v1/finance/reports/payment-schedule"));
    } catch (error) {
      onMessage?.(error.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(event) {
    event.preventDefault();
    try {
      await api("/api/v1/finance/payment-schedules", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount || 0),
          due_date: new Date(form.due_date).toISOString(),
        }),
      });
      setForm({
        direction: form.direction,
        label: "",
        due_date: today(),
        amount: "",
      });
      await load();
    } catch (error) {
      onMessage?.(error.message);
    }
  }

  async function pay(id) {
    try {
      await api(`/api/v1/finance/payment-schedules/${id}/pay`, {
        method: "PATCH",
      });
      await load();
    } catch (error) {
      onMessage?.(error.message);
    }
  }

  return (
    <section className="space-y-4">
      <Panel
        title="Nouvelle échéance"
        description="Planifiez un paiement fournisseur ou un encaissement client à suivre."
      >
        <form onSubmit={create} className="grid gap-3 md:grid-cols-5">
          <Select
            label="Sens"
            required
            value={form.direction}
            onChange={(direction) => setForm({ ...form, direction })}
            options={[
              ["payable", "À payer (fournisseur)"],
              ["receivable", "À encaisser (client)"],
            ]}
          />
          <Input
            label="Libellé"
            required
            value={form.label}
            onChange={(label) => setForm({ ...form, label })}
          />
          <Input
            label="Échéance"
            type="date"
            required
            value={form.due_date}
            onChange={(due_date) => setForm({ ...form, due_date })}
          />
          <Input
            label="Montant"
            type="number"
            required
            value={form.amount}
            onChange={(amount) => setForm({ ...form, amount })}
          />
          <div className="self-end">
            <Submit />
          </div>
        </form>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Block title="À payer" bucket={summary?.payable} onPay={pay} />
        <Block title="À encaisser" bucket={summary?.receivable} onPay={pay} />
      </div>
    </section>
  );
}

function Block({ title, bucket, onPay }) {
  return (
    <Panel
      title={title}
      description={`${(bucket?.items || []).length.toLocaleString("fr-FR")} échéance(s)`}
    >
      <div className="mb-3 flex gap-3 text-sm">
        <span>
          Total : <strong>{money(bucket?.total)}</strong>
        </span>
        <span
          className={
            Number(bucket?.overdue_total || 0) > 0
              ? "text-red-600"
              : "text-slate-500"
          }
        >
          En retard : <strong>{money(bucket?.overdue_total)}</strong>
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <table className="lte-table">
          <thead>
            <tr>
              <th>Libellé</th>
              <th>Échéance</th>
              <th>Montant</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(bucket?.items || []).map((item) => (
              <tr key={item.id} className={item.overdue ? "bg-red-50" : ""}>
                <td>{item.label}</td>
                <td>{String(item.due_date || "").slice(0, 10)}</td>
                <td className="font-semibold">{money(item.amount)}</td>
                <td className="text-right">
                  <button
                    type="button"
                    onClick={() => onPay(item.id)}
                    className="lte-btn lte-btn-primary lte-btn-sm"
                  >
                    Régler
                  </button>
                </td>
              </tr>
            ))}
            {!(bucket?.items || []).length && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-8 text-center text-sm font-semibold text-slate-500"
                >
                  Aucune échéance.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
