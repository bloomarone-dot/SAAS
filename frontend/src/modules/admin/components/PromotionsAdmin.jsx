import { useEffect, useState } from "react";

import { AdminCard, AdminKpis, AdminPage, EmptyState, Field, PrimaryAction, SecondaryAction, StatusPill, TableFooter } from "@/modules/admin/components/AdminUi";
import { apiFetch } from "@/config/http";

const PROMOTIONS_FALLBACK = "Action code promo impossible.";

function promotionsApi(path, options = {}) {
  const { fallback = PROMOTIONS_FALLBACK, ...rest } = options;
  return apiFetch(path, { fallback, ...rest });
}

const emptyPromo = {
  code: "",
  label: "",
  discount_type: "PERCENT",
  discount_value: "",
  min_order_amount: "0",
  max_discount_amount: "",
  max_uses: "",
  starts_at: "",
  ends_at: "",
  is_active: true,
};

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

export function PromotionsAdmin({ onMessage }) {
  const [promotions, setPromotions] = useState([]);
  const [form, setForm] = useState(emptyPromo);
  const [editingId, setEditingId] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadPromotions();
  }, []);

  async function loadPromotions() {
    setIsLoading(true);
    try {
      setPromotions(await promotionsApi("/api/v1/finance/promotions"));
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  function updateField(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  async function submitPromo(event) {
    event.preventDefault();
    setIsLoading(true);
    const payload = {
      ...form,
      code: form.code.trim().toUpperCase(),
      label: form.label.trim(),
      discount_value: Number(form.discount_value || 0),
      min_order_amount: Number(form.min_order_amount || 0),
      max_discount_amount: form.max_discount_amount ? Number(form.max_discount_amount) : null,
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      starts_at: form.starts_at ? `${form.starts_at}T00:00:00` : null,
      ends_at: form.ends_at ? `${form.ends_at}T23:59:59` : null,
    };
    try {
      const saved = await promotionsApi(editingId ? `/api/v1/finance/promotions/${editingId}` : "/api/v1/finance/promotions", {
        method: editingId ? "PATCH" : "POST",
        body: payload,
      });
      setPromotions((current) => editingId ? current.map((promo) => promo.id === saved.id ? saved : promo) : [saved, ...current]);
      setForm(emptyPromo);
      setEditingId("");
      onMessage(`Code promo ${saved.code} enregistré.`);
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  function editPromo(promo) {
    setEditingId(promo.id);
    setForm({
      code: promo.code,
      label: promo.label,
      discount_type: promo.discount_type,
      discount_value: String(promo.discount_value),
      min_order_amount: String(promo.min_order_amount),
      max_discount_amount: promo.max_discount_amount ? String(promo.max_discount_amount) : "",
      max_uses: promo.max_uses ? String(promo.max_uses) : "",
      starts_at: promo.starts_at ? promo.starts_at.slice(0, 10) : "",
      ends_at: promo.ends_at ? promo.ends_at.slice(0, 10) : "",
      is_active: promo.is_active,
    });
  }

  async function deletePromo(promo) {
    if (!window.confirm(`Archiver le code ${promo.code} ?\n\nLe code restera en base de données.`)) return;
    setIsLoading(true);
    try {
      await promotionsApi(`/api/v1/finance/promotions/${promo.id}`, { method: "DELETE" });
      setPromotions((current) => current.map((item) => (item.id === promo.id ? { ...item, is_active: false } : item)));
      onMessage(`Code promo ${promo.code} archivé.`);
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AdminPage
      eyebrow="Caisse"
      title="Codes promo"
    >
      <AdminKpis items={[
        { label: "Codes actifs", value: promotions.filter((promo) => promo.is_active).length, icon: "BadgePercent" },
        { label: "Codes utilisés", value: promotions.reduce((total, promo) => total + Number(promo.used_count || 0), 0), icon: "TrendingDown" },
        { label: "Remise fixe", value: promotions.filter((promo) => promo.discount_type === "FIXED").length, icon: "Wallet" },
        { label: "Remise %", value: promotions.filter((promo) => promo.discount_type === "PERCENT").length, icon: "Percent" },
      ]} />

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <AdminCard title={editingId ? "Modifier le code" : "Nouveau code promo"}>
          <form onSubmit={submitPromo} className="space-y-4">
            <Field name="code" label="Code" required value={form.code} onChange={updateField} placeholder="BIENVENUE" />
            <Field name="label" label="Libellé" required value={form.label} onChange={updateField} placeholder="Offre de lancement" />
            <Field label="Type de remise">
              <select name="discount_type" value={form.discount_type} onChange={updateField} className="form-control">
                <option value="PERCENT">Pourcentage</option>
                <option value="FIXED">Montant fixe</option>
              </select>
            </Field>
            <Field name="discount_value" label={form.discount_type === "PERCENT" ? "Valeur (%)" : "Montant"} required type="number" min="1" value={form.discount_value} onChange={updateField} />
            <Field name="min_order_amount" label="Minimum commande" type="number" min="0" value={form.min_order_amount} onChange={updateField} />
            <Field name="max_discount_amount" label="Remise maximale" type="number" min="0" value={form.max_discount_amount} onChange={updateField} />
            <Field name="max_uses" label="Nombre d'utilisations max" type="number" min="1" value={form.max_uses} onChange={updateField} />
            <div className="grid gap-3 md:grid-cols-2">
              <Field name="starts_at" label="Début" type="date" value={form.starts_at} onChange={updateField} />
              <Field name="ends_at" label="Fin" type="date" value={form.ends_at} onChange={updateField} />
            </div>
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-3 text-sm font-black text-slate-700">
              <input name="is_active" type="checkbox" checked={form.is_active} onChange={updateField} />
              Code actif
            </label>
            <div className="flex flex-wrap gap-2">
              <PrimaryAction icon="BadgePercent" type="submit" disabled={isLoading}>Enregistrer</PrimaryAction>
              {editingId && <SecondaryAction onClick={() => { setEditingId(""); setForm(emptyPromo); }}>Annuler</SecondaryAction>}
            </div>
          </form>
        </AdminCard>

        <AdminCard title="Liste des codes">
          <PromotionsTable rows={promotions} onEdit={editPromo} onDelete={deletePromo} />
        </AdminCard>
      </div>
    </AdminPage>
  );
}

function PromotionsTable({ rows, onEdit, onDelete }) {
  if (!rows.length) return <EmptyState icon="BadgePercent" title="Aucun code promo" text="Créez un premier code pour autoriser les remises contrôlées." />;
  return (
    <>
    <div className="overflow-x-auto">
      <table className="lte-table min-w-[860px]">
        <thead>
          <tr>
            <th className="py-3">Code</th>
            <th className="py-3">Remise</th>
            <th className="py-3">Conditions</th>
            <th className="py-3">Utilisations</th>
            <th className="py-3">Statut</th>
            <th className="py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((promo) => (
            <tr key={promo.id}>
              <td className="py-3">
                <p className="font-black text-slate-950">{promo.code}</p>
                <p className="text-xs font-semibold text-slate-500">{promo.label}</p>
              </td>
              <td className="py-3 font-black text-slate-900">
                {promo.discount_type === "PERCENT" ? `${promo.discount_value}%` : money(promo.discount_value)}
              </td>
              <td className="py-3 text-xs font-semibold text-slate-500">
                Min. {money(promo.min_order_amount)}
                {promo.max_discount_amount ? ` · Plafond ${money(promo.max_discount_amount)}` : ""}
              </td>
              <td className="py-3 font-semibold text-slate-600">{promo.used_count}{promo.max_uses ? ` / ${promo.max_uses}` : ""}</td>
              <td className="py-3"><StatusPill tone={promo.is_active ? "green" : "red"}>{promo.is_active ? "Actif" : "Inactif"}</StatusPill></td>
              <td className="py-3 text-right">
                <button type="button" onClick={() => onEdit(promo)} className="lte-btn lte-btn-default lte-btn-sm">Modifier</button>
                <button type="button" onClick={() => onDelete(promo)} className="ml-2 lte-btn lte-btn-danger lte-btn-sm">Supprimer</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <TableFooter count={rows.length} label="code promo" plural="codes promo" />
    </>
  );
}
