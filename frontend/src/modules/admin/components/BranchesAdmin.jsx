import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { AdminFormModal, ModuleFilterBar, PageHeader, TableFooter } from "@/modules/admin/components/AdminUi";
import { matchesPeriod } from "@/utils/greeting";
import { nextSort, SortButton, sortRows } from "@/utils/sort";
import { validationFor } from "@/utils/validation";
import { apiFetch } from "@/config/http";

const BRANCHES_FALLBACK = "Action branche impossible.";

function branchesApi(path, options = {}) {
  const { fallback = BRANCHES_FALLBACK, ...rest } = options;
  return apiFetch(path, { fallback, ...rest });
}

const initialBranch = {
  name: "",
  city: "",
  address: "",
  phone: "",
  manager_id: "",
};

const MANAGER_ROLES = ["MANAGER", "ADMIN"];

export function BranchesAdmin({ onMessage, showCreateOnMount = false }) {
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState(initialBranch);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("ALL");
  const [period, setPeriod] = useState("all");
  const [customPeriod, setCustomPeriod] = useState({ start: "", end: "" });
  const [sort, setSort] = useState({ key: "created_at", direction: "desc" });
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(showCreateOnMount);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editForm, setEditForm] = useState(initialBranch);
  const [editingBranchId, setEditingBranchId] = useState("");
  const [staff, setStaff] = useState([]);

  const managerOptions = useMemo(
    () => staff.filter((user) => user.is_active && MANAGER_ROLES.includes(user.role)),
    [staff]
  );

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
      const matchesDate = matchesPeriod(branch.created_at, period, customPeriod);
      return matchesSearch && matchesCity && matchesDate;
    });
    return sortRows(rows, sort, {
      name: (branch) => branch.name,
      city: (branch) => branch.city,
      address: (branch) => branch.address,
      phone: (branch) => branch.phone ?? "",
      status: (branch) => Number(branch.is_active),
      created_at: (branch) => branch.created_at,
    });
  }, [branches, cityFilter, customPeriod, period, search, sort]);

  useEffect(() => {
    fetchBranches();
    fetchStaff();
  }, []);

  useEffect(() => {
    if (showCreateOnMount) setShowCreateForm(true);
  }, [showCreateOnMount]);

  async function fetchStaff() {
    try {
      setStaff(await branchesApi("/api/v1/users"));
    } catch {
      setStaff([]);
    }
  }

  async function fetchBranches() {
    setIsLoading(true);
    try {
      setBranches(await branchesApi("/api/v1/branches"));
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

  function updateEditField(event) {
    const { name, value } = event.target;
    setEditForm((current) => ({ ...current, [name]: value }));
  }

  function closeCreateForm() {
    setShowCreateForm(false);
    setForm(initialBranch);
  }

  function openEditForm(branch) {
    setEditingBranchId(branch.id);
    setEditForm({
      name: branch.name ?? "",
      city: branch.city ?? "",
      address: branch.address ?? "",
      phone: branch.phone ?? "",
      manager_id: branch.manager_id ?? "",
    });
    setShowEditForm(true);
  }

  function closeEditForm() {
    setShowEditForm(false);
    setEditingBranchId("");
    setEditForm(initialBranch);
  }

  async function updateBranch(event) {
    event.preventDefault();
    if (!editingBranchId) return;
    setIsLoading(true);
    try {
      const updated = await branchesApi(`/api/v1/branches/detail/${editingBranchId}`, {
        method: "PATCH",
        body: {
          name: editForm.name.trim(),
          city: editForm.city.trim(),
          address: editForm.address.trim(),
          phone: editForm.phone.trim() || null,
          manager_id: editForm.manager_id || null,
        },
      });
      setBranches((current) => current.map((branch) => (branch.id === updated.id ? updated : branch)));
      closeEditForm();
      onMessage(`Branche "${updated.name}" mise à jour.`);
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function deactivateBranch(branch) {
    if (!window.confirm(`Désactiver la branche "${branch.name}" ?`)) return;
    setIsLoading(true);
    try {
      const updated = await branchesApi(`/api/v1/branches/detail/${branch.id}`, {
        method: "PATCH",
        body: { is_active: false },
      });
      setBranches((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      onMessage(`Branche "${updated.name}" désactivée.`);
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function activateBranch(branch) {
    setIsLoading(true);
    try {
      const updated = await branchesApi(`/api/v1/branches/detail/${branch.id}`, {
        method: "PATCH",
        body: { is_active: true },
      });
      setBranches((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      onMessage(`Branche "${updated.name}" réactivée.`);
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function createBranch(event) {
    event.preventDefault();
    setIsLoading(true);
    try {
      const created = await branchesApi("/api/v1/branches", {
        method: "POST",
        body: {
          ...Object.fromEntries(Object.entries(form).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])),
          phone: form.phone.trim() || null,
          manager_id: form.manager_id || null,
        },
      });
      setBranches((current) => [created, ...current]);
      closeCreateForm();
      onMessage(`Branche "${created.name}" créée.`);
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Branches"
        subtitle="Gérez les points de vente, leurs coordonnées et leur statut opérationnel."
        primaryAction={
          <button type="button" onClick={() => setShowCreateForm(true)} className="lte-btn lte-btn-primary">
            <DashboardIcon name="Plus" size={17} />
            Créer une branche
          </button>
        }
      />

      <ModuleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Rechercher par nom, ville, adresse ou téléphone..."
        period={period}
        onPeriodChange={setPeriod}
        customPeriod={customPeriod}
        onCustomPeriodChange={setCustomPeriod}
        showBranch={false}
      >
        <select
          value={cityFilter}
          onChange={(event) => setCityFilter(event.target.value)}
          className="form-control h-10 w-48"
        >
          <option value="ALL">Toutes les villes</option>
          {cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
      </ModuleFilterBar>

      <AdminFormModal
        open={showCreateForm}
        onClose={closeCreateForm}
        title="Créer une branche"
        description="Ajoutez un point de vente avec son adresse, son contact et son responsable."
        size="lg"
        footer={
          <>
            <button type="button" onClick={closeCreateForm} disabled={isLoading} className="lte-btn lte-btn-default">
              Annuler
            </button>
            <button type="submit" form="create-branch-form" disabled={isLoading} className="lte-btn lte-btn-primary">
              <DashboardIcon name="MapPin" size={17} />
              Créer la branche
            </button>
          </>
        }
      >
        <form id="create-branch-form" onSubmit={createBranch} className="grid gap-4 md:grid-cols-2">
          <Field name="name" label="Nom de la branche" value={form.name} onChange={updateField} required />
          <Field name="city" label="Ville" value={form.city} onChange={updateField} required />
          <Field name="address" label="Adresse complète" value={form.address} onChange={updateField} required className="md:col-span-2" />
          <Field name="phone" label="Téléphone" value={form.phone} onChange={updateField} />
          <SelectField name="manager_id" label="Responsable de la branche" value={form.manager_id} onChange={updateField}>
            <option value="">Sélectionner un responsable</option>
            {managerOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.first_name} {user.last_name}
              </option>
            ))}
          </SelectField>
        </form>
      </AdminFormModal>

      <AdminFormModal
        open={showEditForm}
        onClose={closeEditForm}
        title="Modifier la branche"
        description="Mettez à jour les informations du point de vente."
        size="lg"
        footer={
          <>
            <button type="button" onClick={closeEditForm} disabled={isLoading} className="lte-btn lte-btn-default">
              Annuler
            </button>
            <button type="submit" form="edit-branch-form" disabled={isLoading} className="lte-btn lte-btn-primary">
              Enregistrer
            </button>
          </>
        }
      >
        <form id="edit-branch-form" onSubmit={updateBranch} className="grid gap-4 md:grid-cols-2">
          <Field name="name" label="Nom de la branche" value={editForm.name} onChange={updateEditField} required />
          <Field name="city" label="Ville" value={editForm.city} onChange={updateEditField} required />
          <Field name="address" label="Adresse complète" value={editForm.address} onChange={updateEditField} required className="md:col-span-2" />
          <Field name="phone" label="Téléphone" value={editForm.phone} onChange={updateEditField} />
          <SelectField name="manager_id" label="Responsable de la branche" value={editForm.manager_id} onChange={updateEditField}>
            <option value="">Sélectionner un responsable</option>
            {managerOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.first_name} {user.last_name}
              </option>
            ))}
          </SelectField>
        </form>
      </AdminFormModal>

      <div className="border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="lte-table min-w-[900px]">
            <thead>
              <tr>
                <th><SortButton label="Branche" column="name" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
                <th><SortButton label="Ville" column="city" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
                <th><SortButton label="Adresse" column="address" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
                <th><SortButton label="Téléphone" column="phone" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
                <th>Responsable</th>
                <th>Utilisateurs</th>
                <th>Caisses</th>
                <th><SortButton label="Statut" column="status" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
                <th className="text-right">Actions</th>
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
                  <td className="px-5 py-4 text-sm font-semibold text-slate-500">{branch.manager_name ?? "-"}</td>
                  <td className="px-5 py-4 text-sm font-black text-slate-700">{branch.users_count ?? 0}</td>
                  <td className="px-5 py-4 text-sm font-black text-slate-700">{branch.cash_registers_count ?? 0}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded px-3 py-1 text-xs font-black ${branch.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {branch.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditForm(branch)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:border-[var(--dashboard-primary)] hover:text-[var(--dashboard-primary)]"
                      >
                        <DashboardIcon name="Pencil" size={15} />
                        Modifier
                      </button>
                      {branch.is_active ? (
                        <button
                          type="button"
                          onClick={() => deactivateBranch(branch)}
                          disabled={isLoading}
                          className="lte-btn lte-btn-danger lte-btn-sm"
                        >
                          <DashboardIcon name="Power" size={15} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => activateBranch(branch)}
                          disabled={isLoading}
                          className="lte-btn lte-btn-default lte-btn-sm"
                        >
                          <DashboardIcon name="RotateCcw" size={15} />
                        </button>
                      )}
                    </div>
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

function SelectField({ label, required, className = "", children, ...props }) {
  return (
    <label className={`lte-form-group ${className}`}>
      <span className="lte-label">
        {label} {required && <span className="req">*</span>}
      </span>
      <select {...props} required={required} className="form-control">
        {children}
      </select>
    </label>
  );
}
