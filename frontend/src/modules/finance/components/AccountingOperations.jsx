import { useEffect, useMemo, useState } from "react";
import { BarChart3, BookOpen, Building2, Calculator, CalendarClock, CheckCheck, CreditCard, Download, Landmark, Percent, Plus, ReceiptText, Wallet } from "lucide-react";

import { formatApiError } from "@/utils/network";

const tabs = [
  ["dashboard", "Tableau de bord", BarChart3],
  ["accounts", "Plan comptable", BookOpen],
  ["journals", "Journaux", ReceiptText],
  ["entries", "Écritures", Calculator],
  ["expenses", "Dépenses", Wallet],
  ["revenues", "Recettes", CreditCard],
  ["payments", "Paiements", CreditCard],
  ["cash", "Caisses", Wallet],
  ["banks", "Banques", Landmark],
  ["statements", "États financiers", Building2],
  ["food-cost", "Food-cost", Percent],
  ["echeancier", "Échéancier", CalendarClock],
  ["rapprochement", "Rapprochement", CheckCheck],
];

const accountTypes = [
  ["asset", "Actif"],
  ["liability", "Passif"],
  ["equity", "Capitaux propres"],
  ["income", "Produit"],
  ["expense", "Charge"],
];

const journalTypes = [
  ["cash", "Caisse"],
  ["bank", "Banque"],
  ["purchase", "Achats"],
  ["sale", "Ventes"],
  ["general", "OD"],
  ["stock", "Stock"],
  ["adjustment", "Ajustement"],
];

