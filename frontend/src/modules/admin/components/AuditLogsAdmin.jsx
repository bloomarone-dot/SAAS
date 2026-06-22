import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { formatApiError } from "@/utils/network";

const actionLabels = {
  "order.update": "Commande modifiée",
  "order.status_update": "Statut commande",
  "order.delete": "Commande supprimée",
  "payment.validate": "Paiement validé",
  "receipt.print": "Reçu imprimé",
  "menu.category_create": "Catégorie carte créée",
  "menu.category_delete": "Catégorie carte supprimée",
  "menu.dish_create": "Plat carte créé",
  "menu.dish_update": "Plat carte modifié",
  "menu.dish_availability": "Disponibilité plat",
  "menu.dish_delete": "Plat carte supprimé",
  "branch.create": "Branche créée",
  "auth.login": "Connexion",
  "user.create": "Utilisateur créé",
  "user.update": "Utilisateur modifié",
  "user.status_update": "Statut utilisateur",
  "user.permissions_update": "Permissions modifiées",
  "user.delete": "Utilisateur supprimé",
  "stock.item_create": "Produit stock créé",
  "stock.item_update": "Produit stock modifié",
  "stock.movement_create": "Mouvement stock",
  "stock.damage_create": "Avarie stock",
  "stock.damage_account": "Avarie comptabilisée",
  "stock.recipe_link_create": "Recette liée",
  "stock.recipe_link_delete": "Recette supprimée",
  "stock.production_sheet_create": "Fiche production",
};

export function AuditLogsAdmin({ apiBaseUrl, onMessage }) {
  const [logs, setLogs] = useState([]);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadLogs();
  }, []);

  const actions = useMemo(() => [...new Set(logs.map((log) => log.action))].sort(), [logs]);
  const entityTypes = useMemo(() => [...new Set(logs.map((log) => log.entity_type))].sort(), [logs]);

  async function loadLogs() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const query = new URLSearchParams({ limit: "150" });
      if (action) query.set("action", action);
      if (entityType) query.set("entity_type", entityType);
      const response = await fetch(`${apiBaseUrl}/api/v1/audit-logs?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => []);
      if (!response.ok) throw new Error(formatApiError(data.detail, "Chargement des journaux impossible."));
      setLogs(data);
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
          <h1 className="mt-2 text-4xl font-black text-[#070528]">Journaux d'activité</h1>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <select value={action} onChange={(event) => setAction(event.target.value)} className="form-control">
          <option value="">Toutes les actions</option>
          {actions.map((item) => <option key={item} value={item}>{actionLabels[item] ?? item}</option>)}
        </select>
        <select value={entityType} onChange={(event) => setEntityType(event.target.value)} className="form-control">
          <option value="">Tous les objets</option>
          {entityTypes.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" onClick={loadLogs} className="h-12 rounded-lg border border-slate-200 px-5 text-sm font-black text-slate-700">
          Filtrer
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-sm font-black text-slate-500">Chargement des journaux...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-sm font-semibold text-slate-500">Aucune action enregistrée.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="lte-table min-w-[980px]">
              <thead>
                <tr>
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4">Action</th>
                  <th className="px-5 py-4">Utilisateur</th>
                  <th className="px-5 py-4">Objet</th>
                  <th className="px-5 py-4">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-semibold text-slate-500">{new Date(log.created_at).toLocaleString("fr-FR")}</td>
                    <td className="px-5 py-4">
                      <span className="rounded bg-red-50 px-2 py-1 text-xs font-black text-[#f04438]">{actionLabels[log.action] ?? log.action}</span>
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-700">{log.user_role ?? "-"}</td>
                    <td className="px-5 py-4 font-semibold text-slate-600">{log.entity_type} · {log.entity_id ?? "-"}</td>
                    <td className="px-5 py-4 font-semibold text-slate-700">{log.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
