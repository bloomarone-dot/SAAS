import { useEffect, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { PageHeader } from "@/modules/admin/components/AdminUi";
import { formatApiError } from "@/utils/network";
import { validationFor } from "@/utils/validation";

const emptySettings = {
  name: "",
  legal_name: "",
  subdomain: "",
  custom_domain: "",
  description: "",
  logo_url: "",
  cover_image_url: "",
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
  nui: "",
  tax_id: "",
  primary_color: "#E4572E",
  secondary_color: "#1F2937",
  accent_color: "#F59E0B",
  background_color: "#FFFFFF",
  text_color: "#0F172A",
  button_color: "#078D50",
  currency: "XAF",
  timezone: "Africa/Douala",
};

export function RestaurantSettingsAdmin({ apiBaseUrl, currentUser, onMessage, onThemeChange }) {
  const [restaurant, setRestaurant] = useState(null);
  const [form, setForm] = useState(emptySettings);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [deliveryAreas, setDeliveryAreas] = useState([]);
  const [areaForm, setAreaForm] = useState({ name: "", delivery_fee: "", average_delivery_minutes: "" });

  const token = localStorage.getItem("access_token");
  const canUpdate = currentUser?.is_owner;
  const fieldsDisabled = !canUpdate || !isEditing || isLoading;

  useEffect(() => {
    loadSettings();
  }, []);

  async function api(path, options = {}) {
    const fallback = options.fallback || "Action de configuration impossible.";
    const { fallback: _fallback, ...requestOptions } = options;
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...requestOptions,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(requestOptions.headers ?? {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(formatApiError(data.detail ?? data.message ?? data.error, fallback));
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
        subdomain: data.subdomain ?? data.slug ?? "",
        custom_domain: data.custom_domain ?? "",
        description: data.description ?? "",
        logo_url: data.logo_url ?? "",
        cover_image_url: data.cover_image_url ?? "",
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
        nui: data.nui ?? "",
        tax_id: data.tax_id ?? "",
        primary_color: data.primary_color ?? "#E4572E",
        secondary_color: data.secondary_color ?? "#1F2937",
        accent_color: data.accent_color ?? "#F59E0B",
        background_color: data.background_color ?? "#FFFFFF",
        text_color: data.text_color ?? "#0F172A",
        button_color: data.button_color ?? "#078D50",
        currency: data.currency ?? "XAF",
        timezone: data.timezone ?? "Africa/Douala",
      });
      onThemeChange?.({
        name: data.name,
        primary: data.primary_color ?? "#E4572E",
        secondary: data.secondary_color ?? "#1F2937",
      });
      loadDeliveryAreas();
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

  function updateAreaField(event) {
    const { name, value } = event.target;
    setAreaForm((current) => ({ ...current, [name]: value }));
  }

  async function loadDeliveryAreas() {
    try {
      setDeliveryAreas(await api("/api/v1/branches/delivery-areas"));
    } catch {
      setDeliveryAreas([]);
    }
  }

  async function createDeliveryArea(event) {
    event?.preventDefault?.();
    setIsLoading(true);
    try {
      const created = await api("/api/v1/branches/delivery-areas", {
        method: "POST",
        body: JSON.stringify({
          name: areaForm.name.trim(),
          delivery_fee: Number(areaForm.delivery_fee || 0),
          average_delivery_minutes: areaForm.average_delivery_minutes ? Number(areaForm.average_delivery_minutes) : null,
          is_active: true,
        }),
      });
      setDeliveryAreas((current) => [created, ...current]);
      setAreaForm({ name: "", delivery_fee: "", average_delivery_minutes: "" });
      onMessage("Quartier de livraison ajouté.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleDeliveryArea(area) {
    setIsLoading(true);
    try {
      const updated = await api(`/api/v1/branches/delivery-areas/${area.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !area.is_active }),
      });
      setDeliveryAreas((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      onMessage("Statut du quartier mis à jour.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    setIsLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        legal_name: optionalText(form.legal_name),
        subdomain: optionalText(form.subdomain),
        custom_domain: optionalText(form.custom_domain),
        description: optionalText(form.description),
        logo_url: optionalText(form.logo_url),
        cover_image_url: optionalText(form.cover_image_url),
        address: optionalText(form.address),
        city: optionalText(form.city),
        country: optionalText(form.country),
        postal_box: optionalText(form.postal_box),
        phone: optionalText(form.phone),
        whatsapp_phone: optionalText(form.whatsapp_phone),
        email: optionalText(form.email),
        opening_hours: optionalText(form.opening_hours),
        is_open: form.is_open,
        payment_methods: optionalText(form.payment_methods),
        delivery_fee: Number(form.delivery_fee || 0),
        website_url: optionalText(form.website_url),
        nui: optionalText(form.nui),
        tax_id: optionalText(form.tax_id),
        primary_color: form.primary_color,
        secondary_color: form.secondary_color,
        accent_color: form.accent_color,
        background_color: form.background_color,
        text_color: form.text_color,
        button_color: form.button_color,
        currency: form.currency.trim().toUpperCase(),
        timezone: form.timezone.trim(),
      };
      const updated = await api("/api/v1/restaurants/me/settings", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setRestaurant(updated);
      setIsEditing(false);
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
      if (!response.ok) throw new Error(formatApiError(data.detail, "Import du logo impossible."));
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
      <PageHeader
        eyebrow="Paramètres"
        title="Paramètres restaurant"
        subtitle="Gérez l’identité, les coordonnées, les reçus et les informations légales du restaurant."
      />

      {!canUpdate && (
        <div className="border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-700">
          Seul le propriétaire du restaurant peut modifier ces paramètres.
        </div>
      )}

      <form onSubmit={saveSettings} className="border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <h2 className="text-2xl font-black text-[#070528]">Informations restaurant</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Ces valeurs alimentent l’identité, les reçus et l’espace restaurant.
            </p>
          </div>
          {canUpdate && !isEditing ? (
            <button type="button" onClick={() => setIsEditing(true)} className="lte-btn lte-btn-primary">
              <DashboardIcon name="Pencil" size={17} />
              Modifier
            </button>
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#f04438] text-white">
              <DashboardIcon name="Settings" size={19} />
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-5 lg:grid-cols-2">
            <SettingsGroup title="Identité">
              <div className="grid gap-4 md:grid-cols-2">
                <Field name="name" label="Nom du restaurant" value={form.name} onChange={updateField} required disabled={fieldsDisabled} />
                <Field name="legal_name" label="Raison sociale" value={form.legal_name} onChange={updateField} disabled={fieldsDisabled} />
                <Field name="subdomain" label="Sous-domaine public" value={form.subdomain} onChange={updateField} placeholder="ex: leboncoin" disabled={fieldsDisabled} />
                <Field name="custom_domain" label="Domaine personnalisé" value={form.custom_domain} onChange={updateField} placeholder="ex: commande.restaurant.cm" disabled={fieldsDisabled} />
                <Field name="nui" label="NUI (Numéro d’identifiant unique)" value={form.nui} onChange={updateField} disabled={fieldsDisabled} />
                <Field name="tax_id" label="Registre de commerce / autre identifiant" value={form.tax_id} onChange={updateField} disabled={fieldsDisabled} />
                <Field name="currency" label="Devise" value={form.currency} onChange={updateField} maxLength={3} required disabled={fieldsDisabled} />
              </div>
              <label className="mt-4 block">
                <span className="text-xs font-black text-[#070528]">Description</span>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={updateField}
                  rows={3}
                  disabled={fieldsDisabled}
                  placeholder="Présentation courte du restaurant, spécialités, ambiance..."
                  className="mt-2 form-control disabled:bg-slate-50 disabled:text-slate-400"
                />
              </label>
            </SettingsGroup>

            <SettingsGroup title="Localisation">
              <div className="grid gap-4 md:grid-cols-2">
                <Field name="address" label="Adresse" value={form.address} onChange={updateField} disabled={fieldsDisabled} />
                <Field name="city" label="Ville" value={form.city} onChange={updateField} disabled={fieldsDisabled} />
                <Field name="country" label="Pays" value={form.country} onChange={updateField} disabled={fieldsDisabled} />
                <Field name="postal_box" label="Boîte postale" value={form.postal_box} onChange={updateField} disabled={fieldsDisabled} />
                <div className="md:col-span-2">
                  <Field name="timezone" label="Fuseau horaire" value={form.timezone} onChange={updateField} required disabled={fieldsDisabled} />
                </div>
              </div>
            </SettingsGroup>

            <SettingsGroup title="Contacts & vente">
              <div className="grid gap-4 md:grid-cols-2">
                <Field name="phone" label="Téléphone" value={form.phone} onChange={updateField} disabled={fieldsDisabled} />
                <Field name="whatsapp_phone" label="WhatsApp" value={form.whatsapp_phone} onChange={updateField} disabled={fieldsDisabled} />
                <Field name="email" label="Email public" type="email" value={form.email} onChange={updateField} disabled={fieldsDisabled} />
                <Field name="website_url" label="Site web" value={form.website_url} onChange={updateField} disabled={fieldsDisabled} />
                <Field name="opening_hours" label="Horaires d'ouverture" value={form.opening_hours} onChange={updateField} placeholder="Ex: Lun-Dim 09:00 - 22:00" disabled={fieldsDisabled} />
                <Field name="delivery_fee" label="Frais de livraison" type="number" min="0" value={form.delivery_fee} onChange={updateField} disabled={fieldsDisabled} />
                <div className="md:col-span-2">
                  <Field name="payment_methods" label="Modes de paiement" value={form.payment_methods} onChange={updateField} placeholder="Ex: Orange Money, MTN MoMo, Cash" disabled={fieldsDisabled} />
                </div>
              </div>
              <label className="mt-4 flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
                <input
                  name="is_open"
                  type="checkbox"
                  checked={form.is_open}
                  onChange={updateField}
                  disabled={fieldsDisabled}
                  className="h-5 w-5 accent-[#f04438]"
                />
                <span className="text-sm font-black text-[#070528]">
                  Restaurant ouvert aux commandes et visites
                </span>
              </label>
            </SettingsGroup>

            <SettingsGroup title="Quartiers de livraison">
              <div className="grid gap-3 md:grid-cols-[1fr_140px_140px_auto]">
                <Field name="name" label="Quartier" value={areaForm.name} onChange={updateAreaField} disabled={!canUpdate || isLoading} required />
                <Field name="delivery_fee" label="Frais" type="number" min="0" value={areaForm.delivery_fee} onChange={updateAreaField} disabled={!canUpdate || isLoading} required />
                <Field name="average_delivery_minutes" label="Délai min." type="number" min="1" value={areaForm.average_delivery_minutes} onChange={updateAreaField} disabled={!canUpdate || isLoading} />
                <button type="button" onClick={createDeliveryArea} disabled={!canUpdate || isLoading || !areaForm.name.trim()} className="mt-6 h-11 rounded bg-[#f04438] px-4 text-sm font-black text-white disabled:opacity-60">
                  Ajouter
                </button>
              </div>
              <div className="mt-4 divide-y divide-slate-200 border border-slate-200 bg-white">
                {deliveryAreas.map((area) => (
                  <div key={area.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div>
                      <p className="font-black text-[#070528]">{area.name}</p>
                      <p className="text-xs font-semibold text-slate-500">{Number(area.delivery_fee || 0).toLocaleString("fr-FR")} FCFA · {area.average_delivery_minutes || "-"} min</p>
                    </div>
                    <button type="button" onClick={() => toggleDeliveryArea(area)} disabled={!canUpdate || isLoading} className="rounded border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">
                      {area.is_active ? "Désactiver" : "Activer"}
                    </button>
                  </div>
                ))}
                {!deliveryAreas.length && <p className="px-4 py-6 text-center text-sm font-semibold text-slate-500">Aucun quartier configuré.</p>}
              </div>
            </SettingsGroup>

            <SettingsGroup title="Marque">
              <div className="grid gap-4 md:grid-cols-2">
                <Field name="logo_url" label="URL du logo" value={form.logo_url} onChange={updateField} disabled={fieldsDisabled} />
                <Field name="cover_image_url" label="Image de couverture" value={form.cover_image_url} onChange={updateField} placeholder="URL de l'image principale" disabled={fieldsDisabled} />
                <LogoUpload onChange={uploadLogo} disabled={fieldsDisabled} />
                <ColorField name="primary_color" label="Couleur principale" value={form.primary_color} onChange={updateField} disabled={fieldsDisabled} />
                <ColorField name="secondary_color" label="Couleur secondaire" value={form.secondary_color} onChange={updateField} disabled={fieldsDisabled} />
                <ColorField name="accent_color" label="Couleur accent" value={form.accent_color} onChange={updateField} disabled={fieldsDisabled} />
                <ColorField name="button_color" label="Boutons" value={form.button_color} onChange={updateField} disabled={fieldsDisabled} />
                <ColorField name="background_color" label="Fond vitrine" value={form.background_color} onChange={updateField} disabled={fieldsDisabled} />
                <ColorField name="text_color" label="Texte vitrine" value={form.text_color} onChange={updateField} disabled={fieldsDisabled} />
              </div>
            </SettingsGroup>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <div className="border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-[#070528]">Aperçu</h2>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    Prévisualisation rapide de l’identité restaurant.
                  </p>
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#fff4ed] text-[#f04438]">
                  <DashboardIcon name="Store" size={19} />
                </div>
              </div>

              <div className="mt-5 border border-slate-200 p-4">
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg text-xl font-black text-white"
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

                <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-xs font-black uppercase text-slate-400">Adresse publique</p>
                  <p className="mt-1 break-all text-sm font-black text-[#070528]">
                    {form.subdomain ? `${form.subdomain}.bloomarone.com` : "Sous-domaine non renseigné"}
                  </p>
                  {form.custom_domain && <p className="mt-1 break-all text-xs font-bold text-slate-500">{form.custom_domain}</p>}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Swatch label="Principale" value={form.primary_color} />
                  <Swatch label="Secondaire" value={form.secondary_color} />
                  <Swatch label="Accent" value={form.accent_color} />
                  <Swatch label="Boutons" value={form.button_color} />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={fieldsDisabled}
              className="lte-btn lte-btn-primary"
            >
              <DashboardIcon name="CheckCircle2" size={17} />
              Enregistrer les paramètres
            </button>
          </aside>
        </div>
      </form>
    </section>
  );
}

function optionalText(value) {
  const trimmed = typeof value === "string" ? value.trim() : value;
  return trimmed || null;
}

function SettingsGroup({ title, children }) {
  return (
    <section className="border border-slate-200 bg-slate-50/40 p-4">
      <h3 className="mb-4 text-sm font-black uppercase text-[#070528]">{title}</h3>
      {children}
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
        {...validationFor(props.name)}
        required={required}
        className="mt-2 form-control disabled:bg-slate-50 disabled:text-slate-400"
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
