import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { AdminFormModal, ModuleFilterBar, PageHeader } from "@/modules/admin/components/AdminUi";
import { matchesPeriod } from "@/utils/greeting";
import { nextSort, SortButton, sortRows } from "@/utils/sort";
import { validationFor } from "@/utils/validation";
import { apiFetch } from "@/config/http";

const STAFF_FALLBACK = "Action utilisateur impossible.";

function staffApi(path, options = {}) {
  const { fallback = STAFF_FALLBACK, ...rest } = options;
  return apiFetch(path, { fallback, ...rest });
}

const STAFF_ROLES = ["MANAGER", "SERVEUR", "CUISINE", "CAISSE", "STOCK", "COMPTABLE"];

const emptyForm = {
  first_name: "",
  last_name: "",
  email: "",
  username: "",
  password: "",
  phone: "",
  role: "SERVEUR",
  branch_id: "",
  quartier: "",
  responsible_id: "",
};

const roleLabels = {
  MANAGER: "Manager",
  SERVEUR: "Serveur / Serveuse",
  CUISINE: "Cuisine",
  CAISSE: "Caisse",
  STOCK: "Gestionnaire stock",
  COMPTABLE: "Comptable",
};

export function StaffPermissionsAdmin({ currentUser, onMessage }) {
  const [users, setUsers] = useState([]);
  const [permissionGroups, setPermissionGroups] = useState([]);
  const [rolePresets, setRolePresets] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [panelMode, setPanelMode] = useState(null);
  const [draftPermissions, setDraftPermissions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(null);
  const [passwordForm, setPasswordForm] = useState("");
  const [formPermissions, setFormPermissions] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [branchFilter, setBranchFilter] = useState("");
  const [period, setPeriod] = useState("all");
  const [customPeriod, setCustomPeriod] = useState({ start: "", end: "" });
  const [sort, setSort] = useState({ key: "created_at", direction: "desc" });
  const [isLoading, setIsLoading] = useState(false);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [users, selectedUserId]
  );

  const panelOpen = Boolean(selectedUser && panelMode);

  const selectedRoleDefaults = useMemo(
    () => new Set(rolePresets.find((preset) => preset.role === (editForm?.role ?? selectedUser?.role))?.permissions ?? []),
    [editForm?.role, rolePresets, selectedUser?.role]
  );

  const formRoleDefaults = useMemo(
    () => rolePresets.find((preset) => preset.role === form.role)?.permissions ?? [],
    [rolePresets, form.role]
  );

  const responsibleOptions = useMemo(
    () => users.filter((user) => user.is_active),
    [users]
  );

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = users.filter((user) => {
      const matchesSearch =
        !query ||
        `${user.first_name} ${user.last_name}`.toLowerCase().includes(query) ||
        (user.email ?? "").toLowerCase().includes(query) ||
        user.username.toLowerCase().includes(query) ||
        (user.quartier ?? "").toLowerCase().includes(query);
      const matchesRole = roleFilter === "ALL" || user.role === roleFilter;
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && user.is_active) ||
        (statusFilter === "INACTIVE" && !user.is_active);
      const matchesBranch = !branchFilter || user.branch_id === branchFilter;
      const matchesDate = matchesPeriod(user.created_at, period, customPeriod);
      return matchesSearch && matchesRole && matchesStatus && matchesBranch && matchesDate;
    });
    return sortRows(rows, sort, {
      name: (user) => `${user.first_name} ${user.last_name}`,
      username: (user) => user.username,
      email: (user) => user.email ?? "",
      role: (user) => roleLabels[user.role] ?? user.role,
      branch: (user) => branches.find((branch) => branch.id === user.branch_id)?.name ?? "",
      status: (user) => Number(user.is_active),
      created_at: (user) => user.created_at,
    });
  }, [branchFilter, branches, customPeriod, period, roleFilter, search, sort, statusFilter, users]);

  useEffect(() => {
    loadAccessData();
  }, []);

  useEffect(() => {
    if (!selectedUser) {
      setDraftPermissions([]);
      setEditForm(null);
      return;
    }
    setDraftPermissions(selectedUser.permissions ?? []);
    setEditForm({
      first_name: selectedUser.first_name ?? "",
      last_name: selectedUser.last_name ?? "",
      email: selectedUser.email ?? "",
      username: selectedUser.username ?? "",
      phone: selectedUser.phone ?? "",
      role: selectedUser.role ?? "SERVEUR",
      branch_id: selectedUser.branch_id ?? "",
      quartier: selectedUser.quartier ?? "",
      responsible_id: selectedUser.responsible_id ?? "",
    });
    setPasswordForm("");
  }, [selectedUser?.id]);

  useEffect(() => {
    setFormPermissions(formRoleDefaults);
  }, [form.role, formRoleDefaults]);

  async function loadAccessData() {
    setIsLoading(true);
    try {
      const [usersData, groupsData, presetsData, branchesData] = await Promise.all([
        staffApi("/api/v1/users"),
        staffApi("/api/v1/permissions/groups"),
        staffApi("/api/v1/permissions/role-presets"),
        staffApi("/api/v1/branches").catch(() => []),
      ]);
      setUsers(usersData);
      setPermissionGroups(groupsData);
      setRolePresets(presetsData);
      setBranches(branchesData);
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  function updateFormField(event) {
    const { name } = event.target;
    let { value } = event.target;
    if (name === "username") value = value.trim().replace(/\s+/g, "").toLowerCase();
    if (name === "email") value = value.trim().toLowerCase();
    if (name === "phone") value = value.replace(/[^\d+ ()-]/g, "");
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateEditField(event) {
    const { name } = event.target;
    let { value } = event.target;
    if (name === "username") value = value.trim().replace(/\s+/g, "").toLowerCase();
    if (name === "email") value = value.trim().toLowerCase();
    if (name === "phone") value = value.replace(/[^\d+ ()-]/g, "");
    setEditForm((current) => ({ ...current, [name]: value }));
  }

  function togglePermission(permission, target, setter, locked = false) {
    if (locked) return;
    setter((current) => {
      if (current.includes(permission)) {
        return current.filter((item) => item !== permission);
      }
      return [...current, permission];
    });
  }

  function openUserPanel(user, mode) {
    setSelectedUserId(user.id);
    setPanelMode(mode);
  }

  function closeUserPanel() {
    setSelectedUserId("");
    setPanelMode(null);
  }

  async function createUser(event) {
    event.preventDefault();
    setIsLoading(true);
    try {
      const payload = {
        ...form,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        branch_id: form.branch_id || null,
        quartier: form.quartier.trim() || null,
        responsible_id: form.responsible_id || null,
        permissions: formPermissions,
      };
      const created = await staffApi("/api/v1/users", {
        method: "POST",
        body: payload,
      });
      setUsers((current) => [created, ...current]);
      setForm(emptyForm);
      setShowCreateForm(false);
      openUserPanel(created, "detail");
      onMessage(`Utilisateur ${created.first_name} ${created.last_name} créé avec ses accès.`);
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function saveSelectedPermissions() {
    if (!selectedUser) return;
    setIsLoading(true);
    try {
      const updated = await staffApi(`/api/v1/users/${selectedUser.id}/permissions`, {
        method: "PUT",
        body: { permissions: draftPermissions },
      });
      setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)));
      onMessage("Permissions mises à jour.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function saveSelectedUser(event) {
    event.preventDefault();
    if (!selectedUser || !editForm) return;
    setIsLoading(true);
    try {
      const updated = await staffApi(`/api/v1/users/${selectedUser.id}`, {
        method: "PATCH",
        body: {
          first_name: editForm.first_name.trim(),
          last_name: editForm.last_name.trim(),
          username: editForm.username.trim(),
          role: editForm.role,
          email: editForm.email.trim() || null,
          phone: editForm.phone.trim() || null,
          branch_id: editForm.branch_id || null,
          quartier: editForm.quartier.trim() || null,
          responsible_id: editForm.responsible_id || null,
        },
      });
      setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)));
      setPanelMode("detail");
      onMessage(`Informations de ${updated.first_name} ${updated.last_name} enregistrées.`);
    } catch (error) {
      onMessage(error.message || "Impossible de modifier cet utilisateur.");
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleStatus(user) {
    setIsLoading(true);
    try {
      const updated = await staffApi(`/api/v1/users/${user.id}/status`, {
        method: "PATCH",
        body: { is_active: !user.is_active },
      });
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      onMessage(updated.is_active ? "Compte activé." : "Compte désactivé.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function resetSelectedPassword(event) {
    event.preventDefault();
    if (!selectedUser) return;
    setIsLoading(true);
    try {
      const updated = await staffApi(`/api/v1/users/${selectedUser.id}/password`, {
        method: "PATCH",
        body: { password: passwordForm },
      });
      setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)));
      setPasswordForm("");
      onMessage(`Mot de passe de ${updated.first_name} ${updated.last_name} réinitialisé.`);
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteUser(user) {
    if (
      !window.confirm(
        `Archiver l'utilisateur ${user.first_name} ${user.last_name} ?\n\nLe compte restera en base de données et pourra être restauré.`
      )
    ) {
      return;
    }
    setIsLoading(true);
    try {
      await staffApi(`/api/v1/users/${user.id}`, { method: "DELETE" });
      setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, is_active: false } : item)));
      onMessage("Utilisateur archivé. Il peut être restauré depuis cette liste.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Utilisateurs & permissions"
        subtitle="Créez les comptes, consultez le détail et modifiez les accès depuis la liste du personnel."
        primaryAction={
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="lte-btn lte-btn-primary"
          >
            <DashboardIcon name="UserPlus" size={17} />
            Ajouter un utilisateur
          </button>
        }
      />

      <AdminFormModal
        open={showCreateForm}
        onClose={() => {
          setShowCreateForm(false);
          setForm(emptyForm);
        }}
        title="Créer un compte"
        description="Ajoutez un membre du personnel avec son rôle, sa branche et son responsable."
        size="xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setForm(emptyForm);
              }}
              disabled={isLoading}
              className="lte-btn lte-btn-default"
            >
              Annuler
            </button>
            <button type="submit" form="create-user-form" disabled={isLoading} className="lte-btn lte-btn-primary">
              <DashboardIcon name="Plus" size={17} />
              Créer l'utilisateur
            </button>
          </>
        }
      >
        <form id="create-user-form" onSubmit={createUser} className="grid gap-4 md:grid-cols-2">
          <Field name="first_name" label="Prénom" value={form.first_name} onChange={updateFormField} required />
          <Field name="last_name" label="Nom" value={form.last_name} onChange={updateFormField} required />
          <Field name="email" label="Email" type="email" value={form.email} onChange={updateFormField} />
          <Field name="username" label="Nom utilisateur" value={form.username} onChange={updateFormField} required />
          <Field name="password" label="Mot de passe" type="password" value={form.password} onChange={updateFormField} autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-form-type="other" required />
          <Field name="phone" label="Téléphone" value={form.phone} onChange={updateFormField} />
          <Select name="role" label="Rôle" value={form.role} onChange={updateFormField} required>
            {STAFF_ROLES.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </Select>
          <Select name="branch_id" label="Branche" value={form.branch_id} onChange={updateFormField}>
            <option value="">Toutes les branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
          <Field name="quartier" label="Quartier" value={form.quartier} onChange={updateFormField} placeholder="Ex: Akwa, Bonapriso..." />
          <Select name="responsible_id" label="Responsable" value={form.responsible_id} onChange={updateFormField}>
            <option value="">Aucun responsable</option>
            {responsibleOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.first_name} {user.last_name} ({roleLabels[user.role] ?? user.role})
              </option>
            ))}
          </Select>
        </form>
      </AdminFormModal>

      <div className="space-y-6">
        <ModuleFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Rechercher par nom, email, identifiant ou quartier..."
          period={period}
          onPeriodChange={setPeriod}
          customPeriod={customPeriod}
          onCustomPeriodChange={setCustomPeriod}
          branchId={branchFilter}
          onBranchChange={setBranchFilter}
          branches={branches}
        >
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="form-control h-10 w-44"
          >
            <option value="ALL">Tous les rôles</option>
            {STAFF_ROLES.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="form-control h-10 w-44"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="ACTIVE">Actifs</option>
            <option value="INACTIVE">Archivés / désactivés</option>
          </select>
        </ModuleFilterBar>

        <div className={`grid gap-6 ${panelOpen ? "xl:grid-cols-[minmax(0,1fr)_minmax(380px,440px)]" : ""}`}>
          <div className="border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-black text-[var(--dashboard-secondary)]">Personnel</h2>
              <p className="text-sm font-medium text-slate-500">{filteredUsers.length} compte(s) affiché(s)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="lte-table min-w-[760px]">
                <thead>
                  <tr>
                    <th className="px-5 py-4">
                      <SortButton label="Nom" column="name" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} />
                    </th>
                    <th className="px-5 py-4">
                      <SortButton label="Identifiant" column="username" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} />
                    </th>
                    <th className="px-5 py-4">
                      <SortButton label="Rôle" column="role" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} />
                    </th>
                    <th className="px-5 py-4">
                      <SortButton label="Branche" column="branch" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} />
                    </th>
                    <th className="px-5 py-4">
                      <SortButton label="Statut" column="status" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} />
                    </th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className={`transition-all hover:bg-slate-50 ${
                        selectedUser?.id === user.id ? "bg-[#fff4ed]" : ""
                      }`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-slate-700">
                            {user.first_name?.[0]}
                            {user.last_name?.[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="font-black text-[var(--dashboard-secondary)]">
                              {user.first_name} {user.last_name}
                            </p>
                            <p className="text-xs font-semibold text-slate-400">
                              {user.email || "Email non renseigné"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-slate-700">{user.username}</td>
                      <td className="px-5 py-4 text-sm font-black text-[var(--dashboard-primary)]">{roleLabels[user.role] ?? user.role}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-500">
                        {branches.find((branch) => branch.id === user.branch_id)?.name ?? "Toutes"}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-3 py-1 text-xs font-black ${user.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {user.is_active ? "Actif" : "Archivé"}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openUserPanel(user, "detail")}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 transition-all hover:border-[var(--dashboard-primary)] hover:text-[var(--dashboard-primary)]"
                            title="Voir le détail"
                          >
                            <DashboardIcon name="Eye" size={15} />
                            Détail
                          </button>
                          <button
                            type="button"
                            onClick={() => openUserPanel(user, "edit")}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 transition-all hover:border-[var(--dashboard-primary)] hover:text-[var(--dashboard-primary)]"
                            title="Modifier"
                          >
                            <DashboardIcon name="Pencil" size={15} />
                            Modifier
                          </button>
                          {user.is_active ? (
                            <button
                              type="button"
                              onClick={() => deleteUser(user)}
                              disabled={user.id === currentUser.id || isLoading}
                              className="lte-btn lte-btn-danger lte-btn-sm"
                              title="Archiver"
                            >
                              <DashboardIcon name="Archive" size={16} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleStatus(user)}
                              disabled={isLoading}
                              className="inline-flex h-9 w-9 items-center justify-center border border-emerald-100 text-emerald-700 transition-all hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                              title="Restaurer"
                            >
                              <DashboardIcon name="RotateCcw" size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!filteredUsers.length && (
                <div className="px-5 py-16 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center bg-[#fff4ed] text-[var(--dashboard-primary)]">
                    <DashboardIcon name="Users" size={23} />
                  </div>
                  <p className="mt-4 text-lg font-black text-[var(--dashboard-secondary)]">Aucun utilisateur trouvé</p>
                  <p className="mt-1 text-sm font-medium text-slate-500">Modifiez les filtres ou créez un compte.</p>
                </div>
              )}
            </div>
          </div>

          {panelOpen && selectedUser && (
            <div className="border border-slate-200 bg-white shadow-sm xl:sticky xl:top-4 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <p className="text-xs font-black uppercase text-[var(--dashboard-primary)]">
                    {panelMode === "detail" ? "Détail utilisateur" : "Modification utilisateur"}
                  </p>
                  <h2 className="mt-1 text-xl font-black text-[var(--dashboard-secondary)]">
                    {selectedUser.first_name} {selectedUser.last_name}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeUserPanel}
                  className="lte-tool-btn"
                  title="Fermer le panneau"
                >
                  <DashboardIcon name="X" size={16} />
                </button>
              </div>

              {panelMode === "detail" ? (
                <UserDetailPanel
                  user={selectedUser}
                  branches={branches}
                  roleLabels={roleLabels}
                  permissionGroups={permissionGroups}
                  rolePresets={rolePresets}
                  currentUser={currentUser}
                  isLoading={isLoading}
                  onEdit={() => setPanelMode("edit")}
                  onToggleStatus={() => toggleStatus(selectedUser)}
                  onArchive={() => deleteUser(selectedUser)}
                />
              ) : (
                <UserEditPanel
                  selectedUser={selectedUser}
                  editForm={editForm}
                  passwordForm={passwordForm}
                  branches={branches}
                  responsibleOptions={responsibleOptions}
                  permissionGroups={permissionGroups}
                  draftPermissions={draftPermissions}
                  selectedRoleDefaults={selectedRoleDefaults}
                  roleLabels={roleLabels}
                  staffRoles={STAFF_ROLES}
                  currentUser={currentUser}
                  isLoading={isLoading}
                  onEditField={updateEditField}
                  onPasswordChange={setPasswordForm}
                  onTogglePermission={(permission, locked) =>
                    togglePermission(permission, draftPermissions, setDraftPermissions, locked)
                  }
                  onSaveUser={saveSelectedUser}
                  onResetPassword={resetSelectedPassword}
                  onSavePermissions={saveSelectedPermissions}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value || "—"}</p>
    </div>
  );
}

function UserDetailPanel({
  user,
  branches,
  roleLabels,
  permissionGroups,
  rolePresets,
  currentUser,
  isLoading,
  onEdit,
  onToggleStatus,
  onArchive,
}) {
  const branchName = branches.find((branch) => branch.id === user.branch_id)?.name ?? "Toutes les branches";
  const roleDefaults = new Set(rolePresets.find((preset) => preset.role === user.role)?.permissions ?? []);
  const permissionLabels = new Map(
    permissionGroups.flatMap((group) => group.permissions.map((permission) => [permission.key, permission.label]))
  );

  return (
    <div className="space-y-5 p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <DetailRow label="Rôle" value={roleLabels[user.role] ?? user.role} />
        <DetailRow label="Statut" value={user.is_active ? "Actif" : "Archivé"} />
        <DetailRow label="Identifiant" value={user.username} />
        <DetailRow label="Email" value={user.email} />
        <DetailRow label="Téléphone" value={user.phone} />
        <DetailRow label="Branche" value={branchName} />
        <DetailRow label="Quartier" value={user.quartier} />
        <DetailRow label="Responsable" value={user.responsible_name} />
        <DetailRow label="Créé le" value={new Date(user.created_at).toLocaleDateString("fr-FR")} />
      </div>

      <div>
        <h3 className="text-sm font-black uppercase text-[var(--dashboard-secondary)]">Permissions</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {(user.permissions ?? []).map((permission) => (
            <span
              key={permission}
              className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                roleDefaults.has(permission) ? "bg-slate-100 text-slate-600" : "bg-[#fff4ed] text-[var(--dashboard-primary)]"
              }`}
            >
              {permissionLabels.get(permission) ?? permission}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
        <button type="button" onClick={onEdit} className="lte-btn lte-btn-primary">
          <DashboardIcon name="Pencil" size={15} />
          Modifier
        </button>
        <button
          type="button"
          onClick={onToggleStatus}
          disabled={user.id === currentUser.id || isLoading}
          className="lte-btn lte-btn-default"
        >
          <DashboardIcon name="Power" size={15} />
          {user.is_active ? "Désactiver" : "Restaurer"}
        </button>
        {user.is_active && (
          <button
            type="button"
            onClick={onArchive}
            disabled={user.id === currentUser.id || isLoading}
            className="lte-btn lte-btn-danger lte-btn-sm"
          >
            <DashboardIcon name="Archive" size={15} />
            Archiver
          </button>
        )}
      </div>
    </div>
  );
}

function UserEditPanel({
  selectedUser,
  editForm,
  passwordForm,
  branches,
  responsibleOptions,
  permissionGroups,
  draftPermissions,
  selectedRoleDefaults,
  roleLabels,
  staffRoles,
  currentUser,
  isLoading,
  onEditField,
  onPasswordChange,
  onTogglePermission,
  onSaveUser,
  onResetPassword,
  onSavePermissions,
}) {
  return (
    <div className="space-y-6 p-5">
      <form onSubmit={onSaveUser} className="border-b border-slate-200 pb-6">
        <h3 className="text-sm font-black uppercase text-[var(--dashboard-secondary)]">Informations du personnel</h3>
        <div className="mt-4 grid gap-4">
          <Field name="first_name" label="Prénom" value={editForm?.first_name ?? ""} onChange={onEditField} required />
          <Field name="last_name" label="Nom" value={editForm?.last_name ?? ""} onChange={onEditField} required />
          <Field name="email" label="Email" type="email" value={editForm?.email ?? ""} onChange={onEditField} />
          <Field name="username" label="Nom utilisateur" value={editForm?.username ?? ""} onChange={onEditField} required />
          <Field name="phone" label="Téléphone" value={editForm?.phone ?? ""} onChange={onEditField} />
          <Select name="role" label="Rôle" value={editForm?.role ?? "SERVEUR"} onChange={onEditField}>
            {staffRoles.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </Select>
          <Select name="branch_id" label="Branche" value={editForm?.branch_id ?? ""} onChange={onEditField}>
            <option value="">Toutes les branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
          <Field name="quartier" label="Quartier" value={editForm?.quartier ?? ""} onChange={onEditField} placeholder="Ex: Akwa, Bonapriso..." />
          <Select name="responsible_id" label="Responsable" value={editForm?.responsible_id ?? ""} onChange={onEditField}>
            <option value="">Aucun responsable</option>
            {responsibleOptions.filter((user) => user.id !== selectedUser?.id).map((user) => (
              <option key={user.id} value={user.id}>
                {user.first_name} {user.last_name} ({roleLabels[user.role] ?? user.role})
              </option>
            ))}
          </Select>
        </div>
        <button type="submit" disabled={isLoading} className="mt-5 lte-btn lte-btn-primary">
          <DashboardIcon name="Pencil" size={15} />
          Enregistrer les informations
        </button>
      </form>

      <form onSubmit={onResetPassword} className="border-b border-slate-200 pb-6">
        <h3 className="text-sm font-black uppercase text-[var(--dashboard-secondary)]">Réinitialisation du mot de passe</h3>
        <p className="mt-2 text-sm font-medium text-slate-500">
          Définissez un nouveau mot de passe pour ce membre du personnel.
        </p>
        <div className="mt-4 space-y-3">
          <Field
            name="new_password"
            label="Nouveau mot de passe"
            type="password"
            value={passwordForm}
            onChange={(event) => onPasswordChange(event.target.value)}
            minLength={8}
            autoComplete="new-password"
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            required
          />
          <button
            type="submit"
            disabled={isLoading || selectedUser.id === currentUser.id}
            className="lte-btn lte-btn-default"
          >
            <DashboardIcon name="KeyRound" size={15} />
            Réinitialiser
          </button>
        </div>
      </form>

      <div>
        <h3 className="text-sm font-black uppercase text-[var(--dashboard-secondary)]">Permissions utilisateur</h3>
        <p className="mt-2 text-xs font-semibold text-slate-500">
          Les permissions marquées « Rôle » sont incluses automatiquement.
        </p>
        <PermissionMatrix
          className="mt-4"
          title=""
          groups={permissionGroups}
          selected={draftPermissions}
          lockedPermissions={selectedRoleDefaults}
          onToggle={onTogglePermission}
        />
        <button
          type="button"
          onClick={onSavePermissions}
          disabled={isLoading}
          className="mt-5 lte-btn lte-btn-primary"
        >
          <DashboardIcon name="ShieldCheck" size={15} />
          Enregistrer les permissions
        </button>
      </div>
    </div>
  );
}

function RequiredLabel({ children, required }) {
  return (
    <span className="text-xs font-black text-[var(--dashboard-secondary)]">
      {children} {required && <span className="text-red-500">*</span>}
    </span>
  );
}

function Field({ label, required, ...props }) {
  const isPassword = props.type === "password";
  const [showPassword, setShowPassword] = useState(false);
  const inputType = isPassword && showPassword ? "text" : props.type;
  return (
    <label className="block">
      <RequiredLabel required={required}>{label}</RequiredLabel>
      <div className="relative mt-2">
        <input
          {...props}
          {...validationFor(props.name)}
          type={inputType}
          required={required}
          autoComplete={props.autoComplete ?? (isPassword ? "new-password" : undefined)}
          autoCorrect={isPassword ? "off" : props.autoCorrect}
          autoCapitalize={isPassword ? "none" : props.autoCapitalize}
          spellCheck={isPassword ? false : props.spellCheck}
          className={`form-control ${isPassword ? "pr-12" : ""}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-[var(--dashboard-primary)]"
          >
            <DashboardIcon name={showPassword ? "EyeOff" : "Eye"} size={17} />
          </button>
        )}
      </div>
    </label>
  );
}

function Select({ label, required, children, ...props }) {
  return (
    <label className="block">
      <RequiredLabel required={required}>{label}</RequiredLabel>
      <select
        {...props}
        required={required}
        className="mt-2 form-control"
      >
        {children}
      </select>
    </label>
  );
}

function PermissionMatrix({ className = "", title, groups, selected, lockedPermissions, onToggle }) {
  const selectedSet = new Set(selected);

  return (
    <div className={className}>
      <h3 className="text-sm font-black uppercase text-[var(--dashboard-secondary)]">{title}</h3>
      <div className="mt-4 grid gap-4">
        {groups.map((group) => (
          <div key={group.key} className="border border-slate-200 bg-white p-4">
            <div className="mb-3">
              <p className="text-sm font-black text-[var(--dashboard-secondary)]">{group.label}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{group.description}</p>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {group.permissions.map((permission) => {
                const isLocked = lockedPermissions.has(permission.key);
                const isChecked = selectedSet.has(permission.key) || isLocked;
                return (
                  <label
                    key={permission.key}
                    className={`flex min-h-12 cursor-pointer items-start gap-3 border px-3 py-2 text-sm transition-all ${
                      isChecked ? "border-[var(--dashboard-primary)]/30 bg-[#fff4ed]" : "border-slate-200 bg-white hover:bg-slate-50"
                    } ${isLocked ? "cursor-not-allowed opacity-90" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isLocked}
                      onChange={() => onToggle(permission.key, isLocked)}
                      className="mt-1 accent-[var(--dashboard-primary)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-slate-800">{permission.label}</span>
                      <span className="block truncate text-xs font-medium text-slate-400">{permission.key}</span>
                    </span>
                    {isLocked && (
                      <span className="rounded bg-white px-2 py-1 text-[10px] font-black uppercase text-[var(--dashboard-primary)]">
                        Rôle
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
