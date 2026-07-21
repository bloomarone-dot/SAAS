import { useEffect, useState } from "react";
import { DashboardIcon } from "@/components/dashboard/icons";
import { validationFor } from "@/utils/validation";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_ACCEPT = "image/png,image/jpeg,image/webp";

const restaurantFields = [
  ["name", "Nom du restaurant", "text", "Mon Restaurant"],
  ["subdomain", "Sous-domaine", "text", "mon-restaurant"],
  ["cover_image_url", "Image de couverture", "url", "https://..."],
];

const colorFields = [
  ["primary_color", "Couleur principale"],
  ["secondary_color", "Couleur secondaire"],
  ["accent_color", "Couleur accent"],
  ["button_color", "Boutons"],
  ["background_color", "Fond vitrine"],
  ["text_color", "Texte vitrine"],
];

const ownerFields = [
  ["owner_first_name", "Prénom", "text", "Brice"],
  ["owner_last_name", "Nom", "text", "Mboule"],
  ["owner_phone", "Téléphone principal", "tel", "+237 6XX XXX XXX"],
  ["owner_alt_phone", "Téléphone secondaire", "tel", "+237 6XX XXX XXX"],
  ["owner_email", "Email", "email", "owner@restaurant.cm"],
  ["owner_username", "Identifiant", "text", "proprietaire-restaurant"],
  ["owner_password", "Mot de passe", "password", "8 caractères avec majuscule, chiffre et symbole"],
];

const optionalFields = new Set([
  "subdomain",
  "cover_image_url",
  "owner_first_name",
  "owner_email",
  "owner_alt_phone",
]);

export function RestaurantProvisionForm({
  value,
  onChange,
  onSubmit,
  isLoading,
  logoFile = null,
  logoPreviewUrl = "",
  onLogoFileChange,
  logoError = "",
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.05)] lg:p-6">
      <div className="border-b border-slate-100 pb-5">
        <div>
          <h2 className="text-2xl font-black text-[var(--dashboard-secondary)]">
            Créer un restaurant
          </h2>
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
          <LogoFileField
            file={logoFile}
            previewUrl={logoPreviewUrl}
            onChange={onLogoFileChange}
            error={logoError}
          />
          <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
            {colorFields.map(([name, label]) => (
              <ProvisionColorField
                key={name}
                name={name}
                label={label}
                value={value[name]}
                onChange={onChange}
              />
            ))}
          </div>
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

function LogoFileField({ file, previewUrl, onChange, error }) {
  return (
    <div className="md:col-span-2">
      <span className="mb-2 flex items-center gap-1 text-sm font-black text-slate-900">
        Logo du restaurant
        <span className="text-xs font-bold text-slate-400">(optionnel)</span>
      </span>
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {previewUrl ? (
            <img src={previewUrl} alt="Aperçu logo" className="h-full w-full object-cover" />
          ) : (
            <DashboardIcon name="Store" size={22} className="text-slate-300" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <input
            type="file"
            accept={LOGO_ACCEPT}
            onChange={onChange}
            className="w-full text-sm font-semibold text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-xs file:font-black file:text-emerald-700"
          />
          <p className="mt-2 text-xs font-semibold text-slate-500">
            PNG, JPG ou WEBP — max 2 Mo
            {file ? ` · ${file.name}` : ""}
          </p>
          {error && <p className="mt-1 text-xs font-bold text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function ProvisionColorField({ name, label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-slate-900">{label}</span>
      <div className="flex h-12 overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-[var(--dashboard-primary)] focus-within:ring-4 focus-within:ring-[var(--dashboard-primary)]/10">
        <input
          type="color"
          name={name}
          value={value || "#E4572E"}
          onChange={onChange}
          className="h-full w-14 border-0 bg-transparent p-1"
        />
        <input
          name={name}
          value={value || ""}
          onChange={onChange}
          className="min-w-0 flex-1 px-3 text-sm font-semibold text-slate-900 outline-none"
        />
      </div>
    </label>
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
        {...(validationFor(name) || {})}
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

/** Valide un fichier logo côté client. Retourne un message d'erreur ou "". */
export function validateLogoFile(file) {
  if (!file) return "";
  const allowed = new Set(["image/png", "image/jpeg", "image/webp"]);
  if (!allowed.has(file.type)) {
    return "Format invalide. Utilisez PNG, JPG ou WEBP.";
  }
  if (file.size > LOGO_MAX_BYTES) {
    return "Logo trop volumineux (max 2 Mo).";
  }
  return "";
}

/** Hook léger pour aperçu logo (révocation URL). */
export function useLogoPreview(file) {
  const [previewUrl, setPreviewUrl] = useState("");
  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return previewUrl;
}
