import { useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { nextSort, SortButton, sortRows } from "@/utils/sort";

export function SuperadminOwners({ restaurants }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "createdAt", direction: "desc" });
  const owners = useMemo(
    () =>
      restaurants.map((restaurant) => ({
        id: restaurant.owner_id ?? restaurant.id,
        restaurant: restaurant.name,
        tenant: restaurant.slug,
        email: "owner à configurer",
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

  return (
    <AdminSurface
      eyebrow="Gestion des accès"
      title="Propriétaires"
      description="Suivez les comptes administrateurs propriétaires rattachés aux restaurants."
      actionLabel="Exporter"
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
              <TableAction label="Détails" />
            </td>
          </tr>
        ))}
      </DataTable>
    </AdminSurface>
  );
}

export function SuperadminSubscriptions({ restaurants }) {
  const [plan, setPlan] = useState("all");
  const [sort, setSort] = useState({ key: "restaurant", direction: "asc" });
  const rows = restaurants.map((restaurant, index) => ({
    id: restaurant.id,
    restaurant: restaurant.name,
    plan: index % 3 === 0 ? "Premium" : index % 3 === 1 ? "Standard" : "Essai",
    amount: index % 3 === 0 ? "49,000 FCFA" : index % 3 === 1 ? "29,000 FCFA" : "0 FCFA",
    status: restaurant.is_active ? "Actif" : "Suspendu",
    renewal: "17 Juin 2026",
  }));

  const filteredRows = rows.filter((row) => plan === "all" || row.plan === plan);
  const sortedRows = sortRows(filteredRows, sort, {
    restaurant: (row) => row.restaurant,
    plan: (row) => row.plan,
    amount: (row) => Number(String(row.amount).replace(/\D/g, "")),
    status: (row) => row.status,
    renewal: (row) => row.renewal,
  });

  return (
    <AdminSurface
      eyebrow="Monétisation"
      title="Abonnements"
      description="Pilotez les offres, statuts de souscription et renouvellements des restaurants."
      actionLabel="Nouvelle offre"
    >
      <Toolbar>
        <FilterSelect
          value={plan}
          onChange={setPlan}
          options={[
            ["all", "Tous les plans"],
            ["Premium", "Premium"],
            ["Standard", "Standard"],
            ["Essai", "Essai"],
          ]}
        />
        <Metric label="MRR estimé" value={`${rows.length * 29},000 FCFA`} />
        <Metric label="Souscriptions" value={rows.length} />
        <Metric label="Actives" value={rows.filter((row) => row.status === "Actif").length} />
      </Toolbar>

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
        emptyText="Les abonnements seront visibles après configuration des offres."
      >
        {sortedRows.map((row) => (
          <tr key={row.id} className="border-t border-[#eadfd7] hover:bg-[#fffaf5]">
            <td className="px-5 py-4 font-black text-[#07133d]">{row.restaurant}</td>
            <td className="px-5 py-4">
              <span className="bg-[#fff4ed] px-3 py-1 text-xs font-black text-[#9a3412]">
                {row.plan}
              </span>
            </td>
            <td className="px-5 py-4 font-bold text-[#172033]">{row.amount}</td>
            <td className="px-5 py-4">
              <StatusBadge status={row.status} />
            </td>
            <td className="px-5 py-4 font-semibold text-[#64708b]">{row.renewal}</td>
            <td className="px-5 py-4 text-right">
              <TableAction label="Gérer" />
            </td>
          </tr>
        ))}
      </DataTable>
    </AdminSurface>
  );
}

