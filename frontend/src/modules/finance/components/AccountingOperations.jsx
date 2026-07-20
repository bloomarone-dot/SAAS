import { useEffect, useMemo, useState } from "react";

import {
  PageContainer,
  SecondaryAction,
} from "@/modules/admin/components/AdminUi";
import { apiFetch, apiFetchText } from "@/config/http";

import { today } from "./shared/format";
import { resolveAccountingTab } from "./shared/constants";
import { exportExcel } from "./shared/exports";
import { AccountingModuleShell } from "./shared/AccountingModuleShell";
import { getAccountingModuleMeta } from "./shared/moduleCatalog";
import { Dashboard } from "./Dashboard/Dashboard";
import { ExpenseAnalytics } from "./Dashboard/ExpenseAnalytics";
import { Accounts } from "./Compte/Accounts";
import { Journals } from "./Journal/Journals";
import { Entries } from "./Ecriture/Entries";
import { Encaissements } from "./Encaissements/Encaissements";
import { OperationForm } from "./Operation/OperationForm";
import { Statements } from "./Etats/Statements";
import { FoodCost } from "./FoodCost/FoodCost";
import { Echeancier } from "./Echeancier/Echeancier";
import { Rapprochement } from "./Rapprochement/Rapprochement";
import { CashOverview } from "./Cash/CashOverview";
import { SimpleRows } from "./shared/ui";

const STOCK_NAV_ALIASES = {
  entries: "accounting-entries",
  expenses: "accounting-expenses",
  revenues: "accounting-revenues",
  payments: "accounting-payments",
};

const FINANCE_FALLBACK = "Action comptable impossible.";

/** Adaptateur pour les sous-composants qui reçoivent encore une prop `api`. */
function financeApi(path, options = {}) {
  const { fallback = FINANCE_FALLBACK, ...rest } = options;
  return apiFetch(path, { fallback, ...rest });
}

