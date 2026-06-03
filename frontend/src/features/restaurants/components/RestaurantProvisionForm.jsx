import { DashboardIcon } from "@/components/dashboard/icons";

const restaurantFields = [
  ["name", "Nom du restaurant", "text", "Le Bon Coin"],
  ["slug", "Slug tenant", "text", "le-bon-coin"],
];

const ownerFields = [
  ["owner_first_name", "Prénom", "text", "Brice"],
  ["owner_last_name", "Nom", "text", "Mboule"],
  ["owner_phone", "Téléphone principal", "tel", "+237 6XX XXX XXX"],
  ["owner_alt_phone", "Téléphone secondaire", "tel", "+237 6XX XXX XXX"],
  ["owner_email", "Email", "email", "owner@restaurant.cm"],
  ["owner_username", "Identifiant", "text", "owner"],
  ["owner_password", "Mot de passe", "password", "Minimum 8 caractères"],
];

const optionalFields = new Set(["owner_email", "owner_alt_phone"]);

export function RestaurantProvisionForm({ value, onChange, onSubmit, isLoading }) {
  const requiredDone = [
    "name",
    "slug",
    "owner_first_name",
    "owner_last_name",
    "owner_phone",
    "owner_username",
    "owner_password",
  ].filter((field) => String(value[field] ?? "").trim()).length;
  const completion = Math.round((requiredDone / 7) * 100);

  return (
    <form onSubmit={onSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-[0_16px_50px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--dashboard-primary)]/20 bg-white px-3 text-xs font-black uppercase text-[var(--dashboard-primary)]">
                <DashboardIcon name="Store" size={15} />
                Nouveau tenant
              </div>
              <h2 className="mt-4 text-2xl font-black text-[var(--dashboard-secondary)]">
                Créer un restaurant
              </h2>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-500">
                Renseignez les informations nécessaires pour créer le tenant et le compte propriétaire.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-right">
              <p className="text-xs font-black uppercase text-slate-400">Progression</p>
              <p className="mt-1 text-2xl font-black text-[var(--dashboard-secondary)]">{completion}%</p>
            </div>
          </div>
        </div>

        <FormSection
          icon="Building2"
          title="Restaurant"
          description="Identité publique et tenant de la structure."
        >
          {restaurantFields.map((field) => (
            <ProvisionField key={field[0]} field={field} value={value} onChange={onChange} />
          ))}
        </FormSection>

        <FormSection
          icon="User"
          title="Propriétaire"
          description="Compte administrateur initial du restaurant."
        >
          {ownerFields.map((field) => (
            <ProvisionField
              key={field[0]}
              field={field}
              value={value}
              onChange={onChange}
              wide={field[0] === "owner_email"}
            />
          ))}
        </FormSection>
      </div>

      <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_16px_50px_rgba(15,23,42,0.05)]">
          <div className="border-b border-slate-200 bg-[var(--dashboard-secondary)] px-5 py-5 text-white">
            <p className="text-xs font-black uppercase text-[var(--dashboard-accent)]">Provisionnement</p>
            <h3 className="mt-2 text-lg font-black">Création automatique</h3>
          </div>

          <div className="space-y-4 p-5">
            <SummaryLine icon="Store" label="Tenant" value={value.name || "Nom à renseigner"} />
            <SummaryLine icon="Link" label="Slug" value={value.slug || "slug-à-renseigner"} />
            <SummaryLine
              icon="User"
              label="Propriétaire"
              value={`${value.owner_first_name || "Prénom"} ${value.owner_last_name || "Nom"}`}
            />
            <SummaryLine icon="Phone" label="Téléphone" value={value.owner_phone || "Obligatoire"} />
          </div>

          <div className="border-t border-slate-200 bg-slate-50 p-5">
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-[var(--dashboard-primary)] transition-all"
                style={{ width: `${completion}%` }}
              />
            </div>
            <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
              Une branche initiale sera créée et le propriétaire recevra le rôle administrateur.
            </p>
            <button
              type="submit"
              disabled={isLoading}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--dashboard-primary)] px-5 text-sm font-black text-white shadow-[0_14px_32px_rgba(15,23,42,0.16)] transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <DashboardIcon name="Plus" size={17} />
              {isLoading ? "Création..." : "Créer le restaurant"}
            </button>
          </div>
        </div>
      </aside>
    </form>
  );
}

function FormSection({ icon, title, description, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-[0_16px_50px_rgba(15,23,42,0.05)]">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--dashboard-primary)] text-white">
          <DashboardIcon name={icon} size={18} />
        </div>
        <div>
          <h3 className="text-lg font-black text-[var(--dashboard-secondary)]">{title}</h3>
          <p className="mt-1 text-sm font-medium text-slate-500">{description}</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function ProvisionField({ field, value, onChange, wide = false }) {
  const [name, label, type, placeholder] = field;
  const isOptional = optionalFields.has(name);
  const isPassword = type === "password";

  return (
    <label className={`block ${wide ? "md:col-span-2" : ""}`}>
      <span className="mb-2 flex items-center gap-1 text-sm font-black text-slate-900">
        {label}
        {!isOptional && <span className="text-[var(--dashboard-primary)]">*</span>}
        {isOptional && <span className="text-xs font-bold text-slate-400">(optionnel)</span>}
      </span>
      <input
        name={name}
        type={type}
        value={value[name] ?? ""}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={isPassword ? "new-password" : "off"}
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        data-lpignore={isPassword ? "true" : undefined}
        data-1p-ignore={isPassword ? "true" : undefined}
        data-form-type={isPassword ? "other" : undefined}
        required={!isOptional}
        minLength={name === "owner_password" ? 8 : undefined}
        pattern={name === "slug" ? "[a-z0-9-]+" : undefined}
        className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[var(--dashboard-primary)] focus:ring-4 focus:ring-[var(--dashboard-primary)]/10"
      />
    </label>
  );
}

function SummaryLine({ icon, label, value }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--dashboard-primary)]/10 text-[var(--dashboard-primary)]">
        <DashboardIcon name={icon} size={15} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase text-slate-400">{label}</p>
        <p className="mt-1 truncate text-sm font-bold text-slate-800">{value}</p>
      </div>
    </div>
  );
}
