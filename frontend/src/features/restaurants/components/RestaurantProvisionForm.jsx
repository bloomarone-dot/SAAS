import { DashboardIcon } from "@/components/dashboard/icons";
import { validationFor } from "@/utils/validation";

const restaurantFields = [
  ["name", "Nom du restaurant", "text", "Le Bon Coin"],
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
  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.05)] lg:p-6">
      <div className="border-b border-slate-100 pb-5">
        <div>
          <h2 className="text-2xl font-black text-[var(--dashboard-secondary)]">
            Créer un restaurant
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-500">
            Renseignez le tenant et le compte administrateur propriétaire.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
        <FormSection
          icon="Building2"
          title="Restaurant"
          description="Identité publique et tenant."
        >
          {restaurantFields.map((field) => (
            <ProvisionField key={field[0]} field={field} value={value} onChange={onChange} wide />
          ))}
        </FormSection>

        <FormSection
          icon="User"
          title="Propriétaire"
          description="Compte administrateur initial."
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

      <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 md:flex-row md:items-center md:justify-between">
        <p className="text-sm font-semibold text-slate-500">
          Une branche initiale sera créée automatiquement avec ce propriétaire comme administrateur.
        </p>
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[var(--dashboard-primary)] px-5 text-sm font-black text-white shadow-[0_14px_32px_rgba(15,23,42,0.16)] transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <DashboardIcon name="Plus" size={17} />
          {isLoading ? "Création..." : "Créer le restaurant"}
        </button>
      </div>
    </form>
  );
}

function FormSection({ icon, title, description, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50/40 p-5">
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
        {...validationFor(name)}
        autoComplete={isPassword ? "new-password" : "off"}
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        data-lpignore={isPassword ? "true" : undefined}
        data-1p-ignore={isPassword ? "true" : undefined}
        data-form-type={isPassword ? "other" : undefined}
        required={!isOptional}
        className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[var(--dashboard-primary)] focus:ring-4 focus:ring-[var(--dashboard-primary)]/10"
      />
    </label>
  );
}
