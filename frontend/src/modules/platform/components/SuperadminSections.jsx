import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { nextSort, SortButton, sortRows } from "@/utils/sort";
import { formatApiError } from "@/utils/network";

export function SuperadminOwners({ apiBaseUrl, restaurants, onMessage }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "createdAt", direction: "desc" });
  const [selectedOwner, setSelectedOwner] = useState(null);
  const [isLoadingOwner, setIsLoadingOwner] = useState(false);
  const [ownerPassword, setOwnerPassword] = useState("");
  const owners = useMemo(
    () =>
      restaurants.map((restaurant) => ({
        id: restaurant.owner_id ?? restaurant.id,
        restaurantId: restaurant.id,
        restaurant: restaurant.name,
        tenant: restaurant.slug,
        email: restaurant.email || "Email non renseigné",
        status: restaurant.is_active ? "Actif" : "Inactif",
        createdAt: restaurant.created_at,
      })),
    [restaurants]
  );

  const filteredOwners = owners.filter((owner) => {
    const value = query.trim().toLowerCase();
    return (
      !value ||
      owner.restaurant.toLowerCase().includes(value) ||
      owner.tenant.toLowerCase().includes(value) ||
      owner.email.toLowerCase().includes(value)
    );
  });
  const sortedOwners = sortRows(filteredOwners, sort, {
    owner: (owner) => owner.email,
    restaurant: (owner) => owner.restaurant,
    tenant: (owner) => owner.tenant,
    status: (owner) => owner.status,
    createdAt: (owner) => owner.createdAt,
  });

  async function showOwner(owner) {
    setIsLoadingOwner(true);
    try {
      const detail = await platformApi(apiBaseUrl, `/api/v1/restaurants/${owner.restaurantId}`);
      setSelectedOwner(detail.owner ? { ...detail.owner, restaurant: detail.restaurant } : { restaurant: detail.restaurant });
      setOwnerPassword("");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoadingOwner(false);
    }
  }

  async function resetOwnerPassword(event) {
    event.preventDefault();
    if (!selectedOwner?.id) return;
    setIsLoadingOwner(true);
    try {
      await platformApi(apiBaseUrl, `/api/v1/platform/users/${selectedOwner.id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password: ownerPassword }),
      });
      setOwnerPassword("");
      onMessage("Mot de passe du propriétaire réinitialisé.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoadingOwner(false);
    }
  }

  return (
    <AdminSurface
      eyebrow="Gestion des accès"
      title="Propriétaires"
      description="Suivez les comptes administrateurs propriétaires rattachés aux restaurants."
      actions={
        <ExportActions
          title="Propriétaires"
          filename="proprietaires-restaurants"
          rows={sortedOwners}
          columns={ownerExportColumns}
        />
      }
    >
      <Toolbar>
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Rechercher un propriétaire, restaurant ou tenant..."
        />
        <Metric label="Propriétaires" value={owners.length} />
        <Metric label="Actifs" value={owners.filter((owner) => owner.status === "Actif").length} />
      </Toolbar>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <DataTable
          columns={[
            { label: "Propriétaire", key: "owner" },
            { label: "Restaurant", key: "restaurant" },
            { label: "Tenant", key: "tenant" },
            { label: "Statut", key: "status" },
            { label: "Création", key: "createdAt" },
            { label: "Action" },
          ]}
          sort={sort}
          onSort={(key) => setSort((current) => nextSort(current, key))}
          emptyTitle="Aucun propriétaire trouvé"
          emptyText="Les propriétaires apparaîtront ici après création des restaurants."
        >
          {sortedOwners.map((owner) => (
            <tr key={`${owner.id}-${owner.restaurant}`} className="border-t border-[#eadfd7] hover:bg-[#fffaf5]">
              <td className="px-5 py-4">
                <p className="font-black text-[#07133d]">Administrateur propriétaire</p>
                <p className="mt-1 text-xs font-semibold text-[#64708b]">{owner.email}</p>
              </td>
              <td className="px-5 py-4 font-bold text-[#172033]">{owner.restaurant}</td>
              <td className="px-5 py-4 font-semibold text-[#64708b]">{owner.tenant}</td>
              <td className="px-5 py-4">
                <StatusBadge status={owner.status} />
              </td>
              <td className="px-5 py-4 font-semibold text-[#64708b]">
                {formatDate(owner.createdAt)}
              </td>
              <td className="px-5 py-4 text-right">
                <TableAction label={isLoadingOwner ? "Chargement..." : "Détails"} onClick={() => showOwner(owner)} />
              </td>
            </tr>
          ))}
        </DataTable>

        <div className="border border-[#eadfd7] bg-white p-5">
          <h2 className="font-black text-[#07133d]">Détail propriétaire</h2>
          {selectedOwner ? (
            <div className="mt-5 space-y-3">
              <DetailLine label="Nom" value={`${selectedOwner.first_name ?? "-"} ${selectedOwner.last_name ?? ""}`} />
              <DetailLine label="Utilisateur" value={selectedOwner.username ?? "-"} />
              <DetailLine label="Email" value={selectedOwner.email ?? "Non renseigné"} />
              <DetailLine label="Téléphone" value={selectedOwner.phone ?? "-"} />
              <DetailLine label="Restaurant" value={selectedOwner.restaurant?.name ?? "-"} />
              <DetailLine label="Statut" value={selectedOwner.is_active ? "Actif" : "Inactif"} />
              {selectedOwner.id && (
                <form onSubmit={resetOwnerPassword} className="border-t border-[#eadfd7] pt-4">
                  <label className="block">
                    <span className="text-xs font-black uppercase text-[#07133d]">Nouveau mot de passe</span>
                    <input
                      type="password"
                      value={ownerPassword}
                      onChange={(event) => setOwnerPassword(event.target.value)}
                      minLength={8}
                      required
                      autoComplete="new-password"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-form-type="other"
                      className="mt-2 h-11 w-full border border-[#eadfd7] bg-white px-3 text-sm font-semibold outline-none focus:border-[#f04438]"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={isLoadingOwner}
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 bg-[#07133d] px-4 text-xs font-black text-white transition-all hover:bg-[#172554] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <DashboardIcon name="KeyRound" size={15} />
                    Réinitialiser le mot de passe
                  </button>
                </form>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm font-semibold leading-6 text-[#64708b]">
              Cliquez sur Détails pour afficher les informations réelles du compte propriétaire.
            </p>
          )}
        </div>
      </div>
    </AdminSurface>
  );
}

export function SuperadminRestaurantDetail({ apiBaseUrl, restaurants, selectedRestaurantId, onSelectRestaurant, onMessage }) {
  const [detail, setDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [ownerPassword, setOwnerPassword] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "created_at", direction: "desc" });
  const restaurantId = selectedRestaurantId ?? "";

  useEffect(() => {
    if (!restaurantId) return;
    loadDetail(restaurantId);
  }, [apiBaseUrl, restaurantId]);

  useEffect(() => {
    if (!restaurantId) setDetail(null);
  }, [restaurantId]);

  async function loadDetail(id) {
    setIsLoading(true);
    try {
      setDetail(await platformApi(apiBaseUrl, `/api/v1/restaurants/${id}`));
      setOwnerPassword("");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredRestaurants = restaurants.filter((restaurant) => {
    const value = query.trim().toLowerCase();
    return (
      !value ||
      restaurant.name.toLowerCase().includes(value) ||
      restaurant.slug.toLowerCase().includes(value) ||
      (restaurant.email ?? "").toLowerCase().includes(value) ||
      (restaurant.phone ?? "").toLowerCase().includes(value)
    );
  });
  const sortedRestaurants = sortRows(filteredRestaurants, sort, {
    name: (restaurant) => restaurant.name,
    slug: (restaurant) => restaurant.slug,
    branches: (restaurant) => Number(restaurant.branches_count || 1),
    status: (restaurant) => Number(restaurant.is_active),
    created_at: (restaurant) => restaurant.created_at,
  });

  async function resetDetailOwnerPassword(event) {
    event.preventDefault();
    if (!detail?.owner?.id) return;
    setIsLoading(true);
    try {
      await platformApi(apiBaseUrl, `/api/v1/platform/users/${detail.owner.id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password: ownerPassword }),
      });
      setOwnerPassword("");
      onMessage("Mot de passe de l'admin propriétaire réinitialisé.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  if (!restaurantId) {
    return (
      <AdminSurface
        eyebrow="Tenant"
        title="Détail restaurant"
        description="Sélectionnez un restaurant dans la liste pour ouvrir sa fiche détaillée."
      >
        <Toolbar>
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Rechercher par nom, tenant, email ou téléphone..."
          />
          <Metric label="Restaurants" value={restaurants.length} />
          <Metric label="Actifs" value={restaurants.filter((restaurant) => restaurant.is_active).length} />
          <Metric label="Filtrés" value={sortedRestaurants.length} />
        </Toolbar>

        <DataTable
          columns={[
            { label: "Restaurant", key: "name" },
            { label: "Tenant", key: "slug" },
            { label: "Branches", key: "branches" },
            { label: "Téléphone" },
            { label: "Statut", key: "status" },
            { label: "Création", key: "created_at" },
            { label: "Action" },
          ]}
          sort={sort}
          onSort={(key) => setSort((current) => nextSort(current, key))}
          emptyTitle="Aucun restaurant"
          emptyText="Créez d’abord un restaurant ou modifiez la recherche."
        >
          {sortedRestaurants.map((restaurant) => (
            <tr key={restaurant.id} className="border-t border-[#eadfd7] hover:bg-[#fffaf5]">
              <td className="px-5 py-4 font-black text-[#07133d]">{restaurant.name}</td>
              <td className="px-5 py-4 font-semibold text-[#64708b]">{restaurant.slug}</td>
              <td className="px-5 py-4 font-bold text-[#172033]">{Number(restaurant.branches_count || 1)}</td>
              <td className="px-5 py-4 font-semibold text-[#64708b]">{restaurant.phone ?? "-"}</td>
              <td className="px-5 py-4"><StatusBadge status={restaurant.is_active ? "Actif" : "Inactif"} /></td>
              <td className="px-5 py-4 font-semibold text-[#64708b]">{formatDate(restaurant.created_at)}</td>
              <td className="px-5 py-4 text-right">
                <TableAction label="Détail" onClick={() => onSelectRestaurant(restaurant.id)} />
              </td>
            </tr>
          ))}
        </DataTable>
      </AdminSurface>
    );
  }

  return (
    <AdminSurface
      eyebrow="Tenant"
      title="Détail restaurant"
      description="Consultez les données réelles du restaurant, du propriétaire et de son abonnement."
      actions={
        <button type="button" onClick={() => onSelectRestaurant(null)} className="h-11 bg-[#07133d] px-5 text-sm font-black text-white transition-all hover:bg-[#172554]">
          Retour à la liste
        </button>
      }
    >
      <Toolbar>
        <FilterSelect
          value={restaurantId}
          onChange={onSelectRestaurant}
          options={restaurants.map((restaurant) => [restaurant.id, restaurant.name])}
        />
        <Metric label="Restaurants" value={restaurants.length} />
        <Metric label="Statut" value={detail?.restaurant?.is_active ? "Actif" : "Inactif"} />
      </Toolbar>

      {isLoading || !detail ? (
        <LoadingState label={restaurants.length ? "Chargement du restaurant..." : "Aucun restaurant disponible."} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-3">
          <SettingsPanel title="Restaurant">
            <DetailLine label="Nom" value={detail.restaurant.name} />
            <DetailLine label="Slug" value={detail.restaurant.slug} />
            <DetailLine label="Téléphone 1" value={detail.restaurant.phone ?? "-"} />
            <DetailLine label="Téléphone 2" value={detail.restaurant.whatsapp_phone ?? "-"} />
            <DetailLine label="Email" value={detail.restaurant.email ?? "Non renseigné"} />
            <DetailLine label="Branches" value={detail.restaurant.branches_count} />
            <DetailLine label="Création" value={formatDate(detail.restaurant.created_at)} />
          </SettingsPanel>
          <SettingsPanel title="Propriétaire">
            <DetailLine label="Nom" value={detail.owner ? `${detail.owner.first_name} ${detail.owner.last_name}` : "-"} />
            <DetailLine label="Utilisateur" value={detail.owner?.username ?? "-"} />
            <DetailLine label="Email" value={detail.owner?.email ?? "Non renseigné"} />
            <DetailLine label="Téléphone" value={detail.owner?.phone ?? "-"} />
            <DetailLine label="Compte" value={detail.owner?.is_active ? "Actif" : "Inactif"} />
            {detail.owner?.id && (
              <form onSubmit={resetDetailOwnerPassword} className="border-t border-[#eadfd7] pt-4">
                <label className="block">
                  <span className="text-xs font-black uppercase text-[#07133d]">Nouveau mot de passe</span>
                  <input
                    type="password"
                    value={ownerPassword}
                    onChange={(event) => setOwnerPassword(event.target.value)}
                    minLength={8}
                    required
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    className="mt-2 h-11 w-full border border-[#eadfd7] bg-white px-3 text-sm font-semibold outline-none focus:border-[#f04438]"
                  />
                </label>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 bg-[#07133d] px-4 text-xs font-black text-white transition-all hover:bg-[#172554] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <DashboardIcon name="KeyRound" size={15} />
                  Réinitialiser le mot de passe
                </button>
              </form>
            )}
          </SettingsPanel>
          <SettingsPanel title="Abonnement">
            <DetailLine label="Plan" value={detail.subscription?.plan ?? "Non configuré"} />
            <DetailLine label="Montant" value={formatMoney(detail.subscription?.amount, detail.subscription?.currency ?? detail.restaurant.currency)} />
            <DetailLine label="Statut" value={detail.subscription?.status ?? "A configurer"} />
            <DetailLine label="Renouvellement" value={formatDate(detail.subscription?.renewal_date)} />
          </SettingsPanel>
        </div>
      )}
    </AdminSurface>
  );
}