export function SuperadminPlatform({ restaurants }) {
  const active = restaurants.filter((restaurant) => restaurant.is_active).length;
  const checks = [
    ["API backend", "Opérationnel", "Actif"],
    ["Base de données", "Connectée", "Actif"],
    ["Provisioning restaurants", "Disponible", "Actif"],
    ["Paiements", "À connecter", "Attention"],
  ];

  return (
    <AdminSurface
      eyebrow="Supervision"
      title="Plateforme"
      description="Vue technique et opérationnelle de la plateforme SaaS."
      actionLabel="Journal système"
    >
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon="Store" label="Tenants" value={restaurants.length} />
        <MetricCard icon="Activity" label="Actifs" value={active} />
        <MetricCard icon="Users" label="Owners" value={restaurants.length} />
        <MetricCard icon="Cloud" label="Disponibilité" value="99.9%" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="border border-[#eadfd7] bg-white">
          <div className="border-b border-[#eadfd7] px-5 py-4">
            <h2 className="font-black text-[#07133d]">État des services</h2>
          </div>
          <div className="divide-y divide-[#eadfd7]">
            {checks.map(([label, value, status]) => (
              <div key={label} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="font-black text-[#07133d]">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-[#64708b]">{value}</p>
                </div>
                <StatusBadge status={status} />
              </div>
            ))}
          </div>
        </div>

        <div className="border border-[#eadfd7] bg-[#fffaf5] p-5">
          <h2 className="font-black text-[#07133d]">Capacité actuelle</h2>
          <div className="mt-5 space-y-4">
            <Progress label="Restaurants actifs" value={active} max={Math.max(restaurants.length, 1)} />
            <Progress label="Configuration paiement" value={35} max={100} suffix="%" />
            <Progress label="Sécurité" value={82} max={100} suffix="%" />
          </div>
        </div>
      </div>
    </AdminSurface>
  );
}

export function SuperadminSettings() {
  return (
    <AdminSurface
      eyebrow="Configuration"
      title="Paramètres"
      description="Définissez les règles globales de la plateforme, les notifications et la sécurité."
      actionLabel="Sauvegarder"
    >
      <div className="grid gap-5 xl:grid-cols-2">
        <SettingsPanel
          title="Identité plateforme"
          fields={[
            ["Nom de la plateforme", "Restaurant SaaS"],
            ["Email support", "support@restaurant.test"],
            ["Devise par défaut", "XAF"],
          ]}
        />
        <SettingsPanel
          title="Sécurité"
          fields={[
            ["Durée session", "720 minutes"],
            ["Création restaurant", "Superadmin uniquement"],
            ["Statut par défaut", "Actif"],
          ]}
        />
        <SettingsPanel
          title="Notifications"
          fields={[
            ["Email de bienvenue", "Activé"],
            ["Alerte nouveau tenant", "Activé"],
            ["Résumé hebdomadaire", "Désactivé"],
          ]}
        />
        <SettingsPanel
          title="Abonnements"
          fields={[
            ["Plan par défaut", "Essai"],
            ["Période d’essai", "14 jours"],
            ["Relance expiration", "7 jours avant"],
          ]}
        />
      </div>
    </AdminSurface>
  );
}

function AdminSurface({ eyebrow, title, description, actionLabel, children }) {
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
        <button className="h-11 bg-[#07133d] px-5 text-sm font-black text-white transition-all hover:bg-[#172554]">
          {actionLabel}
        </button>
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

function TableAction({ label }) {
  return (
    <button className="border border-[#eadfd7] px-3 py-1.5 text-xs font-black text-[#172033] hover:border-[#f04438] hover:text-[#f04438]">
      {label}
    </button>
  );
}

function SettingsPanel({ title, fields }) {
  return (
    <div className="border border-[#eadfd7] bg-white p-5">
      <h2 className="font-black text-[#07133d]">{title}</h2>
      <div className="mt-5 space-y-4">
        {fields.map(([label, value]) => (
          <label key={label} className="block">
            <span className="mb-2 block text-sm font-black text-[#172033]">{label}</span>
            <input
              value={value}
              readOnly
              className="h-11 w-full border border-[#eadfd7] bg-[#fffaf5] px-4 text-sm font-semibold text-[#64708b] outline-none"
            />
          </label>
        ))}
      </div>
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
