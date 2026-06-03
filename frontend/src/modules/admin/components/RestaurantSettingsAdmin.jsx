import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";

const emptySettings = {
  name: "",
  legal_name: "",
  description: "",
  logo_url: "",
  address: "",
  city: "",
  country: "",
  postal_box: "",
  phone: "",
  whatsapp_phone: "",
  email: "",
  opening_hours: "",
  is_open: true,
  payment_methods: "",
  delivery_fee: "",
  website_url: "",
  tax_id: "",
  primary_color: "#E4572E",
  secondary_color: "#1F2937",
  currency: "XAF",
  timezone: "Africa/Douala",
};

export function RestaurantSettingsAdmin({ apiBaseUrl, currentUser, onMessage, onThemeChange }) {
  const [restaurant, setRestaurant] = useState(null);
  const [form, setForm] = useState(emptySettings);
  const [isLoading, setIsLoading] = useState(false);

  const token = localStorage.getItem("access_token");
  const canUpdate = currentUser?.is_owner;

  const stats = useMemo(
    () => [
      { label: "Devise", value: form.currency || "-", icon: "Wallet" },
      { label: "Ville", value: form.city || "-", icon: "MapPin" },
      { label: "Contact", value: form.whatsapp_phone || form.phone || form.email || "-", icon: "Phone" },
      { label: "Ouverture", value: form.is_open ? "Ouvert" : "Fermé", icon: "CheckCircle2" },
    ],
    [form.city, form.currency, form.email, form.is_open, form.phone, form.whatsapp_phone]
  );

  useEffect(() => {
    loadSettings();
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
    if (!response.ok) throw new Error(data.detail ?? "Opération impossible.");
    return data;
  }

  async function loadSettings() {
    setIsLoading(true);
    try {
      const data = await api("/api/v1/restaurants/me");
      setRestaurant(data);
      setForm({
        name: data.name ?? "",
        legal_name: data.legal_name ?? "",
        description: data.description ?? "",
        logo_url: data.logo_url ?? "",
        address: data.address ?? "",
        city: data.city ?? "",
        country: data.country ?? "",
        postal_box: data.postal_box ?? "",
        phone: data.phone ?? "",
        whatsapp_phone: data.whatsapp_phone ?? "",
        email: data.email ?? "",
        opening_hours: data.opening_hours ?? "",
        is_open: data.is_open ?? true,
        payment_methods: data.payment_methods ?? "",
        delivery_fee: String(data.delivery_fee ?? 0),
        website_url: data.website_url ?? "",
        tax_id: data.tax_id ?? "",
        primary_color: data.primary_color ?? "#E4572E",
        secondary_color: data.secondary_color ?? "#1F2937",
        currency: data.currency ?? "XAF",
        timezone: data.timezone ?? "Africa/Douala",
      });
      onThemeChange?.({
        name: data.name,
        primary: data.primary_color ?? "#E4572E",
        secondary: data.secondary_color ?? "#1F2937",
      });
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  function updateField(event) {
    const { name, type, checked, value } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  async function saveSettings(event) {
    event.preventDefault();
    setIsLoading(true);
    try {
      const payload = {
        name: form.name,
        legal_name: form.legal_name || null,
        description: form.description || null,
        logo_url: form.logo_url || null,
        address: form.address || null,
        city: form.city || null,
        country: form.country || null,
        postal_box: form.postal_box || null,
        phone: form.phone || null,
        whatsapp_phone: form.whatsapp_phone || null,
        email: form.email || null,
        opening_hours: form.opening_hours || null,
        is_open: form.is_open,
        payment_methods: form.payment_methods || null,
        delivery_fee: Number(form.delivery_fee || 0),
        website_url: form.website_url || null,
        tax_id: form.tax_id || null,
        primary_color: form.primary_color,
        secondary_color: form.secondary_color,
        currency: form.currency.toUpperCase(),
        timezone: form.timezone,
      };
      const updated = await api("/api/v1/restaurants/me/settings", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setRestaurant(updated);
      onThemeChange?.({
        name: updated.name,
        primary: updated.primary_color ?? "#E4572E",
        secondary: updated.secondary_color ?? "#1F2937",
      });
      onMessage("Informations du restaurant mises à jour.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function uploadLogo(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${apiBaseUrl}/api/v1/restaurants/me/logo`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail ?? "Import du logo impossible.");
      setRestaurant(data);
      setForm((current) => ({ ...current, logo_url: data.logo_url ?? "" }));
      onMessage("Logo du restaurant importé.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      event.target.value = "";
      setIsLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-[#f04438]">Administration restaurant</p>
          <h1 className="mt-2 text-4xl font-black text-[#070528]">Paramètres restaurant</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">
            Renseignez l’identité, la localisation, les contacts, le logo, la devise et les couleurs du restaurant.
          </p>
        </div>
        <button
          type="button"
          onClick={loadSettings}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm transition-all hover:border-[#f04438] hover:text-[#f04438]"
        >
          <DashboardIcon name="Activity" size={17} />
          Actualiser
        </button>
      </div>

      {!canUpdate && (
        <div className="border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-700">
          Seul le propriétaire du restaurant peut modifier ces paramètres.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((item) => (
          <div key={item.label} className="border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#fff4ed] text-[#f04438]">
              <DashboardIcon name={item.icon} size={19} />
            </div>
            <p className="mt-5 text-sm font-bold text-slate-500">{item.label}</p>
            <p className="mt-1 truncate text-2xl font-black text-[#070528]">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={saveSettings} className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-[#070528]">Informations restaurant</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Ces valeurs alimentent l’identité, les reçus et l’espace restaurant.
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#f04438] text-white">
              <DashboardIcon name="Settings" size={19} />
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field name="name" label="Nom du restaurant" value={form.name} onChange={updateField} required disabled={!canUpdate || isLoading} />
            <Field name="legal_name" label="Raison sociale" value={form.legal_name} onChange={updateField} disabled={!canUpdate || isLoading} />
            <Field name="currency" label="Devise" value={form.currency} onChange={updateField} maxLength={3} required disabled={!canUpdate || isLoading} />
            <Field name="timezone" label="Fuseau horaire" value={form.timezone} onChange={updateField} required disabled={!canUpdate || isLoading} />
            <Field name="phone" label="Téléphone" value={form.phone} onChange={updateField} disabled={!canUpdate || isLoading} />
            <Field name="whatsapp_phone" label="WhatsApp" value={form.whatsapp_phone} onChange={updateField} disabled={!canUpdate || isLoading} />
            <Field name="email" label="Email public" type="email" value={form.email} onChange={updateField} disabled={!canUpdate || isLoading} />
            <Field name="address" label="Adresse" value={form.address} onChange={updateField} disabled={!canUpdate || isLoading} />
            <Field name="city" label="Ville" value={form.city} onChange={updateField} disabled={!canUpdate || isLoading} />
            <Field name="country" label="Pays" value={form.country} onChange={updateField} disabled={!canUpdate || isLoading} />
            <Field name="postal_box" label="Boîte postale" value={form.postal_box} onChange={updateField} disabled={!canUpdate || isLoading} />
            <Field name="opening_hours" label="Horaires d'ouverture" value={form.opening_hours} onChange={updateField} placeholder="Ex: Lun-Dim 09:00 - 22:00" disabled={!canUpdate || isLoading} />
            <Field name="payment_methods" label="Modes de paiement" value={form.payment_methods} onChange={updateField} placeholder="Ex: Orange Money, MTN MoMo, Cash" disabled={!canUpdate || isLoading} />
            <Field name="delivery_fee" label="Frais de livraison" type="number" min="0" value={form.delivery_fee} onChange={updateField} disabled={!canUpdate || isLoading} />
            <Field name="website_url" label="Site web" value={form.website_url} onChange={updateField} disabled={!canUpdate || isLoading} />
            <Field name="tax_id" label="Identifiant fiscal / registre" value={form.tax_id} onChange={updateField} disabled={!canUpdate || isLoading} />
            <Field name="logo_url" label="URL du logo" value={form.logo_url} onChange={updateField} disabled={!canUpdate || isLoading} />
            <LogoUpload onChange={uploadLogo} disabled={!canUpdate || isLoading} />
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 md:col-span-2">
              <input
                name="is_open"
                type="checkbox"
                checked={form.is_open}
                onChange={updateField}
                disabled={!canUpdate || isLoading}
                className="h-5 w-5 accent-[#f04438]"
              />
              <span className="text-sm font-black text-[#070528]">
                Restaurant ouvert aux commandes et visites
              </span>
            </label>
            <label className="block md:col-span-2">
              <span className="text-xs font-black text-[#070528]">Description</span>
              <textarea
                name="description"
                value={form.description}
                onChange={updateField}
                rows={3}
                disabled={!canUpdate || isLoading}
                placeholder="Présentation courte du restaurant, spécialités, ambiance..."
                className="mt-2 w-full border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none transition-all placeholder:text-slate-400 focus:border-[#f04438] focus:ring-4 focus:ring-[#fee4e2] disabled:bg-slate-50 disabled:text-slate-400"
              />
            </label>
            <ColorField name="primary_color" label="Couleur principale" value={form.primary_color} onChange={updateField} disabled={!canUpdate || isLoading} />
            <ColorField name="secondary_color" label="Couleur secondaire" value={form.secondary_color} onChange={updateField} disabled={!canUpdate || isLoading} />
          </div>

          <button
            type="submit"
            disabled={!canUpdate || isLoading}
            className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#f04438] px-5 text-sm font-black text-white shadow-lg shadow-[#fecdca] transition-all hover:bg-[#d92d20] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <DashboardIcon name="CheckCircle2" size={17} />
            Enregistrer les paramètres
          </button>
        </form>

        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-[#070528]">Aperçu</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Prévisualisation rapide de l’identité restaurant.
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#fff4ed] text-[#f04438]">
              <DashboardIcon name="Store" size={19} />
            </div>
          </div>

          <div className="mt-6 border border-slate-200 p-5">
            <div className="flex items-center gap-4">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-lg text-xl font-black text-white"
                style={{ backgroundColor: form.primary_color || "#E4572E" }}
              >
                {form.logo_url ? (
                  <img src={form.logo_url} alt="" className="h-full w-full rounded-lg object-cover" />
                ) : (
                  form.name?.[0] ?? "R"
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xl font-black text-[#070528]">{form.name || "Nom du restaurant"}</p>
                <p className="mt-1 text-sm font-bold text-slate-500">{form.city || "Ville"} · {form.currency || "XAF"}</p>
              </div>
            </div>

            <div className="mt-5 space-y-2 border-t border-slate-100 pt-5 text-sm font-semibold text-slate-600">
              <PreviewLine icon="MapPin" value={[form.address, form.city, form.country].filter(Boolean).join(", ") || "Adresse non renseignée" } />
              <PreviewLine icon="Phone" value={form.phone || "Téléphone non renseigné"} />
              <PreviewLine icon="FileText" value={form.postal_box ? `BP ${form.postal_box}` : "Boîte postale non renseignée"} />
              <PreviewLine icon="Chrome" value={form.website_url || "Site web non renseigné"} />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <Swatch label="Principale" value={form.primary_color} />
              <Swatch label="Secondaire" value={form.secondary_color} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, required, ...props }) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[#070528]">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <input
        {...props}
        required={required}
        className="mt-2 h-11 w-full border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition-all placeholder:text-slate-400 focus:border-[#f04438] focus:ring-4 focus:ring-[#fee4e2] disabled:bg-slate-50 disabled:text-slate-400"
      />
    </label>
  );
}

function ColorField({ label, name, value, onChange, disabled }) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[#070528]">{label}</span>
      <div className="mt-2 flex h-11 border border-slate-200 bg-white focus-within:border-[#f04438] focus-within:ring-4 focus-within:ring-[#fee4e2]">
        <input
          type="color"
          name={name}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="h-full w-14 border-0 bg-transparent p-1 disabled:opacity-50"
        />
        <input
          name={name}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="min-w-0 flex-1 px-3 text-sm font-semibold outline-none disabled:bg-slate-50 disabled:text-slate-400"
        />
      </div>
    </label>
  );
}

function LogoUpload({ onChange, disabled }) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[#070528]">Importer le logo</span>
      <div className="mt-2 flex h-11 items-center border border-slate-200 bg-white px-3">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={onChange}
          disabled={disabled}
          className="w-full text-sm font-semibold text-slate-600 file:mr-3 file:border-0 file:bg-[#fff4ed] file:px-3 file:py-1.5 file:text-xs file:font-black file:text-[#f04438] disabled:text-slate-400"
        />
      </div>
    </label>
  );
}

function PreviewLine({ icon, value }) {
  return (
    <div className="flex items-center gap-2">
      <DashboardIcon name={icon} size={15} className="shrink-0 text-[#f04438]" />
      <span className="min-w-0 truncate">{value}</span>
    </div>
  );
}

function Swatch({ label, value }) {
  return (
    <div className="border border-slate-200 p-3">
      <div className="h-10 rounded" style={{ backgroundColor: value || "#E4572E" }} />
      <p className="mt-3 text-xs font-black uppercase text-slate-400">{label}</p>
      <p className="text-sm font-black text-[#070528]">{value}</p>
    </div>
  );
}