const money = (value) => `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
const today = () => new Date().toISOString().slice(0, 10);

const TAB_KEYS = tabs.map(([key]) => key);

function resolveAccountingTab(mode) {
  if (TAB_KEYS.includes(mode)) return mode;
  const aliases = {
    "accounting-dashboard": "dashboard",
    "accounting-entries": "entries",
    "accounting-expenses": "expenses",
    "accounting-revenues": "revenues",
    "accounting-payments": "payments",
    revenue: "revenues",
    "received-payments": "payments",
    "cash-collections": "cash",
    banks: "banks",
    "stock-valuation": "statements",
    "financial-report": "statements",
    income: "statements",
    cashflow: "statements",
    balance: "statements",
    ledger: "statements",
    margins: "statements",
    profits: "statements",
    "monthly-result": "statements",
    "counted-damages": "expenses",
  };
  return aliases[mode] || "dashboard";
}

export function AccountingOperations({ apiBaseUrl, onMessage, mode }) {
  const [tab, setTab] = useState(resolveAccountingTab(mode));
  const [accounts, setAccounts] = useState([]);
  const [journals, setJournals] = useState([]);
  const [entries, setEntries] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [revenues, setRevenues] = useState([]);
  const [payments, setPayments] = useState([]);
  const [cashRegisters, setCashRegisters] = useState([]);
  const [banks, setBanks] = useState([]);
  const [summary, setSummary] = useState(null);
  const [statements, setStatements] = useState(null);
  const [accountForm, setAccountForm] = useState({ code: "", name: "", type: "asset" });
  const [journalForm, setJournalForm] = useState({ code: "", name: "", type: "general" });
  const [expenseForm, setExpenseForm] = useState({ expense_date: today(), amount: "", tax_rate: "19.25", description: "", payment_method: "cash" });
  const [revenueForm, setRevenueForm] = useState({ revenue_date: today(), amount: "", tax_rate: "19.25", description: "", payment_method: "cash" });
  const [entryForm, setEntryForm] = useState({ entry_date: today(), journal_id: "", description: "", debit_account_id: "", credit_account_id: "", amount: "" });
  const token = localStorage.getItem("access_token");

  useEffect(() => {
    setTab(resolveAccountingTab(mode));
  }, [mode]);

  const entryTotals = useMemo(() => entries.reduce((totals, entry) => ({
    debit: totals.debit + Number(entry.total_debit || 0),
    credit: totals.credit + Number(entry.total_credit || 0),
  }), { debit: 0, credit: 0 }), [entries]);

  useEffect(() => {
    loadAll();
  }, []);

  async function api(path, options = {}) {
    const fallback = options.fallback || "Action comptable impossible.";
    const { fallback: _fallback, ...requestOptions } = options;
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...requestOptions,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(requestOptions.headers || {}) },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(formatApiError(data?.detail ?? data?.message ?? data?.error, fallback));
    return data;
  }

  async function loadAll() {
    try {
      const [accountData, journalData, entryData, expenseData, revenueData, paymentData, cashData, bankData, summaryData, statementData] = await Promise.all([
        api("/api/v1/finance/accounts"),
        api("/api/v1/finance/journals"),
        api("/api/v1/finance/entries"),
        api("/api/v1/finance/expenses"),
        api("/api/v1/finance/revenues"),
        api("/api/v1/finance/payments"),
        api("/api/v1/finance/cash-registers"),
        api("/api/v1/finance/bank-accounts"),
        api("/api/v1/finance/summary"),
        api("/api/v1/finance/statements"),
      ]);
      setAccounts(accountData);
      setJournals(journalData);
      setEntries(entryData);
      setExpenses(expenseData);
      setRevenues(revenueData);
      setPayments(paymentData);
      setCashRegisters(cashData);
      setBanks(bankData);
      setSummary(summaryData);
      setStatements(statementData);
      setEntryForm((form) => ({ ...form, journal_id: form.journal_id || journalData[0]?.id || "", debit_account_id: form.debit_account_id || accountData[0]?.id || "", credit_account_id: form.credit_account_id || accountData[1]?.id || "" }));
    } catch (error) {
      onMessage?.(error.message);
    }
  }

  async function submit(path, payload, done, method = "POST") {
    try {
      const result = await api(path, { method, body: JSON.stringify(payload) });
      done?.();
      await loadAll();
      return result;
    } catch (error) {
      onMessage?.(error.message);
      return null;
    }
  }

  async function createEntry(event) {
    event.preventDefault();
    const amount = Number(entryForm.amount || 0);
    await submit("/api/v1/finance/entries", {
      entry_date: entryForm.entry_date,
      journal_id: entryForm.journal_id,
      description: entryForm.description,
      lines: [
        { account_id: entryForm.debit_account_id, label: entryForm.description, debit: amount, credit: 0 },
        { account_id: entryForm.credit_account_id, label: entryForm.description, debit: 0, credit: amount },
      ],
    }, () => onMessage?.("Écriture créée en brouillon."));
  }

  async function exportFec() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/finance/reports/fec`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Export FEC impossible.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `FEC_${today()}.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      onMessage?.(error.message);
    }
  }

  async function auditExport(reportType, format) {
    try {
      await api("/api/v1/finance/reports/export-audit", {
        method: "POST",
        body: JSON.stringify({ report_type: reportType, format }),
      });
    } catch (error) {
      onMessage?.(error.message);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-slate-950">Comptabilité générale</h2>
        <button
          type="button"
          onClick={exportFec}
          className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <Download size={16} /> Export FEC
        </button>
      </header>
      <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2">
        {tabs.map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium ${tab === key ? "bg-slate-950 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </nav>
      {tab === "dashboard" && <Dashboard summary={summary} entryTotals={entryTotals} />}
      {tab === "accounts" && <Accounts accounts={accounts} form={accountForm} setForm={setAccountForm} onSubmit={(event) => { event.preventDefault(); submit("/api/v1/finance/accounts", accountForm, () => setAccountForm({ code: "", name: "", type: "asset" })); }} />}
      {tab === "journals" && <Journals journals={journals} form={journalForm} setForm={setJournalForm} onSubmit={(event) => { event.preventDefault(); submit("/api/v1/finance/journals", journalForm, () => setJournalForm({ code: "", name: "", type: "general" })); }} />}
      {tab === "entries" && <Entries entries={entries} accounts={accounts} journals={journals} form={entryForm} setForm={setEntryForm} onSubmit={createEntry} />}
      {tab === "expenses" && <OperationForm title="Dépense" rows={expenses} form={expenseForm} setForm={setExpenseForm} dateField="expense_date" endpoint="/api/v1/finance/expenses" submit={submit} />}
      {tab === "revenues" && <OperationForm title="Recette" rows={revenues} form={revenueForm} setForm={setRevenueForm} dateField="revenue_date" endpoint="/api/v1/finance/revenues" submit={submit} />}
      {tab === "payments" && <SimpleRows title="Paiements" rows={payments} columns={["payment_date", "payment_type", "payment_method", "amount", "status"]} />}
      {tab === "cash" && <SimpleRows title="Caisses" rows={cashRegisters} columns={["name", "code", "is_active"]} />}
      {tab === "banks" && <SimpleRows title="Banques" rows={banks} columns={["bank_name", "account_name", "account_number", "is_active"]} />}
      {tab === "statements" && <Statements data={statements} onExport={auditExport} />}
      {tab === "food-cost" && <FoodCost api={api} onMessage={onMessage} />}
      {tab === "echeancier" && <Echeancier api={api} onMessage={onMessage} />}
      {tab === "rapprochement" && <Rapprochement api={api} accounts={accounts} onMessage={onMessage} />}
    </div>
  );
}

function FoodCost({ api, onMessage }) {
  const [data, setData] = useState(null);
  const [dishes, setDishes] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [foodCost, margins] = await Promise.all([
          api("/api/v1/finance/reports/food-cost"),
          api("/api/v1/finance/dish-margins"),
        ]);
        setData(foodCost);
        setDishes(margins);
      } catch (error) {
        onMessage?.(error.message);
      }
    })();
  }, []);

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Chiffre d'affaires" value={money(data?.revenue)} />
        <Stat label="Coût matière" value={money(data?.material_cost)} />
        <Stat label="Marge" value={money(data?.margin)} />
        <Stat label="Food-cost %" value={`${Number(data?.food_cost_rate || 0).toFixed(2)} %`} />
      </div>
      <Panel title="Food-cost par catégorie">
        <SimpleTable
          columns={[["category", "Catégorie"], ["revenue", "CA", money], ["material_cost", "Coût matière", money], ["food_cost_rate", "Food-cost %", (v) => `${Number(v || 0).toFixed(2)} %`]]}
          rows={data?.by_category || []}
        />
      </Panel>
      <Panel title="Marge par plat">
        <SimpleTable
          columns={[["name", "Plat"], ["quantity_sold", "Vendus"], ["revenue", "CA", money], ["estimated_cost", "Coût", money], ["estimated_margin", "Marge", money], ["food_cost_rate", "Food-cost %", (v) => `${Number(v || 0).toFixed(2)} %`]]}
          rows={dishes}
        />
      </Panel>
    </section>
  );
}

function Echeancier({ api, onMessage }) {
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState({ direction: "payable", label: "", due_date: today(), amount: "" });

  async function load() {
    try {
      setSummary(await api("/api/v1/finance/reports/payment-schedule"));
    } catch (error) {
      onMessage?.(error.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function create(event) {
    event.preventDefault();
    try {
      await api("/api/v1/finance/payment-schedules", {
        method: "POST",
        body: JSON.stringify({ ...form, amount: Number(form.amount || 0), due_date: new Date(form.due_date).toISOString() }),
      });
      setForm({ direction: form.direction, label: "", due_date: today(), amount: "" });
      await load();
    } catch (error) {
      onMessage?.(error.message);
    }
  }

  async function pay(id) {
    try {
      await api(`/api/v1/finance/payment-schedules/${id}/pay`, { method: "PATCH" });
      await load();
    } catch (error) {
      onMessage?.(error.message);
    }
  }

  function Block({ title, bucket, tone }) {
    return (
      <Panel title={title}>
        <div className="mb-3 flex gap-3 text-sm">
          <span>Total : <strong>{money(bucket?.total)}</strong></span>
          <span className={Number(bucket?.overdue_total || 0) > 0 ? "text-red-600" : "text-slate-500"}>En retard : <strong>{money(bucket?.overdue_total)}</strong></span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-slate-500"><th className="px-2 py-2">Libellé</th><th className="px-2 py-2">Échéance</th><th className="px-2 py-2">Montant</th><th className="px-2 py-2" /></tr></thead>
            <tbody>
              {(bucket?.items || []).map((item) => (
                <tr key={item.id} className={`border-b border-slate-100 ${item.overdue ? "bg-red-50" : ""}`}>
                  <td className="px-2 py-2">{item.label}</td>
                  <td className="px-2 py-2">{String(item.due_date || "").slice(0, 10)}</td>
                  <td className="px-2 py-2 font-semibold">{money(item.amount)}</td>
                  <td className="px-2 py-2 text-right"><button type="button" onClick={() => pay(item.id)} className="rounded bg-slate-950 px-2 py-1 text-xs font-bold text-white">Régler</button></td>
                </tr>
              ))}
              {!(bucket?.items || []).length && <tr><td colSpan={4} className="px-2 py-4 text-center text-slate-500">Aucune échéance.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    );
  }

  return (
    <section className="space-y-4">
      <Panel title="Nouvelle échéance">
        <form onSubmit={create} className="grid gap-3 md:grid-cols-5">
          <Select label="Sens" value={form.direction} onChange={(direction) => setForm({ ...form, direction })} options={[["payable", "À payer (fournisseur)"], ["receivable", "À encaisser (client)"]]} />
          <Input label="Libellé" value={form.label} onChange={(label) => setForm({ ...form, label })} />
          <Input label="Échéance" type="date" value={form.due_date} onChange={(due_date) => setForm({ ...form, due_date })} />
          <Input label="Montant" type="number" value={form.amount} onChange={(amount) => setForm({ ...form, amount })} />
          <div className="self-end"><Submit /></div>
        </form>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Block title="À payer" bucket={summary?.payable} />
        <Block title="À encaisser" bucket={summary?.receivable} />
      </div>
    </section>
  );
}

function Rapprochement({ api, accounts, onMessage }) {
  const treasury = (accounts || []).filter((account) => /^5/.test(account.code || ""));
  const [accountId, setAccountId] = useState("");
  const [statement, setStatement] = useState("");
  const [report, setReport] = useState(null);

  useEffect(() => { if (!accountId && treasury.length) setAccountId(treasury[0].id); }, [accounts]);

  async function run() {
    if (!accountId) return;
    try {
      const query = `account_id=${accountId}${statement !== "" ? `&statement_balance=${statement}` : ""}`;
      setReport(await api(`/api/v1/finance/reports/bank-reconciliation?${query}`));
    } catch (error) {
      onMessage?.(error.message);
    }
  }

  async function pointer(lineId) {
    try {
      await api(`/api/v1/finance/entry-lines/${lineId}/reconcile?reconciled=true`, { method: "PATCH" });
      await run();
    } catch (error) {
      onMessage?.(error.message);
    }
  }

  return (
    <section className="space-y-4">
      <Panel title="Rapprochement bancaire">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Select label="Compte trésorerie" value={accountId} onChange={setAccountId} options={treasury.map((a) => [a.id, `${a.code} - ${a.name}`])} />
          <Input label="Solde du relevé" type="number" value={statement} onChange={setStatement} />
          <div className="self-end"><button type="button" onClick={run} className="min-h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white">Rapprocher</button></div>
        </div>
      </Panel>
      {report && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat label="Solde comptable" value={money(report.book_balance)} />
            <Stat label="Solde pointé" value={money(report.reconciled_balance)} />
            <Stat label="Non pointé" value={money(report.unreconciled_total)} />
            <Stat label="Écart vs relevé" value={report.gap == null ? "—" : money(report.gap)} />
          </div>
          <Panel title="Lignes non pointées">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-slate-200 text-slate-500"><th className="px-2 py-2">Date</th><th className="px-2 py-2">N°</th><th className="px-2 py-2">Libellé</th><th className="px-2 py-2">Débit</th><th className="px-2 py-2">Crédit</th><th className="px-2 py-2" /></tr></thead>
                <tbody>
                  {(report.unreconciled_lines || []).map((line) => (
                    <tr key={line.line_id} className="border-b border-slate-100">
                      <td className="px-2 py-2">{String(line.entry_date || "").slice(0, 10)}</td>
                      <td className="px-2 py-2">{line.entry_number}</td>
                      <td className="px-2 py-2">{line.label}</td>
                      <td className="px-2 py-2">{money(line.debit)}</td>
                      <td className="px-2 py-2">{money(line.credit)}</td>
                      <td className="px-2 py-2 text-right"><button type="button" onClick={() => pointer(line.line_id)} className="rounded bg-emerald-600 px-2 py-1 text-xs font-bold text-white">Pointer</button></td>
                    </tr>
                  ))}
                  {!(report.unreconciled_lines || []).length && <tr><td colSpan={6} className="px-2 py-4 text-center text-emerald-700">Tout est pointé ✓</td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </section>
  );
}

function SimpleTable({ columns, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b border-slate-200 text-slate-500">{columns.map(([key, label]) => <th key={key} className="px-2 py-2 font-medium">{label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || row.menu_item_id || row.category || index} className="border-b border-slate-100">
              {columns.map(([key, , fmt]) => <td key={key} className="px-2 py-2">{fmt ? fmt(row[key]) : String(row[key] ?? "-")}</td>)}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={columns.length} className="px-2 py-4 text-center text-slate-500">Aucune donnée.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Dashboard({ summary, entryTotals }) {
  return <div className="grid gap-3 md:grid-cols-5">
    <Stat label="Recettes" value={money(summary?.revenue)} />
    <Stat label="Dépenses" value={money(summary?.expenses)} />
    <Stat label="Solde caisse" value={money(summary?.cash_balance)} />
    <Stat label="Solde banque" value={money(summary?.bank_balance)} />
    <Stat label="Résultat" value={money(summary?.net_profit)} />
    <Stat label="Débits écritures" value={money(entryTotals.debit)} />
    <Stat label="Crédits écritures" value={money(entryTotals.credit)} />
  </div>;
}

function Accounts({ accounts, form, setForm, onSubmit }) {
  return <section className="grid gap-4 xl:grid-cols-[360px_1fr]"><Panel title="Créer un compte"><form onSubmit={onSubmit} className="space-y-3"><Input label="Code" value={form.code} onChange={(code) => setForm({ ...form, code })} /><Input label="Nom" value={form.name} onChange={(name) => setForm({ ...form, name })} /><Select label="Type" value={form.type} onChange={(type) => setForm({ ...form, type })} options={accountTypes} /><Submit /></form></Panel><SimpleRows title="Plan comptable" rows={accounts} columns={["code", "name", "type", "is_active"]} /></section>;
}

function Journals({ journals, form, setForm, onSubmit }) {
  return <section className="grid gap-4 xl:grid-cols-[360px_1fr]"><Panel title="Créer un journal"><form onSubmit={onSubmit} className="space-y-3"><Input label="Code" value={form.code} onChange={(code) => setForm({ ...form, code })} /><Input label="Nom" value={form.name} onChange={(name) => setForm({ ...form, name })} /><Select label="Type" value={form.type} onChange={(type) => setForm({ ...form, type })} options={journalTypes} /><Submit /></form></Panel><SimpleRows title="Journaux" rows={journals} columns={["code", "name", "type", "is_active"]} /></section>;
}

function Entries({ entries, accounts, journals, form, setForm, onSubmit }) {
  return <section className="space-y-4"><Panel title="Créer une écriture équilibrée"><form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-3"><Input label="Date" type="date" value={form.entry_date} onChange={(entry_date) => setForm({ ...form, entry_date })} /><Select label="Journal" value={form.journal_id} onChange={(journal_id) => setForm({ ...form, journal_id })} options={journals.map((j) => [j.id, `${j.code} - ${j.name}`])} /><Input label="Libellé" value={form.description} onChange={(description) => setForm({ ...form, description })} /><Select label="Compte débit" value={form.debit_account_id} onChange={(debit_account_id) => setForm({ ...form, debit_account_id })} options={accounts.map((a) => [a.id, `${a.code} - ${a.name}`])} /><Select label="Compte crédit" value={form.credit_account_id} onChange={(credit_account_id) => setForm({ ...form, credit_account_id })} options={accounts.map((a) => [a.id, `${a.code} - ${a.name}`])} /><Input label="Montant" type="number" value={form.amount} onChange={(amount) => setForm({ ...form, amount })} /><Submit /></form></Panel><SimpleRows title="Écritures" rows={entries} columns={["entry_date", "entry_number", "description", "status", "total_debit", "total_credit", "is_balanced"]} /></section>;
}

function OperationForm({ title, rows, form, setForm, dateField, endpoint, submit }) {
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
      await submit(`${endpoint}/${created.id}/validate?payment_method=${form.payment_method}`, {}, null, "PATCH");
      setForm({ [dateField]: today(), amount: "", tax_rate: form.tax_rate || "19.25", description: "", payment_method: form.payment_method || "cash" });
    }
  }
  return <section className="grid gap-4 xl:grid-cols-[360px_1fr]"><Panel title={`Créer ${title.toLowerCase()}`}><form onSubmit={save} className="space-y-3"><Input label="Date" type="date" value={form[dateField]} onChange={(value) => setForm({ ...form, [dateField]: value })} /><Input label="Montant HT" type="number" value={form.amount} onChange={(amountValue) => setForm({ ...form, amount: amountValue })} /><Input label="Taxe (%)" type="number" value={form.tax_rate} onChange={(tax_rate) => setForm({ ...form, tax_rate })} /><div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700"><div className="flex justify-between"><span>Sous-total</span><strong>{money(amount)}</strong></div><div className="mt-1 flex justify-between"><span>Montant taxe</span><strong>{money(taxAmount)}</strong></div><div className="mt-1 flex justify-between text-slate-950"><span>Total TTC</span><strong>{money(totalAmount)}</strong></div></div><Input label="Description" value={form.description} onChange={(description) => setForm({ ...form, description })} /><Select label="Paiement" value={form.payment_method} onChange={(payment_method) => setForm({ ...form, payment_method })} options={[["cash", "Caisse"], ["bank", "Banque"], ["mobile_money", "Mobile money"], ["other", "Autre"]]} /><Submit /></form></Panel><SimpleRows title={title} rows={rows} columns={[dateField, "description", "amount", "tax_rate", "tax_amount", "total_amount", "payment_status", "status"]} /></section>;
}

function Statements({ data, onExport }) {
  const income = data?.income_statement || {};
  const balance = data?.balance_sheet || {};
  const cashFlow = data?.cash_flow || {};
  const trialBalance = data?.trial_balance || {};
  const exportRows = [
    { section: "Compte de résultat", label: "Produits", amount: money(income.total_products) },
    { section: "Compte de résultat", label: "Charges", amount: money(income.total_charges) },
    { section: "Compte de résultat", label: "Résultat net", amount: money(income.net_result) },
    { section: "Bilan", label: "Total actif", amount: money(balance.total_assets) },
    { section: "Bilan", label: "Total passif", amount: money(balance.total_liabilities) },
    { section: "Flux de trésorerie", label: "Encaissements", amount: money(cashFlow.cash_in) },
    { section: "Flux de trésorerie", label: "Décaissements", amount: money(cashFlow.cash_out) },
    { section: "Flux de trésorerie", label: "Flux net", amount: money(cashFlow.net_cash_flow) },
    { section: "Flux de trésorerie", label: "Solde final", amount: money(cashFlow.final_balance) },
    { section: "Balance générale", label: "Total débit", amount: money(trialBalance.total_debit) },
    { section: "Balance générale", label: "Total crédit", amount: money(trialBalance.total_credit) },
  ];
  const exportColumns = [["section", "Section"], ["label", "Indicateur"], ["amount", "Montant"]];

  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <ExportActions title="États financiers" filename="etats-financiers" rows={exportRows} columns={exportColumns} onExport={(format) => onExport?.("financial-statements", format)} />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Résultat net" value={money(income.net_result)} />
        <Stat label="Total actif" value={money(balance.total_assets)} />
        <Stat label="Trésorerie finale" value={money(cashFlow.final_balance)} />
        <Stat label="Balance équilibrée" value={balance.is_balanced ? "Oui" : "Non"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Compte de résultat">
          <StatementRows rows={[
            ["Produits", money(income.total_products)],
            ["Charges", money(income.total_charges)],
            ["Résultat net", money(income.net_result), income.net_result >= 0 ? "positive" : "negative"],
          ]} />
          <StatementDetails title="Détail produits" rows={income.products} />
          <StatementDetails title="Détail charges" rows={income.charges} />
        </Panel>

        <Panel title="Bilan">
          <StatementRows rows={[
            ["Total actif", money(balance.total_assets)],
            ["Total passif", money(balance.total_liabilities)],
            ["Résultat net", money(balance.net_result)],
            ["Équilibre", balance.is_balanced ? "Bilan équilibré" : "Écart à contrôler", balance.is_balanced ? "positive" : "negative"],
          ]} />
          <StatementDetails title="Actifs" rows={balance.assets} />
          <StatementDetails title="Passifs" rows={balance.liabilities} />
        </Panel>

        <Panel title="Flux de trésorerie">
          <StatementRows rows={[
            ["Solde initial", money(cashFlow.initial_balance)],
            ["Encaissements", money(cashFlow.cash_in), "positive"],
            ["Décaissements", money(cashFlow.cash_out), "negative"],
            ["Flux net", money(cashFlow.net_cash_flow), cashFlow.net_cash_flow >= 0 ? "positive" : "negative"],
            ["Solde final", money(cashFlow.final_balance)],
          ]} />
          <StatementDetails title="Mouvements" rows={cashFlow.movements} />
        </Panel>

        <Panel title="Balance générale">
          <StatementRows rows={[
            ["Total débit", money(trialBalance.total_debit)],
            ["Total crédit", money(trialBalance.total_credit)],
            ["Écart", money(Number(trialBalance.total_debit || 0) - Number(trialBalance.total_credit || 0))],
          ]} />
          <StatementDetails title="Comptes" rows={trialBalance.rows} />
        </Panel>
      </div>
    </section>
  );
}

function ExportActions({ title, filename, rows, columns, onExport }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={async () => { await onExport?.("excel"); exportExcel(`${filename}-${today()}.xls`, title, rows, columns); }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
        <Download size={16} />
        Exporter Excel
      </button>
      <button type="button" onClick={async () => { await onExport?.("pdf"); exportPdf(title, rows, columns); }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
        <Download size={16} />
        Exporter PDF
      </button>
    </div>
  );
}

function exportExcel(filename, title, rows, columns) {
  const blob = new Blob([buildExportDocument(title, rows, columns)], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportPdf(title, rows, columns) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    window.alert("Export PDF bloqué par le navigateur.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(buildExportDocument(title, rows, columns, true));
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);
}

function buildExportDocument(title, rows, columns, printable = false) {
  const exportedAt = new Date().toLocaleString("fr-FR");
  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #172033; padding: ${printable ? "28px" : "12px"}; }
          h1 { margin: 0 0 6px; color: #0f172a; }
          p { margin: 0 0 16px; color: #475569; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #0f172a; color: white; text-align: left; }
          th, td { border: 1px solid #d8dee9; padding: 8px; }
          tr:nth-child(even) td { background: #f8fafc; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p>Exporté le ${escapeHtml(exportedAt)}</p>
        <table>
          <thead><tr>${columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead>
          <tbody>${rows.map((row) => `<tr>${columns.map(([key]) => `<td>${escapeHtml(row[key])}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </body>
    </html>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function StatementRows({ rows }) {
  return (
    <div className="divide-y divide-slate-100 rounded-md border border-slate-100">
      {rows.map(([label, value, tone]) => (
        <div key={label} className="flex items-center justify-between gap-4 px-3 py-3 text-sm">
          <span className="font-medium text-slate-600">{label}</span>
          <strong className={tone === "positive" ? "text-emerald-700" : tone === "negative" ? "text-red-600" : "text-slate-950"}>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function StatementDetails({ title, rows }) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">{title}: aucune ligne.</p>;
  }
  return (
    <div className="mt-4">
      <h4 className="mb-2 text-sm font-semibold text-slate-700">{title}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <tbody>
            {list.map((row, index) => (
              <tr key={row.id || row.code || index} className="border-t border-slate-100">
                <td className="py-2 pr-3 font-medium text-slate-700">{row.name || row.label || row.account_name || row.code || `Ligne ${index + 1}`}</td>
                <td className="py-2 text-right font-semibold text-slate-950">{money(row.amount ?? row.balance ?? row.value ?? row.debit ?? row.credit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SimpleRows({ title, rows, columns }) {
  return <Panel title={title}><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-slate-500">{columns.map((column) => <th key={column} className="px-3 py-2 font-medium">{column}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b border-slate-100">{columns.map((column) => <td key={column} className="px-3 py-3">{String(row[column] ?? "-")}</td>)}</tr>)}{!rows.length && <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-slate-500">Aucune donnée.</td></tr>}</tbody></table></div></Panel>;
}

function Panel({ title, children }) {
  return <section className="rounded-md border border-slate-200 bg-white p-4"><h3 className="mb-4 text-lg font-semibold text-slate-950">{title}</h3>{children}</section>;
}

function Stat({ label, value }) {
  return <div className="rounded-md border border-slate-200 bg-white p-4"><span className="text-sm text-slate-500">{label}</span><strong className="mt-2 block text-xl text-slate-950">{value}</strong></div>;
}

function Input({ label, value, onChange, type = "text" }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">{label}</span><input type={type} step={type === "number" ? "0.01" : undefined} className="min-h-10 w-full rounded-md border border-slate-200 px-3 outline-none focus:border-slate-500" value={value || ""} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Select({ label, value, onChange, options }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">{label}</span><select className="min-h-10 w-full rounded-md border border-slate-200 px-3 outline-none focus:border-slate-500" value={value || ""} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, labelText]) => <option key={optionValue} value={optionValue}>{labelText}</option>)}</select></label>;
}

function Submit() {
  return <button type="submit" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white"><Plus size={16} /> Enregistrer</button>;
}
