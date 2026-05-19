export function compareValues(left, right) {
  if (left == null && right == null) return 0;
  if (left == null) return -1;
  if (right == null) return 1;

  const leftDate = Date.parse(left);
  const rightDate = Date.parse(right);
  if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate)) {
    return leftDate - rightDate;
  }

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right), "fr", {
    numeric: true,
    sensitivity: "base",
  });
}

export function sortRows(rows, sort, getters) {
  if (!sort?.key || !getters[sort.key]) return rows;
  const direction = sort.direction === "desc" ? -1 : 1;
  return [...rows].sort((left, right) => direction * compareValues(getters[sort.key](left), getters[sort.key](right)));
}

export function nextSort(current, key) {
  if (current?.key !== key) return { key, direction: "asc" };
  return { key, direction: current.direction === "asc" ? "desc" : "asc" };
}

export function SortButton({ label, column, sort, onSort, className = "" }) {
  const active = sort?.key === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`inline-flex items-center gap-1 text-left uppercase ${className}`}
    >
      {label}
      <span className={`text-[10px] ${active ? "text-[#f04438]" : "text-slate-300"}`}>
        {active ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );
}
