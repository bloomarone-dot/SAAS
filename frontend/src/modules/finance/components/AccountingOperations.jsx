import { useEffect, useMemo, useState } from "react";

import {
  PageContainer,
  PageHeader,
  SecondaryAction,
} from "@/modules/admin/components/AdminUi";
import { formatApiError } from "@/utils/network";

import { today } from "./shared/format";
import { tabs, resolveAccountingTab } from "./shared/constants";
import { exportExcel } from "./shared/exports";
import { Dashboard } from "./Dashboard/Dashboard";
import { Accounts } from "./Compte/Accounts";
import { Journals } from "./Journal/Journals";
import { Entries } from "./Ecriture/Entries";
import { Encaissements } from "./Encaissements/Encaissements";
import { OperationForm } from "./Operation/OperationForm";
import { Statements } from "./Etats/Statements";
import { FoodCost } from "./FoodCost/FoodCost";
import { Echeancier } from "./Echeancier/Echeancier";
import { Rapprochement } from "./Rapprochement/Rapprochement";
import { SimpleRows } from "./shared/ui";

export function AccountingOperations({ apiBaseUrl, onMessage, mode, onNavigate }) {
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
    tax_rate: "19.25",
    description: "",
    payment_method: "cash",
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
  const token = localStorage.getItem("access_token");

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

  async function api(path, options = {}) {
    const fallback = options.fallback || "Action comptable impossible.";
    const { fallback: _fallback, ...requestOptions } = options;
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...requestOptions,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(requestOptions.headers || {}),
      },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        formatApiError(data?.detail ?? data?.message ?? data?.error, fallback),
      );
    return data;
  }

  async function loadAll() {
    const resources = [
      ["accounts", () => api("/api/v1/finance/accounts"), setAccounts, []],
      ["journals", () => api("/api/v1/finance/journals"), setJournals, []],
      ["entries", () => api("/api/v1/finance/entries"), setEntries, []],
      ["expenses", () => api("/api/v1/finance/expenses"), setExpenses, []],
      ["revenues", () => api("/api/v1/finance/revenues"), setRevenues, []],
      ["payments", () => api("/api/v1/finance/payments"), setPayments, []],
      ["cash", () => api("/api/v1/finance/cash-registers"), setCashRegisters, []],
      ["banks", () => api("/api/v1/finance/bank-accounts"), setBanks, []],
      ["summary", () => api("/api/v1/finance/summary"), setSummary, null],
      ["statements", () => api("/api/v1/finance/statements"), setStatements, null],
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
      const response = await fetch(`${apiBaseUrl}/api/v1/finance/reports/fec`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Export impossible.");
      const text = await response.text();
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
      await api("/api/v1/finance/reports/export-audit", {
        method: "POST",
        body: JSON.stringify({ report_type: reportType, format }),
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

  const activeTabLabel = tabs.find(([key]) => key === tab)?.[1] || "Comptabilité";

  function navigateTab(view) {
    if (onNavigate) onNavigate(view);
    else setTab(resolveAccountingTab(view));
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Comptabilité"
        title="Comptabilité générale"
        subtitle="Suivez les écritures, dépenses, encaissements et états financiers du restaurant."
        primaryAction={
          tab !== "dashboard" ? (
            <SecondaryAction icon="LayoutDashboard" onClick={() => navigateTab("dashboard")}>
              Tableau de bord
            </SecondaryAction>
          ) : (
            <SecondaryAction icon="Download" onClick={exportFec}>
              Export FEC (Excel)
            </SecondaryAction>
          )
        }
        secondaryActions={
          tab === "dashboard" ? (
            <SecondaryAction icon="RotateCcw" onClick={restoreDefaults}>
              Restaurer les valeurs par défaut
            </SecondaryAction>
          ) : null
        }
        meta={[
          <span key="active">Vue active : {activeTabLabel}</span>,
          <span key="accounts">{accounts.length.toLocaleString("fr-FR")} compte(s)</span>,
          <span key="entries">{entries.length.toLocaleString("fr-FR")} écriture(s)</span>,
          <span key="expenses">{expenses.length.toLocaleString("fr-FR")} dépense(s)</span>,
        ]}
      />

      {tab === "dashboard" && (
        <Dashboard summary={summary} entryTotals={entryTotals} onNavigate={navigateTab} />
      )}
      {tab === "accounts" && (
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
      )}
      {tab === "journals" && (
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
      )}
      {tab === "entries" && (
        <Entries
          entries={entries}
          accounts={accounts}
          journals={journals}
          form={entryForm}
          setForm={setEntryForm}
          onSubmit={createEntry}
        />
      )}
      {tab === "expenses" && (
        <OperationForm
          title="Dépense"
          rows={expenses}
          form={expenseForm}
          setForm={setExpenseForm}
          dateField="expense_date"
          endpoint="/api/v1/finance/expenses"
          submit={submit}
        />
      )}
      {tab === "encaissements" && <Encaissements onMessage={onMessage} />}
      {tab === "revenues" && (
        <OperationForm
          title="Recette manuelle"
          rows={revenues}
          form={revenueForm}
          setForm={setRevenueForm}
          dateField="revenue_date"
          endpoint="/api/v1/finance/revenues"
          submit={submit}
          helperText="Recettes hors caisse (autres revenus). Les ventes encaissées en caisse sont dans l'onglet Encaissements."
        />
      )}
      {tab === "payments" && (
        <SimpleRows
          title="Paiements"
          rows={payments}
          columns={[
            "payment_date",
            "payment_type",
            "payment_method",
            "amount",
            "status",
          ]}
        />
      )}
      {tab === "cash" && (
        <SimpleRows
          title="Caisses"
          rows={cashRegisters}
          columns={["name", "code", "is_active"]}
        />
      )}
      {tab === "banks" && (
        <SimpleRows
          title="Banques"
          rows={banks}
          columns={["bank_name", "account_name", "account_number", "is_active"]}
        />
      )}
      {tab === "statements" && (
        <Statements data={statements} onExport={auditExport} />
      )}
      {tab === "food-cost" && <FoodCost api={api} onMessage={onMessage} />}
      {tab === "echeancier" && <Echeancier api={api} onMessage={onMessage} />}
      {tab === "rapprochement" && (
        <Rapprochement api={api} accounts={accounts} onMessage={onMessage} />
      )}
    </PageContainer>
  );
}