export function SuperadminGlobalStats({ apiBaseUrl, restaurants, onMessage }) {
  const [overview, setOverview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadOverview();
  }, [apiBaseUrl]);

  async function loadOverview() {
    setIsLoading(true);
    try {
      setOverview(await platformApi(apiBaseUrl, "/api/v1/platform/overview"));
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  const total = overview?.tenants_count ?? restaurants.length;
  const active = overview?.active_tenants_count ?? restaurants.filter((restaurant) => restaurant.is_active).length;
  const inactive = overview?.inactive_tenants_count ?? restaurants.filter((restaurant) => !restaurant.is_active).length;
  const configured = overview?.configured_subscriptions_count ?? 0;

  return (
    <AdminSurface
      eyebrow="Statistiques"
      title="Statistiques globales"
      description="Indicateurs consolidés de la plateforme SaaS et des restaurants."
      actionLabel={isLoading ? "Actualisation..." : "Actualiser"}
      onAction={loadOverview}
    >
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon="Store" label="Restaurants" value={total} />
        <MetricCard icon="Activity" label="Actifs" value={active} />
        <MetricCard icon="Power" label="Suspendus" value={inactive} />
        <MetricCard icon="Wallet" label="MRR" value={formatMoney(overview?.monthly_recurring_revenue ?? 0, overview?.currency ?? "XAF")} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <SettingsPanel title="Répartition tenants">
          <Progress label="Restaurants actifs" value={active} max={Math.max(total, 1)} />
          <Progress label="Restaurants suspendus" value={inactive} max={Math.max(total, 1)} />
          <Progress label="Abonnements configurés" value={configured} max={Math.max(total, 1)} />
        </SettingsPanel>
        <SettingsPanel title="Contrôles plateforme">
          {isLoading || !overview ? (
            <p className="text-sm font-semibold text-[#64708b]">Chargement des statistiques...</p>
          ) : (
            overview.checks.map((check) => (
              <DetailLine key={check.label} label={check.label} value={`${check.value} · ${check.status}`} />
            ))
          )}
        </SettingsPanel>
      </div>
    </AdminSurface>
  );
}

export function SuperadminPlatformActivity({ apiBaseUrl, onMessage }) {
  const [rows, setRows] = useState([]);
  const [sort, setSort] = useState({ key: "created_at", direction: "desc" });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadActivity();
  }, [apiBaseUrl]);

  async function loadActivity() {
    setIsLoading(true);
    try {
      setRows(await platformApi(apiBaseUrl, "/api/v1/platform/activity"));
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  const sortedRows = sortRows(rows, sort, {
    restaurant: (row) => row.restaurant_name ?? "",
    action: (row) => row.action,
    entity: (row) => row.entity_type,
    role: (row) => row.user_role ?? "",
    created_at: (row) => row.created_at,
  });

  return (
    <AdminSurface
      eyebrow="Audit"
      title="Journal plateforme"
      description="Consultez les dernières actions enregistrées sur l’ensemble des restaurants."
      actionLabel={isLoading ? "Chargement..." : "Actualiser"}
      onAction={loadActivity}
    >
      {isLoading ? (
        <LoadingState label="Chargement du journal plateforme..." />
      ) : (
        <DataTable
          columns={[
            { label: "Date", key: "created_at" },
            { label: "Restaurant", key: "restaurant" },
            { label: "Action", key: "action" },
            { label: "Entité", key: "entity" },
            { label: "Rôle", key: "role" },
            { label: "Description" },
          ]}
          sort={sort}
          onSort={(key) => setSort((current) => nextSort(current, key))}
          emptyTitle="Aucune activité"
          emptyText="Les actions auditées apparaîtront ici."
        >
          {sortedRows.map((row) => (
            <tr key={row.id} className="border-t border-[#eadfd7] hover:bg-[#fffaf5]">
              <td className="px-5 py-4 font-semibold text-[#64708b]">{formatDateTime(row.created_at)}</td>
              <td className="px-5 py-4 font-bold text-[#172033]">{row.restaurant_name ?? "Plateforme"}</td>
              <td className="px-5 py-4 font-black text-[#07133d]">{row.action}</td>
              <td className="px-5 py-4 font-semibold text-[#64708b]">{row.entity_type}</td>
              <td className="px-5 py-4 font-semibold text-[#64708b]">{row.user_role ?? "-"}</td>
              <td className="px-5 py-4 font-semibold text-[#64708b]">{row.description}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </AdminSurface>
  );
}

export function SuperadminActivation({ apiBaseUrl, restaurants, onRefreshRestaurants, onMessage }) {
  const [isSaving, setIsSaving] = useState(null);

  async function updateStatus(restaurant, isActive) {
    setIsSaving(restaurant.id);
    try {
      await platformApi(apiBaseUrl, `/api/v1/restaurants/${restaurant.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: isActive }),
      });
      await onRefreshRestaurants?.();
      onMessage(`${restaurant.name} ${isActive ? "activé" : "suspendu"}.`);
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsSaving(null);
    }
  }

  return (
    <AdminSurface
      eyebrow="Accès plateforme"
      title="Activation / suspension"
      description="Activez ou suspendez les tenants restaurants avec les statuts réels de la base."
    >
      <DataTable
        columns={["Restaurant", "Tenant", "Téléphone", "Statut", "Création", "Action"]}
        emptyTitle="Aucun restaurant"
        emptyText="Créez d’abord un restaurant."
      >
        {restaurants.map((restaurant) => (
          <tr key={restaurant.id} className="border-t border-[#eadfd7] hover:bg-[#fffaf5]">
            <td className="px-5 py-4 font-black text-[#07133d]">{restaurant.name}</td>
            <td className="px-5 py-4 font-semibold text-[#64708b]">{restaurant.slug}</td>
            <td className="px-5 py-4 font-semibold text-[#64708b]">{restaurant.phone ?? "-"}</td>
            <td className="px-5 py-4"><StatusBadge status={restaurant.is_active ? "Actif" : "Inactif"} /></td>
            <td className="px-5 py-4 font-semibold text-[#64708b]">{formatDate(restaurant.created_at)}</td>
            <td className="px-5 py-4 text-right">
              <TableAction
                label={isSaving === restaurant.id ? "Traitement..." : restaurant.is_active ? "Suspendre" : "Activer"}
                onClick={() => updateStatus(restaurant, !restaurant.is_active)}
              />
            </td>
          </tr>
        ))}
      </DataTable>
    </AdminSurface>
  );
}

export function SuperadminPayments({ apiBaseUrl, onMessage }) {
  const [rows, setRows] = useState([]);
  const [sort, setSort] = useState({ key: "paid_at", direction: "desc" });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadPayments();
  }, [apiBaseUrl]);

  async function loadPayments() {
    setIsLoading(true);
    try {
      setRows(await platformApi(apiBaseUrl, "/api/v1/platform/payments"));
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  const sortedRows = sortRows(rows, sort, {
    restaurant: (row) => row.restaurant_name,
    reference: (row) => row.reference,
    amount: (row) => row.amount,
    status: (row) => row.status,
    paid_at: (row) => row.paid_at ?? row.due_date,
  });
  const paidTotal = rows.filter((row) => row.status === "Payé").reduce((total, row) => total + Number(row.amount || 0), 0);

  return (
    <AdminSurface
      eyebrow="Encaissements SaaS"
      title="Paiements SaaS"
      description="Suivez les paiements liés aux abonnements SaaS configurés pour les restaurants."
      actions={
        <ExportActions
          title="Paiements SaaS"
          filename="paiements-saas"
          rows={sortedRows}
          columns={paymentExportColumns}
        />
      }
    >
      <Toolbar>
        <Metric label="Paiements" value={rows.length} />
        <Metric label="Payés" value={rows.filter((row) => row.status === "Payé").length} />
        <Metric label="Total payé" value={formatMoney(paidTotal, rows[0]?.currency ?? "XAF")} />
      </Toolbar>
      {isLoading ? (
        <LoadingState label="Chargement des paiements SaaS..." />
      ) : (
        <DataTable
          columns={[
            { label: "Référence", key: "reference" },
            { label: "Restaurant", key: "restaurant" },
            { label: "Montant", key: "amount" },
            { label: "Statut", key: "status" },
            { label: "Date", key: "paid_at" },
            { label: "Méthode" },
          ]}
          sort={sort}
          onSort={(key) => setSort((current) => nextSort(current, key))}
          emptyTitle="Aucun paiement SaaS"
          emptyText="Configurez les abonnements pour générer le suivi des paiements."
        >
          {sortedRows.map((row) => (
            <tr key={row.id} className="border-t border-[#eadfd7] hover:bg-[#fffaf5]">
              <td className="px-5 py-4 font-black text-[#07133d]">{row.reference}</td>
              <td className="px-5 py-4">
                <p className="font-bold text-[#172033]">{row.restaurant_name}</p>
                <p className="mt-1 text-xs font-semibold text-[#64708b]">{row.restaurant_slug}</p>
              </td>
              <td className="px-5 py-4 font-bold text-[#172033]">{formatMoney(row.amount, row.currency)}</td>
              <td className="px-5 py-4"><StatusBadge status={row.status} /></td>
              <td className="px-5 py-4 font-semibold text-[#64708b]">{formatDateTime(row.paid_at ?? row.due_date)}</td>
              <td className="px-5 py-4 font-semibold text-[#64708b]">{row.method}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </AdminSurface>
  );
}

export function SuperadminSubscriptions({ apiBaseUrl, restaurants, onMessage }) {
  const [plan, setPlan] = useState("all");
  const [sort, setSort] = useState({ key: "restaurant", direction: "asc" });
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSubscriptions();
  }, [apiBaseUrl]);

  async function loadSubscriptions() {
    setIsLoading(true);
    try {
      setRows(await platformApi(apiBaseUrl, "/api/v1/platform/subscriptions"));
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  function editRow(row) {
    setSelected(row);
    setForm({
      plan: row.plan,
      amount: String(row.amount),
      currency: row.currency,
      status: row.status,
      renewal_date: row.renewal_date ?? "",
      notes: row.notes ?? "",
    });
  }

  async function saveSubscription(event) {
    event.preventDefault();
    if (!selected) return;
    setIsSaving(true);
    try {
      const updated = await platformApi(apiBaseUrl, `/api/v1/platform/subscriptions/${selected.restaurant_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          plan: form.plan.trim(),
          amount: Number(form.amount || 0),
          currency: form.currency.trim().toUpperCase(),
          status: form.status.trim(),
          renewal_date: form.renewal_date || null,
          notes: optionalText(form.notes),
        }),
      });
      setRows((current) => current.map((row) => (row.restaurant_id === updated.restaurant_id ? updated : row)));
      setSelected(updated);
      onMessage("Abonnement mis à jour.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  const filteredRows = rows.filter((row) => plan === "all" || row.plan === plan);
  const sortedRows = sortRows(filteredRows, sort, {
    restaurant: (row) => row.restaurant_name,
    plan: (row) => row.plan,
    amount: (row) => row.amount,
    status: (row) => row.status,
    renewal: (row) => row.renewal_date,
  });
  const activeRows = rows.filter((row) => row.status === "Actif" && row.amount > 0);
  const mrr = activeRows.reduce((total, row) => total + Number(row.amount || 0), 0);
  const planOptions = uniquePlanOptions(rows);

  return (
    <AdminSurface
      eyebrow="Monétisation"
      title="Abonnements"
      description="Configurez les souscriptions réellement rattachées aux tenants restaurants."
      actions={
        <ExportActions
          title="Abonnements"
          filename="abonnements-restaurants"
          rows={sortedRows}
          columns={subscriptionExportColumns}
        />
      }
    >
      <Toolbar>
        <FilterSelect
          value={plan}
          onChange={setPlan}
          options={planOptions}
        />
        <Metric label="MRR réel" value={formatMoney(mrr, rows[0]?.currency ?? "XAF")} />
        <Metric label="Souscriptions" value={rows.length} />
        <Metric label="Actives" value={activeRows.length} />
      </Toolbar>

      {isLoading ? (
        <LoadingState label="Chargement des abonnements..." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
          <DataTable
            columns={[
              { label: "Restaurant", key: "restaurant" },
              { label: "Plan", key: "plan" },
              { label: "Montant", key: "amount" },
              { label: "Statut", key: "status" },
              { label: "Renouvellement", key: "renewal" },
              { label: "Action" },
            ]}
            sort={sort}
            onSort={(key) => setSort((current) => nextSort(current, key))}
            emptyTitle="Aucun abonnement"
            emptyText={restaurants.length ? "Rechargez la page pour synchroniser les tenants." : "Créez d’abord un restaurant."}
          >
            {sortedRows.map((row) => (
              <tr key={row.id} className="border-t border-[#eadfd7] hover:bg-[#fffaf5]">
                <td className="px-5 py-4">
                  <p className="font-black text-[#07133d]">{row.restaurant_name}</p>
                  <p className="mt-1 text-xs font-semibold text-[#64708b]">{row.restaurant_slug}</p>
                </td>
                <td className="px-5 py-4">
                  <span className="bg-[#fff4ed] px-3 py-1 text-xs font-black text-[#9a3412]">
                    {row.plan}
                  </span>
                </td>
                <td className="px-5 py-4 font-bold text-[#172033]">{formatMoney(row.amount, row.currency)}</td>
                <td className="px-5 py-4">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-5 py-4 font-semibold text-[#64708b]">{formatDate(row.renewal_date)}</td>
                <td className="px-5 py-4 text-right">
                  <TableAction label="Configurer" onClick={() => editRow(row)} />
                </td>
              </tr>
            ))}
          </DataTable>

          <SubscriptionEditor
            row={selected}
            form={form}
            onChange={setForm}
            onSubmit={saveSubscription}
            isSaving={isSaving}
          />
        </div>
      )}
    </AdminSurface>
  );
}

export function SuperadminPlatform({ apiBaseUrl, restaurants, onMessage, onRefreshRestaurants }) {
  const [overview, setOverview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadOverview();
  }, [apiBaseUrl]);

  async function loadOverview() {
    setIsLoading(true);
    try {
      const [data] = await Promise.all([
        platformApi(apiBaseUrl, "/api/v1/platform/overview"),
        onRefreshRestaurants?.(),
      ]);
      setOverview(data);
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  const active = overview?.active_tenants_count ?? restaurants.filter((restaurant) => restaurant.is_active).length;
  const total = overview?.tenants_count ?? restaurants.length;
  const configured = overview?.configured_subscriptions_count ?? 0;
  const checks = overview?.checks ?? [];

  return (
    <AdminSurface
      eyebrow="Supervision"
      title="Plateforme"
      description="Vue technique et opérationnelle de la plateforme SaaS."
      actionLabel={isLoading ? "Diagnostic..." : "Relancer diagnostic"}
      onAction={loadOverview}
    >
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon="Store" label="Tenants" value={total} />
        <MetricCard icon="Activity" label="Actifs" value={active} />
        <MetricCard icon="ReceiptText" label="Abonnements OK" value={configured} />
        <MetricCard icon="Wallet" label="MRR" value={formatMoney(overview?.monthly_recurring_revenue ?? 0, overview?.currency ?? "XAF")} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="border border-[#eadfd7] bg-white">
          <div className="border-b border-[#eadfd7] px-5 py-4">
            <h2 className="font-black text-[#07133d]">État des services</h2>
            <p className="mt-1 text-xs font-semibold text-[#64708b]">
              Dernier contrôle: {overview?.last_checked_at ? formatDateTime(overview.last_checked_at) : "-"}
            </p>
          </div>
          <div className="divide-y divide-[#eadfd7]">
            {checks.map((check) => (
              <div key={check.label} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="font-black text-[#07133d]">{check.label}</p>
                  <p className="mt-1 text-sm font-semibold text-[#64708b]">{check.value}</p>
                </div>
                <StatusBadge status={check.status} />
              </div>
            ))}
          </div>
        </div>

        <div className="border border-[#eadfd7] bg-[#fffaf5] p-5">
          <h2 className="font-black text-[#07133d]">Capacité actuelle</h2>
          <div className="mt-5 space-y-4">
            <Progress label="Restaurants actifs" value={active} max={Math.max(total, 1)} />
            <Progress label="Abonnements configurés" value={configured} max={Math.max(total, 1)} />
            <Progress label="Abonnements en attente" value={overview?.pending_subscriptions_count ?? 0} max={Math.max(total, 1)} />
          </div>
          <div className="mt-6">
            <ExportActions
              title="Diagnostic plateforme"
              filename="diagnostic-plateforme"
              rows={checks}
              columns={platformExportColumns}
              fullWidth
            />
          </div>
        </div>
      </div>
    </AdminSurface>
  );
}

export function SuperadminSettings({ apiBaseUrl, onMessage }) {
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [apiBaseUrl]);

  async function loadSettings() {
    setIsLoading(true);
    try {
      setSettings(await platformApi(apiBaseUrl, "/api/v1/platform/settings"));
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const updated = await platformApi(apiBaseUrl, "/api/v1/platform/settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      setSettings(updated);
      onMessage("Paramètres plateforme sauvegardés.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  function updateField(name, value) {
    setSettings((current) => ({ ...current, [name]: value }));
  }

  return (
    <AdminSurface
      eyebrow="Configuration"
      title="Paramètres"
      description="Définissez les valeurs globales utilisées par la plateforme et les abonnements."
      actionLabel={isSaving ? "Sauvegarde..." : "Sauvegarder"}
      onAction={() => document.getElementById("platform-settings-form")?.requestSubmit()}
    >
      {isLoading || !settings ? (
        <LoadingState label="Chargement des paramètres..." />
      ) : (
        <form id="platform-settings-form" onSubmit={saveSettings} className="grid gap-5 xl:grid-cols-2">
          <SettingsPanel title="Identité plateforme">
            <TextField label="Nom de la plateforme" value={settings.platform_name} onChange={(value) => updateField("platform_name", value)} required />
            <TextField label="Email support" type="email" value={settings.support_email} onChange={(value) => updateField("support_email", value)} required />
            <TextField label="Devise par défaut" value={settings.default_currency} onChange={(value) => updateField("default_currency", value.toUpperCase())} maxLength={3} required />
            <TextField label="Fuseau horaire" value={settings.default_timezone} onChange={(value) => updateField("default_timezone", value)} required />
          </SettingsPanel>
          <SettingsPanel title="Abonnements">
            <TextField label="Période d’essai (jours)" type="number" min="0" value={settings.trial_days} onChange={(value) => updateField("trial_days", Number(value))} required />
            <TextField label="Relance expiration (jours avant)" type="number" min="0" value={settings.expiration_notice_days} onChange={(value) => updateField("expiration_notice_days", Number(value))} required />
            <ToggleField label="Inscription publique" checked={settings.allow_public_signup} onChange={(value) => updateField("allow_public_signup", value)} />
            <ToggleField label="Validation owner obligatoire" checked={settings.require_owner_approval} onChange={(value) => updateField("require_owner_approval", value)} />
          </SettingsPanel>
        </form>
      )}
    </AdminSurface>
  );
}

function AdminSurface({ eyebrow, title, description, actionLabel, onAction, actions, children }) {
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-normal text-[#f04438]">
            {eyebrow}
          </p>
          <h1 className="text-4xl font-black text-[#07133d]">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[#64708b]">
            {description}
          </p>
        </div>
        {actions ?? (actionLabel ? (
          <button type="button" onClick={onAction} className="h-11 bg-[#07133d] px-5 text-sm font-black text-white transition-all hover:bg-[#172554]">
            {actionLabel}
          </button>
        ) : null)}
      </div>
      {children}
    </section>
  );
}

function Toolbar({ children }) {
  return (
    <div className="grid gap-3 border border-[#eadfd7] bg-white p-4 shadow-[0_14px_40px_rgba(15,23,42,0.04)] xl:grid-cols-[1fr_repeat(3,auto)]">
      {children}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="flex h-11 items-center gap-3 border border-[#eadfd7] bg-white px-4">
      <DashboardIcon name="Search" size={18} className="text-[#667085]" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-sm font-semibold text-[#172033] outline-none placeholder:text-[#98a2b3]"
      />
    </label>
  );
}

function FilterSelect({ value, onChange, options }) {
  return (
    <label className="flex h-11 items-center gap-3 border border-[#eadfd7] bg-white px-4">
      <DashboardIcon name="SlidersHorizontal" size={18} className="text-[#f04438]" />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent text-sm font-black text-[#172033] outline-none"
      >
        {options.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Metric({ label, value }) {
  return (
    <div className="min-w-[120px] border border-[#eadfd7] px-4 py-2 text-center text-xs font-black">
      <p className="text-[#98a2b3]">{label}</p>
      <p className="mt-1 text-base text-[#07133d]">{value}</p>
    </div>
  );
}

function MetricCard({ icon, label, value }) {
  return (
    <div className="border border-[#eadfd7] bg-white p-5">
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center bg-[#fff4ed] text-[#f04438]">
          <DashboardIcon name={icon} size={22} />
        </div>
        <div>
          <p className="text-xs font-black uppercase text-[#98a2b3]">{label}</p>
          <p className="mt-1 text-2xl font-black text-[#07133d]">{value}</p>
        </div>
      </div>
    </div>
  );
}

function DataTable({ columns, sort, onSort, emptyTitle, emptyText, children }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <div className="overflow-hidden border border-[#eadfd7] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-[#fffaf5] text-xs font-black uppercase text-[#9a3412]">
            <tr>
              {columns.map((column) => {
                const config = typeof column === "string" ? { label: column } : column;
                return (
                <th key={config.label} className="px-5 py-4 last:text-right">
                  {config.key ? (
                    <SortButton label={config.label} column={config.key} sort={sort} onSort={onSort} />
                  ) : (
                    config.label
                  )}
                </th>
              );
              })}
            </tr>
          </thead>
          <tbody>
            {hasRows ? (
              children
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center">
                  <p className="text-lg font-black text-[#07133d]">{emptyTitle}</p>
                  <p className="mt-2 text-sm font-semibold text-[#64708b]">{emptyText}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const className =
    status === "Actif"
      ? "bg-emerald-100 text-emerald-700"
      : status === "Attention"
        ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-600";

  return <span className={`px-3 py-1 text-xs font-black ${className}`}>{status}</span>;
}

function TableAction({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border border-[#eadfd7] px-3 py-1.5 text-xs font-black text-[#172033] hover:border-[#f04438] hover:text-[#f04438]"
    >
      {label}
    </button>
  );
}

function SettingsPanel({ title, children }) {
  return (
    <div className="border border-[#eadfd7] bg-white p-5">
      <h2 className="font-black text-[#07133d]">{title}</h2>
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  );
}

function DetailLine({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border border-[#eadfd7] bg-[#fffaf5] px-4 py-3 text-sm">
      <span className="font-black text-[#64708b]">{label}</span>
      <span className="text-right font-bold text-[#172033]">{value ?? "-"}</span>
    </div>
  );
}

function SubscriptionEditor({ row, form, onChange, onSubmit, isSaving }) {
  if (!row || !form) {
    return (
      <div className="border border-[#eadfd7] bg-[#fffaf5] p-5">
        <h2 className="font-black text-[#07133d]">Configuration abonnement</h2>
        <p className="mt-3 text-sm font-semibold leading-6 text-[#64708b]">
          Sélectionnez un restaurant dans le tableau pour définir son plan, son montant, son statut et la date de renouvellement.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="border border-[#eadfd7] bg-[#fffaf5] p-5">
      <h2 className="font-black text-[#07133d]">{row.restaurant_name}</h2>
      <p className="mt-1 text-xs font-semibold text-[#64708b]">{row.restaurant_slug}</p>
      <div className="mt-5 space-y-4">
        <TextField label="Plan" value={form.plan} onChange={(value) => onChange({ ...form, plan: value })} required />
        <TextField label="Montant mensuel" type="number" min="0" value={form.amount} onChange={(value) => onChange({ ...form, amount: value })} required />
        <TextField label="Devise" value={form.currency} maxLength={3} onChange={(value) => onChange({ ...form, currency: value.toUpperCase() })} required />
        <SelectField
          label="Statut"
          value={form.status}
          onChange={(value) => onChange({ ...form, status: value })}
          options={["Actif", "A configurer", "Suspendu", "En retard"]}
        />
        <TextField label="Renouvellement" type="date" value={form.renewal_date} onChange={(value) => onChange({ ...form, renewal_date: value })} />
        <label className="block">
          <span className="mb-2 block text-sm font-black text-[#172033]">Notes</span>
          <textarea
            value={form.notes}
            onChange={(event) => onChange({ ...form, notes: event.target.value })}
            className="min-h-24 w-full border border-[#eadfd7] bg-white px-4 py-3 text-sm font-semibold text-[#172033] outline-none focus:border-[#f04438]"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={isSaving}
        className="mt-5 h-11 w-full bg-[#f04438] px-5 text-sm font-black text-white hover:bg-[#d92d20] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSaving ? "Sauvegarde..." : "Sauvegarder l'abonnement"}
      </button>
    </form>
  );
}

function TextField({ label, value, onChange, type = "text", required, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-[#172033]">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="h-11 w-full border border-[#eadfd7] bg-white px-4 text-sm font-semibold text-[#172033] outline-none focus:border-[#f04438]"
        {...props}
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-[#172033]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full border border-[#eadfd7] bg-white px-4 text-sm font-semibold text-[#172033] outline-none focus:border-[#f04438]"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleField({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 border border-[#eadfd7] bg-white px-4 py-3">
      <span className="text-sm font-black text-[#172033]">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-[#f04438]"
      />
    </label>
  );
}

function LoadingState({ label }) {
  return (
    <div className="border border-[#eadfd7] bg-white px-6 py-12 text-center text-sm font-black text-[#64708b]">
      {label}
    </div>
  );
}

function Progress({ label, value, max, suffix = "" }) {
  const percent = Math.min(100, Math.round((value / max) * 100));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm font-black">
        <span className="text-[#172033]">{label}</span>
        <span className="text-[#f04438]">{suffix ? `${value}${suffix}` : `${percent}%`}</span>
      </div>
      <div className="h-2 bg-[#ffead5]">
        <div className="h-full bg-[#f04438]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function formatDate(date) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("fr-FR");
}

function formatDateTime(date) {
  if (!date) return "-";
  return new Date(date).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatMoney(value, currency) {
  return `${Number(value || 0).toLocaleString("fr-FR")} ${currency || "XAF"}`;
}

function uniquePlanOptions(rows) {
  const plans = [...new Set(rows.map((row) => row.plan).filter(Boolean))];
  return [["all", "Tous les plans"], ...plans.map((item) => [item, item])];
}

function optionalText(value) {
  const trimmed = typeof value === "string" ? value.trim() : value;
  return trimmed || null;
}

async function platformApi(apiBaseUrl, path, options = {}) {
  const token = localStorage.getItem("access_token");
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(formatApiError(data?.detail, "Action plateforme impossible."));
  }
  return data;
}

function ExportActions({ title, filename, rows, columns, fullWidth = false }) {
  return (
    <div className={`flex flex-wrap gap-2 ${fullWidth ? "w-full" : "justify-end"}`}>
      <button
        type="button"
        onClick={() => exportExcel(`${filename}.xls`, rows, columns, title)}
        className={`${fullWidth ? "flex-1" : ""} inline-flex h-10 items-center justify-center gap-2 border border-[#eadfd7] bg-white px-4 text-sm font-black text-[#172033] hover:border-[#f04438] hover:text-[#f04438]`}
      >
        <DashboardIcon name="FileText" size={16} />
        Exporter en Excel
      </button>
      <button
        type="button"
        onClick={() => exportPdf(title, rows, columns)}
        className={`${fullWidth ? "flex-1" : ""} inline-flex h-10 items-center justify-center gap-2 border border-[#eadfd7] bg-white px-4 text-sm font-black text-[#172033] hover:border-[#f04438] hover:text-[#f04438]`}
      >
        <DashboardIcon name="ReceiptText" size={16} />
        Exporter en PDF
      </button>
    </div>
  );
}

function exportExcel(filename, rows, columns, title) {
  const html = buildExportTable(title, rows, columns);
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportPdf(title, rows, columns) {
  printHtmlDocument(buildPdfDocument(title, rows, columns), () => {
    window.alert("Export PDF bloqué par le navigateur. Autorisez les fenêtres pop-up puis réessayez.");
  });
}

function buildExportTable(title, rows, columns) {
  return `
    <html>
      <head><meta charset="utf-8" /></head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        ${buildTableMarkup(rows, columns)}
      </body>
    </html>
  `;
}

function buildPdfDocument(title, rows, columns) {
  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 28px; color: #172033; }
          h1 { color: #07133d; margin: 0 0 18px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #07133d; color: #fff; text-align: left; }
          th, td { border: 1px solid #d8dee9; padding: 8px; }
          tr:nth-child(even) td { background: #f8fafc; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        ${buildTableMarkup(rows, columns)}
      </body>
    </html>
  `;
}

function buildTableMarkup(rows, columns) {
  return `
    <table border="1">
      <thead>
        <tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(column.value(row))}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

function printHtmlDocument(html, onBlocked) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    onBlocked?.();
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  const print = () => {
    printWindow.focus();
    printWindow.print();
  };

  if (printWindow.document.readyState === "complete") {
    setTimeout(print, 250);
    return;
  }

  printWindow.onload = () => setTimeout(print, 250);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const subscriptionExportColumns = [
  { label: "Restaurant", value: (row) => row.restaurant_name },
  { label: "Tenant", value: (row) => row.restaurant_slug },
  { label: "Plan", value: (row) => row.plan },
  { label: "Montant", value: (row) => row.amount },
  { label: "Devise", value: (row) => row.currency },
  { label: "Statut", value: (row) => row.status },
  { label: "Renouvellement", value: (row) => row.renewal_date },
];

const platformExportColumns = [
  { label: "Service", value: (row) => row.label },
  { label: "Etat", value: (row) => row.value },
  { label: "Statut", value: (row) => row.status },
];

const paymentExportColumns = [
  { label: "Reference", value: (row) => row.reference },
  { label: "Restaurant", value: (row) => row.restaurant_name },
  { label: "Tenant", value: (row) => row.restaurant_slug },
  { label: "Montant", value: (row) => row.amount },
  { label: "Devise", value: (row) => row.currency },
  { label: "Statut", value: (row) => row.status },
  { label: "Date", value: (row) => formatDateTime(row.paid_at ?? row.due_date) },
  { label: "Methode", value: (row) => row.method },
];

const ownerExportColumns = [
  { label: "Restaurant", value: (row) => row.restaurant },
  { label: "Tenant", value: (row) => row.tenant },
  { label: "Email", value: (row) => row.email },
  { label: "Statut", value: (row) => row.status },
  { label: "Creation", value: (row) => formatDate(row.createdAt) },
];
