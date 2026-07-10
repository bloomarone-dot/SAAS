import { Plus } from "lucide-react";

const columnLabels = {
  account_name: "Nom du compte",
  account_number: "Numéro de compte",
  amount: "Montant HT",
  bank_name: "Banque",
  code: "Code",
  description: "Libellé",
  due_date: "Échéance",
  expense_date: "Date dépense",
  revenue_date: "Date recette",
  entry_date: "Date",
  entry_number: "N° écriture",
  invoice_number: "N° facture",
  is_active: "Statut",
  is_balanced: "Équilibrée",
  name: "Nom",
  payment_status: "Paiement",
  reference: "Référence",
  status: "Statut",
  tax_amount: "Montant taxe",
  tax_rate: "Taxe (%)",
  total_amount: "Total TTC",
  total_credit: "Total crédit",
  total_debit: "Total débit",
  type: "Type",
};

const valueLabels = {
  active: "Actif",
  approved: "Approuvé",
  asset: "Actif",
  bank: "Banque",
  cancelled: "Annulé",
  cash: "Caisse",
  completed: "Terminé",
  draft: "Brouillon",
  equity: "Capitaux propres",
  expense: "Charge",
  general: "OD",
  income: "Produit",
  liability: "Passif",
  mobile_money: "Mobile Money",
  other: "Autre",
  paid: "Payé",
  pending: "En attente",
  purchase: "Achats",
  rejected: "Rejeté",
  sale: "Ventes",
  stock: "Stock",
  unpaid: "Non payé",
  validated: "Validé",
};

function labelFor(column) {
  return columnLabels[column] ?? column;
}

function valueFor(value) {
  if (value === true) return "Oui";
  if (value === false) return "Non";
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return valueLabels[normalized] ?? value;
  }
  return String(value);
}

export function Panel({ title, description, action, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      {(title || action) && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {title && <h3 className="text-base font-bold text-slate-950">{title}</h3>}
            {description && <p className="mt-1 text-sm font-medium text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <span className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <strong className="mt-2 block break-words text-xl font-black tabular-nums leading-tight text-slate-950">{value}</strong>
    </div>
  );
}

export function Input({ label, value, onChange, type = "text", required = false }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-bold text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <input
        required={required}
        type={type}
        step={type === "number" ? "0.01" : undefined}
        className="form-control"
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function Select({ label, value, onChange, options, required = false }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-bold text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <select
        required={required}
        className="form-control"
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Submit() {
  return (
    <button type="submit" className="lte-btn lte-btn-primary">
      <Plus size={16} /> Enregistrer
    </button>
  );
}

export function SimpleRows({ title, rows, columns, description }) {
  return (
    <Panel
      title={title}
      description={description ?? `${rows.length.toLocaleString("fr-FR")} ligne(s) affichée(s)`}
    >
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <table className="lte-table min-w-[760px]">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{labelFor(column)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td key={column}>{valueFor(row[column])}</td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-sm font-semibold text-slate-500"
                >
                  Aucune donnée disponible.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function SimpleTable({ columns, rows }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100">
      <table className="lte-table">
        <thead>
          <tr>
            {columns.map(([key, label]) => (
              <th key={key}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || row.menu_item_id || row.category || index}>
              {columns.map(([key, , fmt]) => (
                <td key={key}>
                  {fmt ? fmt(row[key]) : valueFor(row[key])}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center text-sm font-semibold text-slate-500"
              >
                Aucune donnée disponible.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
