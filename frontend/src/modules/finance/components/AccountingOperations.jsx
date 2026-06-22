import { useEffect, useMemo, useState } from "react";
import { BarChart3, BookOpen, Building2, Calculator, CreditCard, Landmark, Plus, ReceiptText, Wallet } from "lucide-react";

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
  const [expenseForm, setExpenseForm] = useState({ expense_date: today(), amount: "", tax_amount: "", description: "", payment_method: "cash" });
  const [revenueForm, setRevenueForm] = useState({ revenue_date: today(), amount: "", tax_amount: "", description: "", payment_method: "cash" });
  const [entryForm, setEntryForm] = useState({ entry_date: today(), journal_id: "", description: "", debit_account_id: "", credit_account_id: "", amount: "" });
  const token = localStorage.getItem("access_token");

  const entryTotals = useMemo(() => entries.reduce((totals, entry) => ({
    debit: totals.debit + Number(entry.total_debit || 0),
    credit: totals.credit + Number(entry.total_credit || 0),
  }), { debit: 0, credit: 0 }), [entries]);

  useEffect(() => {
    loadAll();
  }, []);

  async function api(path, options = {}) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(Array.isArray(data?.detail) ? data.detail.map((item) => item.msg).join(" | ") : data?.detail || "Opération impossible.");
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

  async function submit(path, payload, done) {
    try {
      await api(path, { method: "POST", body: JSON.stringify(payload) });
      done?.();
      await loadAll();
    } catch (error) {
      onMessage?.(error.message);
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

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-semibold text-slate-950">Comptabilité générale</h2>
        <p className="text-sm text-slate-500">Partie double, journaux, caisse, banque et états financiers.</p>
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
      {tab === "statements" && <Statements data={statements} />}
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
  return <section className="grid gap-4 xl:grid-cols-[360px_1fr]"><Panel title={`Créer ${title.toLowerCase()}`}><form onSubmit={(event) => { event.preventDefault(); submit(endpoint, { ...form, amount: Number(form.amount || 0), tax_amount: Number(form.tax_amount || 0) }); }} className="space-y-3"><Input label="Date" type="date" value={form[dateField]} onChange={(value) => setForm({ ...form, [dateField]: value })} /><Input label="Montant HT" type="number" value={form.amount} onChange={(amount) => setForm({ ...form, amount })} /><Input label="Taxe" type="number" value={form.tax_amount} onChange={(tax_amount) => setForm({ ...form, tax_amount })} /><Input label="Description" value={form.description} onChange={(description) => setForm({ ...form, description })} /><Select label="Paiement" value={form.payment_method} onChange={(payment_method) => setForm({ ...form, payment_method })} options={[["cash", "Caisse"], ["bank", "Banque"], ["mobile_money", "Mobile money"], ["other", "Autre"]]} /><Submit /></form></Panel><SimpleRows title={title} rows={rows} columns={[dateField, "description", "amount", "tax_amount", "total_amount", "payment_status", "status"]} /></section>;
}

function Statements({ data }) {
  return <section className="grid gap-4 lg:grid-cols-2"><Panel title="Compte de résultat"><pre className="overflow-auto text-xs">{JSON.stringify(data?.income_statement || {}, null, 2)}</pre></Panel><Panel title="Bilan"><pre className="overflow-auto text-xs">{JSON.stringify(data?.balance_sheet || {}, null, 2)}</pre></Panel><Panel title="Flux de trésorerie"><pre className="overflow-auto text-xs">{JSON.stringify(data?.cash_flow || {}, null, 2)}</pre></Panel><Panel title="Balance générale"><pre className="overflow-auto text-xs">{JSON.stringify(data?.trial_balance || {}, null, 2)}</pre></Panel></section>;
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
