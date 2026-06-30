import { Plus } from "lucide-react";

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
  const hasEmptyOption = options.some(([optionValue]) => optionValue === "");
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
        {required && !hasEmptyOption && (
          <option value="" disabled>
            Sélectionner
          </option>
        )}
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue || "empty"} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Submit({ label }) {
  return (
    <button type="submit" className="lte-btn lte-btn-primary">
      <Plus size={16} />
      {label}
    </button>
  );
}

export function Table({ columns, rows }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100">
      <table className="lte-table min-w-[760px]">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td
                className="px-3 py-8 text-center text-sm font-semibold text-slate-500"
                colSpan={columns.length}
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

export function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <span className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <strong className="mt-1 block text-lg text-slate-950">{value}</strong>
    </div>
  );
}
