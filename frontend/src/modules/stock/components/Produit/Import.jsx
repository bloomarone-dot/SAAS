import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";

import { DashboardSection, SecondaryAction } from "@/modules/admin/components/AdminUi";
import { getApiBaseUrl } from "@/config/api";
import { getToken, refreshAccessToken, clearToken, SESSION_EXPIRED_EVENT } from "@/config/http";

async function downloadAuthenticated(path, filename) {
  const url = `${getApiBaseUrl()}${path}`;
  let token = getToken();
  let response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
  });
  if (response.status === 401) {
    try {
      token = await refreshAccessToken();
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
    } catch {
      clearToken();
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
      throw new Error("Session expirée, veuillez vous reconnecter.");
    }
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Téléchargement du modèle impossible.");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export function ProductImport({ onImport, busy = false }) {
  const inputRef = useRef(null);
  const [result, setResult] = useState(null);
  const [localBusy, setLocalBusy] = useState(false);
  const loading = busy || localBusy;

  async function handleTemplate(format) {
    setLocalBusy(true);
    try {
      const filename = format === "xlsx" ? "modele-import-stock.xlsx" : "modele-import-stock.csv";
      await downloadAuthenticated(`/api/v1/stock/products/import-template?format=${format}`, filename);
    } catch (error) {
      setResult({ message: error.message || "Téléchargement impossible.", errors: [] });
    } finally {
      setLocalBusy(false);
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setLocalBusy(true);
    setResult(null);
    try {
      const summary = await onImport?.(file);
      setResult(summary || null);
    } catch (error) {
      setResult({
        message: error.message || "Import impossible.",
        created: 0,
        updated: 0,
        entries: 0,
        errors: [],
      });
    } finally {
      setLocalBusy(false);
    }
  }

  const errors = Array.isArray(result?.errors) ? result.errors.slice(0, 20) : [];

  return (
    <DashboardSection
      title="Importer depuis Excel"
      description="Reprenez votre liste Excel (produits et quantités optionnelles). Téléchargez d'abord le modèle."
    >
      <div className="flex flex-wrap gap-2">
        <SecondaryAction type="button" disabled={loading} onClick={() => handleTemplate("csv")}>
          <Download size={15} />
          Modèle CSV
        </SecondaryAction>
        <SecondaryAction type="button" disabled={loading} onClick={() => handleTemplate("xlsx")}>
          <FileSpreadsheet size={15} />
          Modèle Excel
        </SecondaryAction>
        <SecondaryAction type="button" disabled={loading} onClick={() => inputRef.current?.click()}>
          <Upload size={15} />
          {loading ? "Import…" : "Importer un fichier"}
        </SecondaryAction>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <p className="mt-3 text-xs font-semibold text-slate-500">
        Colonnes : code, nom*, unite*, seuil_min, depot, quantite, prix_achat. Si quantité renseignée, le dépôt est obligatoire.
      </p>

      {result?.message && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800">
          {result.message}
          {(result.created != null || result.updated != null) && (
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Créés : {result.created ?? 0} · Mis à jour : {result.updated ?? 0} · Entrées stock : {result.entries ?? 0}
            </p>
          )}
        </div>
      )}

      {errors.length > 0 && (
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs font-semibold text-rose-700">
          {errors.map((error) => (
            <li key={`${error.line}-${error.message}`}>
              Ligne {error.line} : {error.message}
            </li>
          ))}
        </ul>
      )}
    </DashboardSection>
  );
}
