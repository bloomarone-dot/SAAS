import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { TableFooter } from "@/modules/admin/components/AdminUi";
import { nextSort, SortButton, sortRows } from "@/utils/sort";
import { validationFor } from "@/utils/validation";
import { formatApiError } from "@/utils/network";

const initialBranch = {
  name: "",
  city: "",
  address: "",
  phone: "",
};

export function BranchesAdmin({ apiBaseUrl, onMessage, focusCreate = false }) {
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState(initialBranch);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("ALL");
  const [sort, setSort] = useState({ key: "created_at", direction: "desc" });
  const [isLoading, setIsLoading] = useState(false);

  const token = localStorage.getItem("access_token");

  const cities = useMemo(
    () => [...new Set(branches.map((branch) => branch.city).filter(Boolean))].sort(),
    [branches]
  );

  const filteredBranches = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = branches.filter((branch) => {
      const matchesSearch =
        !query ||
        branch.name.toLowerCase().includes(query) ||
        branch.city.toLowerCase().includes(query) ||
        branch.address.toLowerCase().includes(query) ||
        (branch.phone ?? "").toLowerCase().includes(query);
      const matchesCity = cityFilter === "ALL" || branch.city === cityFilter;
      return matchesSearch && matchesCity;
    });
    return sortRows(rows, sort, {
      name: (branch) => branch.name,
      city: (branch) => branch.city,
      address: (branch) => branch.address,
      phone: (branch) => branch.phone ?? "",
      status: (branch) => Number(branch.is_active),
      created_at: (branch) => branch.created_at,
    });
  }, [branches, cityFilter, search, sort]);

  useEffect(() => {
    fetchBranches();
  }, []);

  async function api(path, options = {}) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(formatApiError(data.detail, "Opération impossible."));
    }
    return data;
  }

  async function fetchBranches() {
    setIsLoading(true);
    try {
      setBranches(await api("/api/v1/branches"));
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function createBranch(event) {
    event.preventDefault();
    setIsLoading(true);
    try {
      const created = await api("/api/v1/branches", {
        method: "POST",
        body: JSON.stringify({
          ...Object.fromEntries(Object.entries(form).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])),
          phone: form.phone.trim() || null,
        }),
      });
      setBranches((current) => [created, ...current]);
      setForm(initialBranch);
      onMessage(`Branche "${created.name}" créée.`);
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <h1 className="mt-2 text-4xl font-black text-[#070528]">Branches</h1>
        </div>
      </div>

      <div className={`grid gap-6 ${focusCreate ? "xl:grid-cols-1" : "xl:grid-cols-[0.8fr_1.2fr]"}`}>
        <form onSubmit={createBranch} className="border border-slate-200 bg-white p-5 shadow-sm">
          <div className="border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-2xl font-black text-[#070528]">Créer une branche</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Ajoutez un point de vente avec son adresse et son contact.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field name="name" label="Nom de la branche" value={form.name} onChange={updateField} required />
            <Field name="city" label="Ville" value={form.city} onChange={updateField} required />
            <Field name="address" label="Adresse complète" value={form.address} onChange={updateField} required className="md:col-span-2" />
            <Field name="phone" label="Téléphone" value={form.phone} onChange={updateField} />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-6 lte-btn lte-btn-primary"
          >
            <DashboardIcon name="MapPin" size={17} />
            Créer la branche
          </button>
        </form>

        {!focusCreate && <div className="border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
              <div className="flex h-10 items-center gap-2 rounded border border-slate-300 bg-white px-3 focus-within:border-[var(--dashboard-primary)]">
                <DashboardIcon name="Search" size={16} className="text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher par nom, ville, adresse ou téléphone..."
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </div>
              <select
                value={cityFilter}
                onChange={(event) => setCityFilter(event.target.value)}
                className="form-control"
              >
                <option value="ALL">Toutes les villes</option>
                {cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="lte-table min-w-[720px]">
              <thead>
                <tr>
                  <th><SortButton label="Branche" column="name" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
                  <th><SortButton label="Ville" column="city" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
                  <th><SortButton label="Adresse" column="address" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
                  <th><SortButton label="Téléphone" column="phone" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
                  <th><SortButton label="Statut" column="status" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
                </tr>
              </thead>
              <tbody>
                {filteredBranches.map((branch) => (
                  <tr key={branch.id}>
                    <td>
                      <p className="font-semibold text-[#070528]">{branch.name}</p>
                      <p className="text-xs font-semibold text-slate-400">
                        Créée le {new Date(branch.created_at).toLocaleDateString("fr-FR")}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm font-bold text-slate-700">{branch.city}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-500">{branch.address}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-500">{branch.phone ?? "-"}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex rounded bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                        {branch.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!filteredBranches.length && (
              <div className="px-5 py-16 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-[#fff4ed] text-[#f04438]">
                  <DashboardIcon name="MapPin" size={23} />
                </div>
                <p className="mt-4 text-lg font-black text-[#070528]">Aucune branche trouvée</p>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Créez votre premier point de vente ou ajustez les filtres.
                </p>
              </div>
            )}
          </div>
          {Boolean(filteredBranches.length) && <TableFooter count={filteredBranches.length} label="branche" flush={false} />}
        </div>}
      </div>
    </section>
  );
}

function Field({ label, required, className = "", ...props }) {
  return (
    <label className={`lte-form-group ${className}`}>
      <span className="lte-label">
        {label} {required && <span className="req">*</span>}
      </span>
      <input
        {...props}
        {...validationFor(props.name)}
        required={required}
        className="form-control"
      />
    </label>
  );
}
