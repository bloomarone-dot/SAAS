import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { nextSort, SortButton, sortRows } from "@/utils/sort";

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

export function StaffPermissionsAdmin({ apiBaseUrl, currentUser, onMessage }) {
  const [users, setUsers] = useState([]);
  const [permissionGroups, setPermissionGroups] = useState([]);
  const [rolePresets, setRolePresets] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [draftPermissions, setDraftPermissions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(null);
  const [formPermissions, setFormPermissions] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
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
        user.email.toLowerCase().includes(query) ||
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
      email: (user) => user.email,
      role: (user) => roleLabels[user.role] ?? user.role,
      branch: (user) => branches.find((branch) => branch.id === user.branch_id)?.name ?? "",
      status: (user) => Number(user.is_active),
      created_at: (user) => user.created_at,
    });
  }, [branches, roleFilter, search, sort, statusFilter, users]);

  const stats = useMemo(
    () => [
      { label: "Utilisateurs", value: users.length, icon: "Users" },
      { label: "Actifs", value: users.filter((user) => user.is_active).length, icon: "CheckCircle2" },
      { label: "Rôles", value: STAFF_ROLES.length, icon: "ShieldCheck" },
      { label: "Permissions", value: permissionGroups.reduce((total, group) => total + group.permissions.length, 0), icon: "SlidersHorizontal" },
    ],
    [permissionGroups, users]
  );

  useEffect(() => {
    loadAccessData();
  }, []);

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
      throw new Error(data.detail ?? "Opération impossible.");
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
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateEditField(event) {
    const { name, value } = event.target;
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

  async function deleteUser(user) {
    setIsLoading(true);
    try {
      await api(`/api/v1/users/${user.id}`, { method: "DELETE" });
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setSelectedUserId("");
      onMessage("Utilisateur supprimé.");
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
          <p className="text-xs font-black uppercase tracking-normal text-[#f04438]">Administration restaurant</p>
          <h1 className="mt-2 text-4xl font-black text-[#070528]">Utilisateurs & permissions</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">
            Gérez les comptes du personnel, appliquez les rôles métier et contrôlez les accès par module.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setShowCreateForm((value) => !value)}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#f04438] px-5 text-sm font-black text-white shadow-lg shadow-[#fecdca] transition-all hover:bg-[#d92d20]"
          >
            <DashboardIcon name="UserPlus" size={17} />
            {showCreateForm ? "Fermer le formulaire" : "Ajouter un utilisateur"}
          </button>
          <button
            type="button"
            onClick={loadAccessData}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm transition-all hover:border-[#f04438] hover:text-[#f04438]"
          >
            <DashboardIcon name="Activity" size={17} />
            Actualiser
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <div key={item.label} className="border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#fff4ed] text-[#f04438]">
                <DashboardIcon name={item.icon} size={19} />
              </div>
              <span className="text-xs font-black uppercase text-slate-400">Admin</span>
            </div>
            <p className="mt-5 text-sm font-bold text-slate-500">{item.label}</p>
            <p className="mt-1 text-3xl font-black text-[#070528]">{item.value}</p>
          </div>
        ))}
      </div>

      {showCreateForm && (
        <form onSubmit={createUser} className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-[#070528]">Créer un compte</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Ajoutez un membre et appliquez un rôle de départ.</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#f04438] text-white">
              <DashboardIcon name="UserPlus" size={19} />
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field name="first_name" label="Prénom" value={form.first_name} onChange={updateFormField} required />
            <Field name="last_name" label="Nom" value={form.last_name} onChange={updateFormField} required />
            <Field name="email" label="Email" type="email" value={form.email} onChange={updateFormField} required />
            <Field name="username" label="Nom utilisateur" value={form.username} onChange={updateFormField} required />
            <Field name="password" label="Mot de passe" type="password" value={form.password} onChange={updateFormField} required />
            <Field name="phone" label="Téléphone" value={form.phone} onChange={updateFormField} />
            <Select name="role" label="Rôle" value={form.role} onChange={updateFormField}>
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

          <PermissionMatrix
            className="mt-6"
            title="Permissions initiales"
            groups={permissionGroups}
            selected={formPermissions}
            lockedPermissions={new Set(formRoleDefaults)}
            onToggle={(permission, locked) =>
              togglePermission(permission, formPermissions, setFormPermissions, locked)
            }
          />

          <button
            type="submit"
            disabled={isLoading}
            className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#f04438] px-5 text-sm font-black text-white shadow-lg shadow-[#fecdca] transition-all hover:bg-[#d92d20] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <DashboardIcon name="Plus" size={17} />
            Créer l'utilisateur
          </button>
        </form>
      )}

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
                className="h-12 border border-slate-200 bg-white px-4 text-sm font-black outline-none"
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
                className="h-12 border border-slate-200 bg-white px-4 text-sm font-black outline-none"
              >
                <option value="ALL">Tous les statuts</option>
                <option value="ACTIVE">Actifs</option>
                <option value="INACTIVE">Désactivés</option>
              </select>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(420px,0.7fr)]">
            <div className="border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-lg font-black text-[#070528]">Personnel</h2>
                <p className="text-sm font-medium text-slate-500">{filteredUsers.length} compte(s) affiché(s)</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-left">
                  <thead className="bg-[#fff8f3] text-xs font-black uppercase text-[#b42318]">
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
                              <p className="truncate font-black text-[#070528]">
                                {user.first_name} {user.last_name}
                              </p>
                              <p className="text-xs font-semibold text-slate-400">
                                Créé le {new Date(user.created_at).toLocaleDateString("fr-FR")}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm font-bold text-slate-700">{user.username}</td>
                        <td className="px-5 py-4 text-sm font-semibold text-slate-500">{user.email}</td>
                        <td className="px-5 py-4 text-sm font-black text-[#f04438]">{roleLabels[user.role] ?? user.role}</td>
                        <td className="px-5 py-4 text-sm font-semibold text-slate-500">
                          {branches.find((branch) => branch.id === user.branch_id)?.name ?? "Toutes"}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`px-3 py-1 text-xs font-black ${user.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                            {user.is_active ? "Actif" : "Désactivé"}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedUserId(user.id)}
                              className="inline-flex h-9 w-9 items-center justify-center border border-slate-200 text-slate-600 transition-all hover:border-[#f04438] hover:text-[#f04438]"
                              title="Modifier"
                            >
                              <DashboardIcon name="Pencil" size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteUser(user)}
                              disabled={user.id === currentUser.id || isLoading}
                              className="inline-flex h-9 w-9 items-center justify-center border border-red-100 text-red-600 transition-all hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                              title="Supprimer"
                            >
                              <DashboardIcon name="Trash2" size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!filteredUsers.length && (
                  <div className="px-5 py-16 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center bg-[#fff4ed] text-[#f04438]">
                      <DashboardIcon name="Users" size={23} />
                    </div>
                    <p className="mt-4 text-lg font-black text-[#070528]">Aucun utilisateur trouvé</p>
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
                      <p className="text-xs font-black uppercase text-[#f04438]">{roleLabels[selectedUser.role]}</p>
                      <h2 className="mt-1 text-2xl font-black text-[#070528]">
                        {selectedUser.first_name} {selectedUser.last_name}
                      </h2>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {selectedUser.username} · {selectedUser.email}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => toggleStatus(selectedUser)}
                        disabled={selectedUser.id === currentUser.id || isLoading}
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 transition-all hover:border-[#f04438] hover:text-[#f04438] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <DashboardIcon name="Power" size={15} />
                        {selectedUser.is_active ? "Désactiver" : "Activer"}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteUser(selectedUser)}
                        disabled={selectedUser.id === currentUser.id || isLoading}
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-100 px-3 text-xs font-black text-red-600 transition-all hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <DashboardIcon name="Trash2" size={15} />
                        Supprimer
                      </button>
                    </div>
                  </div>

                  <form onSubmit={saveSelectedUser} className="mt-6 border-b border-slate-200 pb-6">
                    <h3 className="text-sm font-black uppercase text-[#070528]">Informations du personnel</h3>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <Field name="first_name" label="Prénom" value={editForm?.first_name ?? ""} onChange={updateEditField} required />
                      <Field name="last_name" label="Nom" value={editForm?.last_name ?? ""} onChange={updateEditField} required />
                      <Field name="email" label="Email" type="email" value={editForm?.email ?? ""} onChange={updateEditField} required />
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
                      className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#f04438] px-4 text-xs font-black text-white shadow-lg shadow-[#fecdca] transition-all hover:bg-[#d92d20] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <DashboardIcon name="Pencil" size={15} />
                      Enregistrer les informations
                    </button>
                  </form>

                  <PermissionMatrix
                    className="mt-6"
                    title="Permissions utilisateur"
                    groups={permissionGroups}
                    selected={draftPermissions}
                    lockedPermissions={selectedRoleDefaults}
                    onToggle={(permission, locked) =>
                      togglePermission(permission, draftPermissions, setDraftPermissions, locked)
                    }
                  />

                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
                    <p className="text-xs font-semibold text-slate-500">
                      Les permissions marquées “Rôle” sont incluses automatiquement par le rôle.
                    </p>
                    <button
                      type="button"
                      onClick={saveSelectedPermissions}
                      disabled={isLoading}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#f04438] px-5 text-sm font-black text-white shadow-lg shadow-[#fecdca] transition-all hover:bg-[#d92d20] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <DashboardIcon name="ShieldCheck" size={17} />
                      Enregistrer les permissions
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-16 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-[#fff4ed] text-[#f04438]">
                    <DashboardIcon name="ShieldCheck" size={23} />
                  </div>
                  <p className="mt-4 text-lg font-black text-[#070528]">Sélectionnez un utilisateur</p>
                </div>
              )}
            </div>
          </div>
      </div>
    </section>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[#070528]">{label}</span>
      <input
        {...props}
        className="mt-2 h-11 w-full border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition-all placeholder:text-slate-400 focus:border-[#f04438] focus:ring-4 focus:ring-[#fee4e2]"
      />
    </label>
  );
}

function Select({ label, children, ...props }) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[#070528]">{label}</span>
      <select
        {...props}
        className="mt-2 h-11 w-full border border-slate-200 bg-white px-3 text-sm font-black outline-none transition-all focus:border-[#f04438] focus:ring-4 focus:ring-[#fee4e2]"
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
      <h3 className="text-sm font-black uppercase text-[#070528]">{title}</h3>
      <div className="mt-4 grid gap-4">
        {groups.map((group) => (
          <div key={group.key} className="border border-slate-200 bg-white p-4">
            <div className="mb-3">
              <p className="text-sm font-black text-[#070528]">{group.label}</p>
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
                      isChecked ? "border-[#f04438]/30 bg-[#fff4ed]" : "border-slate-200 bg-white hover:bg-slate-50"
                    } ${isLocked ? "cursor-not-allowed opacity-90" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isLocked}
                      onChange={() => onToggle(permission.key, isLocked)}
                      className="mt-1 accent-[#f04438]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-slate-800">{permission.label}</span>
                      <span className="block truncate text-xs font-medium text-slate-400">{permission.key}</span>
                    </span>
                    {isLocked && (
                      <span className="rounded bg-white px-2 py-1 text-[10px] font-black uppercase text-[#f04438]">
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
