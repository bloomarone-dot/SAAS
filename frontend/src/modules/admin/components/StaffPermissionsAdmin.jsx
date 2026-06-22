import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { nextSort, SortButton, sortRows } from "@/utils/sort";
import { validationFor } from "@/utils/validation";
import { formatApiError } from "@/utils/network";

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
};

const roleLabels = {
  MANAGER: "Manager",
  SERVEUR: "Serveur / Serveuse",
  CUISINE: "Cuisine",
  CAISSE: "Caisse",
  STOCK: "Gestionnaire stock",
  COMPTABLE: "Comptable",
};

export function StaffPermissionsAdmin({ apiBaseUrl, currentUser, onMessage, showCreateOnMount = false }) {
  const [users, setUsers] = useState([]);
  const [permissionGroups, setPermissionGroups] = useState([]);
  const [rolePresets, setRolePresets] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [draftPermissions, setDraftPermissions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(null);
  const [passwordForm, setPasswordForm] = useState("");
  const [formPermissions, setFormPermissions] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(showCreateOnMount);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sort, setSort] = useState({ key: "created_at", direction: "desc" });
  const [isLoading, setIsLoading] = useState(false);

  const token = localStorage.getItem("access_token");

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? users[0] ?? null,
    [users, selectedUserId]
  );

  const selectedRoleDefaults = useMemo(
    () => new Set(rolePresets.find((preset) => preset.role === (editForm?.role ?? selectedUser?.role))?.permissions ?? []),
    [editForm?.role, rolePresets, selectedUser?.role]
  );

  const formRoleDefaults = useMemo(
    () => rolePresets.find((preset) => preset.role === form.role)?.permissions ?? [],
    [rolePresets, form.role]
  );

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = users.filter((user) => {
      const matchesSearch =
        !query ||
        `${user.first_name} ${user.last_name}`.toLowerCase().includes(query) ||
        (user.email ?? "").toLowerCase().includes(query) ||
        user.username.toLowerCase().includes(query);
      const matchesRole = roleFilter === "ALL" || user.role === roleFilter;
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && user.is_active) ||
        (statusFilter === "INACTIVE" && !user.is_active);
      return matchesSearch && matchesRole && matchesStatus;
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
  }, [branches, roleFilter, search, sort, statusFilter, users]);

  useEffect(() => {
    loadAccessData();
  }, []);

  useEffect(() => {
    setShowCreateForm(showCreateOnMount);
  }, [showCreateOnMount]);

  useEffect(() => {
    if (!selectedUser) {
      setDraftPermissions([]);
      return;
    }
    setSelectedUserId(selectedUser.id);
    setDraftPermissions(selectedUser.permissions ?? []);
    setEditForm({
      first_name: selectedUser.first_name ?? "",
      last_name: selectedUser.last_name ?? "",
      email: selectedUser.email ?? "",
      username: selectedUser.username ?? "",
      phone: selectedUser.phone ?? "",
      role: selectedUser.role ?? "SERVEUR",
      branch_id: selectedUser.branch_id ?? "",
    });
    setPasswordForm("");
  }, [selectedUser?.id]);

  useEffect(() => {
    setFormPermissions(formRoleDefaults);
  }, [form.role, formRoleDefaults]);

  async function api(path, options = {}) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });

    if (response.status === 204) return null;

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(formatApiError(data.detail, "Opération impossible."));
    }
    return data;
  }

  async function loadAccessData() {
    setIsLoading(true);
    try {
      const [usersData, groupsData, presetsData, branchesData] = await Promise.all([
        api("/api/v1/users"),
        api("/api/v1/permissions/groups"),
        api("/api/v1/permissions/role-presets"),
        api("/api/v1/branches").catch(() => []),
      ]);
      setUsers(usersData);
      setPermissionGroups(groupsData);
      setRolePresets(presetsData);
      setBranches(branchesData);
      setSelectedUserId((current) => current || usersData[0]?.id || "");
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

  async function createUser(event) {
    event.preventDefault();
    setIsLoading(true);
    try {
      const payload = {
        ...form,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        branch_id: form.branch_id || null,
        permissions: formPermissions,
      };
      const created = await api("/api/v1/users", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setUsers((current) => [created, ...current]);
      setSelectedUserId(created.id);
      setForm(emptyForm);
      setShowCreateForm(false);
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
      const updated = await api(`/api/v1/users/${selectedUser.id}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissions: draftPermissions }),
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
      const updated = await api(`/api/v1/users/${selectedUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...editForm,
          email: editForm.email.trim() || null,
          phone: editForm.phone.trim() || null,
          branch_id: editForm.branch_id || null,
          permissions: draftPermissions,
        }),
      });
      setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)));
      setSelectedUserId(updated.id);
      onMessage("Informations du personnel mises à jour.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleStatus(user) {
    setIsLoading(true);
    try {
      const updated = await api(`/api/v1/users/${user.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !user.is_active }),
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
      const updated = await api(`/api/v1/users/${selectedUser.id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password: passwordForm }),
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
      await api(`/api/v1/users/${user.id}`, { method: "DELETE" });
      setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, is_active: false } : item)));
      setSelectedUserId(user.id);
      onMessage("Utilisateur archivé. Il peut être restauré depuis cette liste.");
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
          <h1 className="mt-2 text-4xl font-black text-[var(--dashboard-secondary)]">Utilisateurs & permissions</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          {!showCreateOnMount && (
            <button
              type="button"
              onClick={() => setShowCreateForm((value) => !value)}
              className="lte-btn lte-btn-primary"
            >
              <DashboardIcon name="UserPlus" size={17} />
              {showCreateForm ? "Fermer le formulaire" : "Ajouter un utilisateur"}
            </button>
          )}
        </div>
      </div>

      {showCreateForm && (
        <form onSubmit={createUser} className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-2xl font-black text-[var(--dashboard-secondary)]">Créer un compte</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Ajoutez un membre et appliquez un rôle de départ.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
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
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-6 lte-btn lte-btn-primary"
          >
            <DashboardIcon name="Plus" size={17} />
            Créer l'utilisateur
          </button>
        </form>
      )}

      {!showCreateOnMount && (
      <div className="space-y-6">
          <div className="border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px]">
              <div className="flex h-12 items-center gap-3 border border-slate-200 bg-white px-4">
                <DashboardIcon name="Search" size={17} className="text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher par nom, email ou identifiant..."
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                className="form-control"
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
                className="form-control"
              >
                <option value="ALL">Tous les statuts</option>
                <option value="ACTIVE">Actifs</option>
                <option value="INACTIVE">Archivés / désactivés</option>
              </select>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(420px,0.7fr)]">
            <div className="border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-lg font-black text-[var(--dashboard-secondary)]">Personnel</h2>
                <p className="text-sm font-medium text-slate-500">{filteredUsers.length} compte(s) affiché(s)</p>
              </div>
              <div className="overflow-x-auto">
                <table className="lte-table min-w-[980px]">
                  <thead>
                    <tr>
                      <th className="px-5 py-4">
                        <SortButton label="Nom" column="name" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} />
                      </th>
                      <th className="px-5 py-4">
                        <SortButton label="Identifiant" column="username" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} />
                      </th>
                      <th className="px-5 py-4">
                        <SortButton label="Email" column="email" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} />
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
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-slate-100 text-sm font-black text-slate-700">
                              {user.first_name?.[0]}
                              {user.last_name?.[0]}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-black text-[var(--dashboard-secondary)]">
                                {user.first_name} {user.last_name}
                              </p>
                              <p className="text-xs font-semibold text-slate-400">
                                Créé le {new Date(user.created_at).toLocaleDateString("fr-FR")}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm font-bold text-slate-700">{user.username}</td>
                        <td className="px-5 py-4 text-sm font-semibold text-slate-500">{user.email || "Non renseigné"}</td>
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
                              onClick={() => setSelectedUserId(user.id)}
                              className="inline-flex h-9 w-9 items-center justify-center border border-slate-200 text-slate-600 transition-all hover:border-[var(--dashboard-primary)] hover:text-[var(--dashboard-primary)]"
                              title="Modifier"
                            >
                              <DashboardIcon name="Pencil" size={16} />
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

            <div className="border border-slate-200 bg-white p-6 shadow-sm">
              {selectedUser ? (
                <>
                  <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-start">
                    <div>
                      <p className="text-xs font-black uppercase text-[var(--dashboard-primary)]">{roleLabels[selectedUser.role]}</p>
                      <h2 className="mt-1 text-2xl font-black text-[var(--dashboard-secondary)]">
                        {selectedUser.first_name} {selectedUser.last_name}
                      </h2>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {selectedUser.username} · {selectedUser.email || "Email non renseigné"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => toggleStatus(selectedUser)}
                        disabled={selectedUser.id === currentUser.id || isLoading}
                        className="lte-btn lte-btn-default"
                      >
                        <DashboardIcon name="Power" size={15} />
                        {selectedUser.is_active ? "Désactiver" : "Restaurer"}
                      </button>
                      {selectedUser.is_active && (
                        <button
                          type="button"
                          onClick={() => deleteUser(selectedUser)}
                          disabled={selectedUser.id === currentUser.id || isLoading}
                          className="lte-btn lte-btn-danger lte-btn-sm"
                        >
                          <DashboardIcon name="Archive" size={15} />
                          Archiver
                        </button>
                      )}
                    </div>
                  </div>

                  <form onSubmit={saveSelectedUser} className="mt-6 border-b border-slate-200 pb-6">
                    <h3 className="text-sm font-black uppercase text-[var(--dashboard-secondary)]">Informations du personnel</h3>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <Field name="first_name" label="Prénom" value={editForm?.first_name ?? ""} onChange={updateEditField} required />
                      <Field name="last_name" label="Nom" value={editForm?.last_name ?? ""} onChange={updateEditField} required />
                      <Field name="email" label="Email" type="email" value={editForm?.email ?? ""} onChange={updateEditField} />
                      <Field name="username" label="Nom utilisateur" value={editForm?.username ?? ""} onChange={updateEditField} required />
                      <Field name="phone" label="Téléphone" value={editForm?.phone ?? ""} onChange={updateEditField} />
                      <Select name="role" label="Rôle" value={editForm?.role ?? "SERVEUR"} onChange={updateEditField}>
                        {STAFF_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {roleLabels[role]}
                          </option>
                        ))}
                      </Select>
                      <Select name="branch_id" label="Branche" value={editForm?.branch_id ?? ""} onChange={updateEditField}>
                        <option value="">Toutes les branches</option>
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="mt-5 lte-btn lte-btn-primary"
                    >
                      <DashboardIcon name="Pencil" size={15} />
                      Enregistrer les informations
                    </button>
                  </form>

                  <form onSubmit={resetSelectedPassword} className="mt-6 border-b border-slate-200 pb-6">
                    <h3 className="text-sm font-black uppercase text-[var(--dashboard-secondary)]">Réinitialisation du mot de passe</h3>
                    <p className="mt-2 text-sm font-medium text-slate-500">
                      Cette action définit un nouveau mot de passe pour ce membre du personnel. Le compte admin propriétaire est géré par le superadmin.
                    </p>
                    <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                      <Field
                        name="new_password"
                        label="Nouveau mot de passe"
                        type="password"
                        value={passwordForm}
                        onChange={(event) => setPasswordForm(event.target.value)}
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

                  <details className="mt-6 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                    <summary className="cursor-pointer text-sm font-black text-[var(--dashboard-secondary)]">
                      Permissions utilisateur
                    </summary>
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                      Les permissions marquées “Rôle” sont incluses automatiquement par le rôle.
                    </p>
                    <PermissionMatrix
                      className="mt-4"
                      title="Permissions personnalisées"
                      groups={permissionGroups}
                      selected={draftPermissions}
                      lockedPermissions={selectedRoleDefaults}
                      onToggle={(permission, locked) =>
                        togglePermission(permission, draftPermissions, setDraftPermissions, locked)
                      }
                    />
                    <button
                      type="button"
                      onClick={saveSelectedPermissions}
                      disabled={isLoading}
                      className="mt-5 lte-btn lte-btn-primary"
                    >
                      <DashboardIcon name="ShieldCheck" size={15} />
                      Enregistrer les permissions
                    </button>
                  </details>
                </>
              ) : (
                <div className="py-16 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-[#fff4ed] text-[var(--dashboard-primary)]">
                    <DashboardIcon name="ShieldCheck" size={23} />
                  </div>
                  <p className="mt-4 text-lg font-black text-[var(--dashboard-secondary)]">Sélectionnez un utilisateur</p>
                </div>
              )}
            </div>
          </div>
      </div>
      )}
    </section>
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
  return (
    <label className="block">
      <RequiredLabel required={required}>{label}</RequiredLabel>
      <input
        {...props}
        {...validationFor(props.name)}
        required={required}
        autoComplete={props.autoComplete ?? (isPassword ? "new-password" : undefined)}
        autoCorrect={isPassword ? "off" : props.autoCorrect}
        autoCapitalize={isPassword ? "none" : props.autoCapitalize}
        spellCheck={isPassword ? false : props.spellCheck}
        className="mt-2 form-control"
      />
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