export function AccountingOperations({ onMessage, mode, onNavigate, role }) {
  const [tab, setTab] = useState(resolveAccountingTab(mode));
  const [accounts, setAccounts] = useState([]);
  const [journals, setJournals] = useState([]);
  const [entries, setEntries] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [revenues, setRevenues] = useState([]);
  const [payments, setPayments] = useState([]);
  const [cashRegisters, setCashRegisters] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [summary, setSummary] = useState(null);
  const [statements, setStatements] = useState(null);
  const [accountForm, setAccountForm] = useState({
    code: "",
    name: "",
    type: "asset",
  });
  const [journalForm, setJournalForm] = useState({
    code: "",
    name: "",
    type: "general",
  });
  const [expenseForm, setExpenseForm] = useState({
    expense_date: today(),
    total_amount: "",
    tax_rate: "0",
    description: "",
    payment_method: "cash",
    category_id: "",
  });
  const [revenueForm, setRevenueForm] = useState({
    revenue_date: today(),
    total_amount: "",
    tax_rate: "19.25",
    description: "",
    payment_method: "cash",
  });
  const [entryForm, setEntryForm] = useState({
    entry_date: today(),
    journal_id: "",
    description: "",
    debit_account_id: "",
    credit_account_id: "",
    amount: "",
  });
  const moduleMeta = getAccountingModuleMeta(tab);
  const isDashboard = tab === "dashboard";

  useEffect(() => {
    setTab(resolveAccountingTab(mode));
  }, [mode]);

  const entryTotals = useMemo(
    () =>
      entries.reduce(
        (totals, entry) => ({
          debit: totals.debit + Number(entry.total_debit || 0),
          credit: totals.credit + Number(entry.total_credit || 0),
        }),
        { debit: 0, credit: 0 },
      ),
    [entries],
  );

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const resources = [
      ["accounts", () => financeApi("/api/v1/finance/accounts"), setAccounts, []],
      ["journals", () => financeApi("/api/v1/finance/journals"), setJournals, []],
      ["entries", () => financeApi("/api/v1/finance/entries"), setEntries, []],
      ["expenses", () => financeApi("/api/v1/finance/expenses"), setExpenses, []],
      ["revenues", () => financeApi("/api/v1/finance/revenues"), setRevenues, []],
      ["payments", () => financeApi("/api/v1/finance/payments"), setPayments, []],
      ["cash", () => financeApi("/api/v1/finance/cash-registers"), setCashRegisters, []],
      ["expenseCategories", () => financeApi("/api/v1/finance/expense-categories"), setExpenseCategories, []],
      ["summary", () => financeApi("/api/v1/finance/summary"), setSummary, null],
      ["statements", () => financeApi("/api/v1/finance/statements"), setStatements, null],
    ];
    const results = await Promise.allSettled(resources.map(([, load]) => load()));
    const loaded = {};
    results.forEach((result, index) => {
      const [name, , setter, fallback] = resources[index];
      if (result.status === "fulfilled") {
        loaded[name] = result.value;
        setter(result.value);
        return;
      }
      setter(fallback);
      onMessage?.(result.reason?.message || "Chargement comptable partiel impossible.");
    });
    const accountData = loaded.accounts || [];
    const journalData = loaded.journals || [];
    setEntryForm((form) => ({
      ...form,
      journal_id: form.journal_id || journalData[0]?.id || "",
      debit_account_id: form.debit_account_id || accountData[0]?.id || "",
      credit_account_id: form.credit_account_id || accountData[1]?.id || "",
    }));
  }

  async function submit(path, payload, done, method = "POST") {
    try {
      const result = await financeApi(path, { method, body: payload });
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
    await submit(
      "/api/v1/finance/entries",
      {
        entry_date: entryForm.entry_date,
        journal_id: entryForm.journal_id,
        description: entryForm.description,
        lines: [
          {
            account_id: entryForm.debit_account_id,
            label: entryForm.description,
            debit: amount,
            credit: 0,
          },
          {
            account_id: entryForm.credit_account_id,
            label: entryForm.description,
            debit: 0,
            credit: amount,
          },
        ],
      },
      () => onMessage?.("Écriture créée en brouillon."),
    );
  }

  async function exportFec() {
    try {
      const text = await apiFetchText("/api/v1/finance/reports/fec", {
        fallback: "Export impossible.",
      });
      const lines = text.split("\n").filter((line) => line.length);
      if (lines.length < 2)
        throw new Error("Aucune écriture comptable à exporter.");
      const header = lines[0].split("\t");
      const columns = header.map((label, index) => [String(index), label]);
      const rows = lines.slice(1).map((line) => {
        const cells = line.split("\t");
        const row = {};
        header.forEach((_, index) => {
          row[String(index)] = cells[index] ?? "";
        });
        return row;
      });
      exportExcel(
        `FEC-${today()}.xls`,
        "FEC - Écritures comptables",
        rows,
        columns,
      );
    } catch (error) {
      onMessage?.(error.message);
    }
  }

  async function auditExport(reportType, format) {
    try {
      await financeApi("/api/v1/finance/reports/export-audit", {
        method: "POST",
        body: { report_type: reportType, format },
      });
    } catch (error) {
      onMessage?.(error.message);
    }
  }

  async function restoreDefaults() {
    const result = await submit(
      "/api/v1/finance/defaults/restore",
      {},
      () => onMessage?.("Plan comptable et journaux restaurés."),
    );
    if (result) await loadAll();
  }

  function navigateTab(view) {
    let target = view === "dashboard" ? "comptabilite" : view;
    if (role === "STOCK" && STOCK_NAV_ALIASES[view]) {
      target = STOCK_NAV_ALIASES[view];
    }
    if (onNavigate) onNavigate(target);
    else setTab(resolveAccountingTab(view));
  }

  function renderModuleContent() {
    switch (tab) {
      case "accounts":
        return (
          <Accounts
            accounts={accounts}
            form={accountForm}
            setForm={setAccountForm}
            onSubmit={(event) => {
              event.preventDefault();
              submit("/api/v1/finance/accounts", accountForm, () =>
                setAccountForm({ code: "", name: "", type: "asset" }),
              );
            }}
          />
        );
      case "journals":
        return (
          <Journals
            journals={journals}
            form={journalForm}
            setForm={setJournalForm}
            onSubmit={(event) => {
              event.preventDefault();
              submit("/api/v1/finance/journals", journalForm, () =>
                setJournalForm({ code: "", name: "", type: "general" }),
              );
            }}
          />
        );
      case "entries":
        return (
          <Entries
            entries={entries}
            accounts={accounts}
            journals={journals}
            form={entryForm}
            setForm={setEntryForm}
            onSubmit={createEntry}
          />
        );
      case "expenses":
        return (
          <OperationForm
            title="Sortie d'argent"
            variant="expense"
            expenseCategories={expenseCategories}
            rows={expenses}
            form={expenseForm}
            setForm={setExpenseForm}
            dateField="expense_date"
            endpoint="/api/v1/finance/expenses"
            submit={submit}
            helperText="Exemples : payer le transport, un livreur, le loyer, l'électricité, un fournisseur en espèces. Les achats stock se font dans le module Stocks — ne les re-saisissez pas ici."
          />
        );
      case "expense-analytics":
        return <ExpenseAnalytics onMessage={onMessage} embedded={false} />;
      case "encaissements":
        return <Encaissements onMessage={onMessage} />;
      case "revenues":
        return (
          <OperationForm
            title="Recette manuelle"
            rows={revenues}
            form={revenueForm}
            setForm={setRevenueForm}
            dateField="revenue_date"
            endpoint="/api/v1/finance/revenues"
            submit={submit}
            helperText="Recettes hors caisse (autres revenus). Les ventes encaissées en caisse sont dans Encaissements."
          />
        );
      case "payments":
        return (
          <SimpleRows
            title="Paiements"
            description="Liste des paiements enregistrés dans la comptabilité."
            rows={payments}
            columns={["payment_date", "payment_type", "payment_method", "amount", "status"]}
          />
        );
      case "cash":
        return <CashOverview registers={cashRegisters} api={financeApi} />;
      case "statements":
        return <Statements data={statements} onExport={auditExport} />;
      case "food-cost":
        return <FoodCost api={financeApi} onMessage={onMessage} />;
      case "echeancier":
        return <Echeancier api={financeApi} onMessage={onMessage} />;
      case "rapprochement":
        return <Rapprochement api={financeApi} accounts={accounts} onMessage={onMessage} />;
      default:
        return null;
    }
  }

  return (
    <PageContainer>
      {isDashboard ? (
        <>
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#078d50]">Comptabilité</p>
              <h1 className="mt-2 text-3xl font-black text-slate-950">Argent du restaurant</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">
                Entrées = ventes encaissées. Sorties = ce que vous payez (transport, livreur, charges…). Solde caisse = ce qu'il reste.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <SecondaryAction icon="Download" onClick={exportFec}>
                Export FEC
              </SecondaryAction>
              <SecondaryAction icon="RotateCcw" onClick={restoreDefaults}>
                Restaurer défauts
              </SecondaryAction>
            </div>
          </div>

          <div className="space-y-8">
            <Dashboard
              summary={summary}
              entryTotals={entryTotals}
              counts={{
                accounts: accounts.length,
                entries: entries.length,
                expenses: expenses.length,
              }}
              onNavigate={navigateTab}
            />
            <ExpenseAnalytics onMessage={onMessage} embedded />
          </div>
        </>
      ) : (
        <AccountingModuleShell
          title={moduleMeta?.label || "Module comptable"}
          description={moduleMeta?.description}
          onBack={() => navigateTab("dashboard")}
        >
          {renderModuleContent()}
        </AccountingModuleShell>
      )}
    </PageContainer>
  );
}
