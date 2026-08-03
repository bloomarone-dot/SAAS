import { useMemo } from "react";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function normalizeLetter(name) {
  const ch = String(name || "").trim().charAt(0);
  if (!ch) return "#";
  const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return /[A-Z]/.test(base) ? base : "#";
}

export function filterByLetter(items, letter, getName = (item) => item?.name) {
  if (!letter || letter === "ALL") return items;
  return items.filter((item) => normalizeLetter(getName(item)) === letter);
}

/**
 * Barre A–Z pour trouver vite un plat / une boisson.
 * Seules les lettres présentes dans `items` sont mises en avant.
 */
export function AlphabetFilter({ value = "ALL", onChange, items = [], getName }) {
  const available = useMemo(() => {
    const set = new Set();
    for (const item of items) {
      set.add(normalizeLetter(typeof getName === "function" ? getName(item) : item?.name));
    }
    return set;
  }, [getName, items]);

  const chipClass = (active, enabled) =>
    [
      "flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-[11px] font-black",
      active ? "bg-slate-900 text-white" : enabled ? "bg-white text-slate-700 hover:bg-slate-100" : "bg-slate-50 text-slate-300",
    ].join(" ");

  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrer par lettre">
      <button type="button" onClick={() => onChange?.("ALL")} className={chipClass(value === "ALL", true)}>
        Tous
      </button>
      {LETTERS.map((letter) => {
        const enabled = available.has(letter);
        return (
          <button
            key={letter}
            type="button"
            disabled={!enabled}
            onClick={() => onChange?.(value === letter ? "ALL" : letter)}
            className={chipClass(value === letter, enabled)}
          >
            {letter}
          </button>
        );
      })}
      {available.has("#") && (
        <button
          type="button"
          onClick={() => onChange?.(value === "#" ? "ALL" : "#")}
          className={chipClass(value === "#", true)}
          title="Autres"
        >
          #
        </button>
      )}
    </div>
  );
}
