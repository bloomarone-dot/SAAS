import { useState } from "react";
import { CheckCircle, Send } from "lucide-react";

const EMPTY = {
  restaurant_name: "",
  owner_name: "",
  owner_phone: "",
  owner_email: "",
  city: "",
  address: "",
  business_type: "",
  employees_count: "",
  message: "",
};

const inputClass =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export default function InstanceRequestForm({ apiBaseUrl }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function update(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = {
        ...form,
        owner_email: form.owner_email.trim() || null,
        employees_count: form.employees_count ? Number(form.employees_count) : null,
        city: form.city.trim() || null,
        address: form.address.trim() || null,
        business_type: form.business_type.trim() || null,
        message: form.message.trim() || null,
      };
      const response = await fetch(`${apiBaseUrl}/api/v1/platform/instance-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = Array.isArray(data?.detail) ? data.detail.map((d) => d.msg).join(" · ") : data?.detail;
        throw new Error(detail || "Envoi impossible. Réessayez.");
      }
      setDone(true);
      setForm(EMPTY);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle className="mx-auto mb-3 text-emerald-600" size={40} />
        <h3 className="text-xl font-black text-emerald-800">Demande envoyée !</h3>
        <p className="mt-2 text-sm font-medium text-emerald-700">
          Notre équipe va examiner votre demande et vous recontactera pour activer votre instance.
        </p>
        <button type="button" onClick={() => setDone(false)} className="mt-5 rounded-lg border border-emerald-300 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100">
          Faire une autre demande
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto grid max-w-2xl gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
      <Field label="Nom du restaurant" required name="restaurant_name" value={form.restaurant_name} onChange={update} />
      <Field label="Nom du propriétaire" required name="owner_name" value={form.owner_name} onChange={update} />
      <Field label="Téléphone" required name="owner_phone" value={form.owner_phone} onChange={update} />
      <Field label="Email" type="email" name="owner_email" value={form.owner_email} onChange={update} />
      <Field label="Ville" name="city" value={form.city} onChange={update} />
      <Field label="Type de restaurant" name="business_type" value={form.business_type} onChange={update} />
      <Field label="Adresse" name="address" value={form.address} onChange={update} />
      <Field label="Nombre d'employés" type="number" name="employees_count" value={form.employees_count} onChange={update} />
      <label className="md:col-span-2">
        <span className="mb-1.5 block text-xs font-black text-slate-700">Message / besoin spécifique</span>
        <textarea name="message" rows={3} value={form.message} onChange={update} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
      </label>
      {error && <p className="md:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="md:col-span-2 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60">
        <Send size={16} /> {busy ? "Envoi…" : "Demander mon instance"}
      </button>
    </form>
  );
}

function Field({ label, required, ...props }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black text-slate-700">{label} {required && <span className="text-red-500">*</span>}</span>
      <input {...props} required={required} className={inputClass} />
    </label>
  );
}
