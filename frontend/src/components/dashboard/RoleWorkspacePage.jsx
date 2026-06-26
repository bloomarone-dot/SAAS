import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "./icons";
import { apiFetch } from "@/config/http";
import { EmptyState, PrimaryAction, SearchBox, SecondaryAction, StatusPill } from "@/modules/admin/components/AdminUi";

const money = (value, currency = "FCFA") => `${Number(value || 0).toLocaleString("fr-FR")} ${currency}`;

const roleCopy = {
  SUPERADMIN: "Plateforme multi-restaurants",
  ADMIN: "Pilotage restaurant",
  MANAGER: "Supervision opérationnelle",
  SERVEUR: "Service en salle",
  CUISINE: "Production cuisine",
  CAISSE: "Encaissement",
  STOCK: "Gestion stock",
  COMPTABLE: "Finance et comptabilité",
};

const pageMeta = {
  "create-restaurant": ["Création restaurant", "Provisionnez un nouveau tenant avec propriétaire, plan et paramètres initiaux.", "Créer le restaurant"],
  "restaurant-detail": ["Détail restaurant", "Suivez l’état du tenant, son abonnement, son propriétaire et son activité récente.", "Suspendre / activer"],
  activation: ["Activation / suspension", "Contrôlez l’accès des restaurants à la plateforme SaaS.", "Appliquer le statut"],
  payments: ["Paiements SaaS", "Analysez les règlements, factures et statuts d’abonnement.", "Exporter"],
  stats: ["Statistiques globales", "Comparez la croissance, les revenus récurrents et la santé de la plateforme.", "Exporter"],
  activity: ["Journal d’activité", "Consultez les événements critiques et filtrez par utilisateur, action ou période.", "Exporter"],
  "activity-log": ["Journal d’activité", "Consultez les événements du restaurant avec filtres et traçabilité.", "Exporter"],
  users: ["Gestion utilisateurs", "Administrez les comptes, rôles, permissions et accès opérationnels.", "Nouvel utilisateur"],
  "create-user": ["Création utilisateur", "Créez un collaborateur avec rôle, coordonnées, sécurité et accès.", "Créer l’utilisateur"],
  "user-detail": ["Détail / modification utilisateur", "Modifiez le profil, le rôle, les permissions et le statut du compte.", "Enregistrer"],
  roles: ["Rôles et permissions", "Contrôlez les droits par métier sans toucher à la logique métier.", "Enregistrer"],
  branches: ["Gestion branches", "Suivez vos points de vente, responsables et performances.", "Nouvelle branche"],
  "create-branch": ["Création branche", "Ajoutez un point de vente avec horaires, adresse et responsable.", "Créer la branche"],
  "create-category": ["Création catégorie", "Structurez la carte avec des catégories propres et visibles.", "Créer la catégorie"],
  "create-dish": ["Création plat", "Définissez prix, disponibilité, ingrédients et aperçu commercial.", "Créer le plat"],
  availability: ["Disponibilité des plats", "Activez ou désactivez les plats selon le stock et le service.", "Mettre à jour"],
  "order-detail": ["Détail commande", "Visualisez les articles, notes, statut, paiement et actions autorisées.", "Mettre à jour"],
  "edit-order": ["Modification / annulation commande", "Corrigez une commande avant validation finale ou annulez avec motif.", "Enregistrer"],
  receipts: ["Reçus / factures", "Retrouvez les reçus imprimables, factures et exports.", "Imprimer"],
  expenses: ["Dépenses", "Suivez charges, fournisseurs, salaires, loyers et dépenses variables.", "Nouvelle dépense"],
  purchases: ["Achats", "Planifiez et contrôlez les achats liés au restaurant.", "Nouvel achat"],
  reports: ["Vue rapports", "Centralisez les ventes, bénéfices, équipes et indicateurs du restaurant.", "Exporter"],
  "sales-report": ["Rapports ventes", "Analysez le chiffre d’affaires, les commandes et le panier moyen.", "Exporter"],
  "profit-report": ["Rapports bénéfices", "Comparez recettes, coûts, marges et bénéfices par période.", "Exporter"],
  "server-report": ["Rapports serveurs", "Mesurez les performances par serveur, table et période.", "Exporter"],
  "kitchen-followup": ["Suivi cuisine", "Contrôlez la charge, les retards, les urgences et les commandes prêtes.", "Vue Kanban"],
  "service-followup": ["Suivi service en salle", "Supervisez les tables, affectations et commandes à servir.", "Affecter"],
  "table-assignment": ["Affectation serveur / table", "Répartissez les tables et équilibrez la charge de l’équipe.", "Affecter"],
  team: ["Équipe active", "Visualisez les membres en poste, pauses, retards et zones couvertes.", "Gérer l’équipe"],
  alerts: ["Alertes opérationnelles", "Centralisez les incidents, retards, ruptures et priorités du service.", "Traiter"],
  "daily-report": ["Rapports journaliers", "Synthèse de la journée: ventes, incidents, équipe et cuisine.", "Exporter"],
  "service-performance": ["Performance service", "Suivez temps de service, satisfaction, tables et panier moyen.", "Exporter"],
  "kitchen-performance": ["Performance cuisine", "Analysez temps de préparation, retards et charge par poste.", "Exporter"],
  "open-table": ["Ouverture table", "Démarrez une session table avec nombre de couverts et serveur assigné.", "Ouvrir"],
  "new-table-order": ["Création commande sur table", "Composez une commande structurée avec catalogue et panier.", "Envoyer"],
  "add-order-items": ["Ajout plats à commande", "Ajoutez, modifiez les quantités et vérifiez les disponibilités.", "Ajouter"],
  "send-kitchen": ["Envoi commande en cuisine", "Contrôlez les notes et envoyez les préparations au bon poste.", "Envoyer en cuisine"],
  "order-status": ["Suivi statut commande", "Suivez les étapes de production jusqu’au service.", "Actualiser"],
  "ready-notifications": ["Notification commande prête", "Recevez les commandes prêtes et marquez-les comme servies.", "Marquer servie"],
  "served-orders": ["Marquer commande servie", "Validez le service et libérez le flux vers la caisse.", "Marquer servie"],
  "request-bill": ["Demander addition", "Préparez la facture proforma et notifiez la caisse.", "Demander addition"],
  "free-table": ["Libération table", "Clôturez la session, nettoyez l’état table et archivez la commande.", "Libérer"],
  "served-clients": ["Clients servis", "Consultez les clients et tables servis par période.", "Exporter"],
  "kitchen-detail": ["Détail commande cuisine", "Affichez les articles, notes client, priorités et historique cuisine.", "Marquer prêt"],
  notes: ["Notes spéciales client", "Centralisez allergies, préférences et consignes de préparation.", "Confirmer"],
  "start-preparation": ["Passer commande en préparation", "Démarrez la production et estimez le temps restant.", "Démarrer"],
  "dish-ready": ["Marquer plat prêt", "Validez les plats terminés avant assemblage commande.", "Marquer prêt"],
  "order-ready": ["Marquer commande prête", "Prévenez le service quand toute la commande est prête.", "Notifier"],
  urgent: ["Commandes urgentes", "Priorisez les commandes en retard ou à fort impact salle.", "Traiter"],
  "preparation-history": ["Historique préparations", "Analysez les préparations, retards et incidents cuisine.", "Exporter"],
  "dish-unavailable": ["Signalement plat indisponible", "Déclarez une rupture avec motif et durée estimée.", "Signaler"],
  damages: ["Enregistrement avarie", "Enregistrez les pertes, casse ou produits périmés.", "Enregistrer"],
  "unpaid-orders": ["Commandes non payées", "Retrouvez les commandes prêtes à encaisser avec filtres.", "Encaisser"],
  "cash-order-detail": ["Détail commande à encaisser", "Appliquez remises autorisées et validez le mode de paiement.", "Valider paiement"],
  discounts: ["Application remise autorisée", "Contrôlez les remises avec motif et utilisateur autorisé.", "Appliquer"],
  "payment-method": ["Choix mode paiement", "Sélectionnez espèces, Mobile Money ou carte.", "Continuer"],
  cash: ["Encaissement espèces", "Saisissez montant reçu et monnaie à rendre.", "Valider espèces"],
  mobile: ["Encaissement Mobile Money", "Saisissez référence opérateur et numéro client.", "Valider Mobile Money"],
  card: ["Encaissement carte", "Validez la transaction carte et référence terminal.", "Valider carte"],
  "payment-validation": ["Validation paiement", "Confirmez l’encaissement et générez le reçu.", "Valider"],
  "print-receipt": ["Impression reçu", "Aperçu et impression du reçu client.", "Imprimer"],
  "cancel-payment": ["Annulation paiement incorrect", "Annulez un paiement avec motif et journalisation.", "Annuler paiement"],
  "cash-closing": ["Clôture de caisse", "Contrôlez les totaux, écarts et modes de paiement.", "Clôturer"],
  "cash-report": ["Rapport de caisse", "Analysez les encaissements par mode de paiement.", "Exporter"],
  "payment-totals": ["Totaux par mode de paiement", "Comparez espèces, Mobile Money et carte.", "Exporter"],
  "payment-history": ["Historique encaissements", "Retrouvez tous les paiements avec filtres.", "Exporter"],
  "create-stock-product": ["Création produit stock", "Ajoutez un produit avec unité, seuil et prix d’achat.", "Créer produit"],
  "stock-in": ["Entrée stock", "Enregistrez une livraison ou un achat stock.", "Enregistrer"],
  "stock-out": ["Sortie stock", "Déduisez les consommations cuisine, bar ou pertes.", "Enregistrer"],
  transfer: ["Transfert entre rayons", "Transférez magasin, cuisine et boisson avec traçabilité.", "Transférer"],
  inventory: ["Ajustement inventaire", "Corrigez les écarts physiques avec justification.", "Ajuster"],
  thresholds: ["Seuil d’alerte", "Configurez les minimums et alertes par produit.", "Enregistrer"],
  "low-stock": ["Alertes stock faible", "Priorisez les produits sous seuil et ruptures.", "Commander"],
  suppliers: ["Fournisseurs", "Gérez les fournisseurs, contacts et derniers achats.", "Nouveau fournisseur"],
  "stock-purchases": ["Achats stock", "Suivez les bons d’achat, livraisons et factures.", "Nouvel achat"],
  production: ["Fiche de production", "Reliez les recettes aux sorties d’ingrédients.", "Créer fiche"],
  ingredients: ["Liaison ingrédients / plats", "Associez ingrédients, quantités et coûts aux plats vendables.", "Lier"],
  movements: ["Mouvements stock", "Tracez entrées, sorties, transferts et ajustements.", "Exporter"],
  rotation: ["Rotation stock", "Identifiez produits dormants, rapides et dates critiques.", "Analyser"],
  "stock-report": ["Rapport stock", "Valorisez le stock par période et catégorie.", "Exporter"],
  "period-summary": ["État récapitulatif par période", "Filtrez et exportez les indicateurs consolidés.", "Exporter"],
  revenue: ["Recettes", "Suivez les recettes comptables et sources de revenus.", "Nouveau paiement"],
  margins: ["Marges par plat", "Mesurez coûts, prix de revient et marge par plat.", "Exporter"],
  profits: ["Bénéfices par période", "Comparez bénéfices nets par jour, semaine ou mois.", "Exporter"],
  "received-payments": ["Paiements reçus", "Contrôlez les encaissements validés et rapprochés.", "Exporter"],
  "cash-collections": ["Encaissements caisse", "Rapprochez caisse, modes de paiement et tickets.", "Rapprocher"],
  "counted-damages": ["Avaries comptabilisées", "Valorisez les pertes et leur impact sur la marge.", "Exporter"],
  "stock-valuation": ["Stock valorisé", "Valorisez inventaire, coûts et emplacements.", "Exporter"],
  income: ["Compte de résultat", "Synthèse revenus, coûts, charges et résultat net.", "Exporter"],
  cashflow: ["Flux de trésorerie", "Analyse des encaissements, décaissements et solde.", "Exporter"],
  balance: ["Bilan", "Vue simplifiée actif, passif et capitaux propres.", "Exporter"],
  ledger: ["Grand livre", "Suivez les écritures comptables et justificatifs.", "Exporter"],
  "financial-report": ["Rapport financier", "Regroupez compte de résultat, trésorerie et bilan.", "Exporter"],
  profile: ["Profil utilisateur", "Gérez vos informations personnelles et coordonnées.", "Modifier"],
  notifications: ["Centre de notifications", "Consultez commandes, paiements, stock et alertes système.", "Tout marquer comme lu"],
  search: ["Recherche globale", "Recherchez commandes, clients, produits et documents.", "Rechercher"],
  account: ["Paramètres compte", "Sécurité, préférences, notifications et sessions actives.", "Enregistrer"],
  denied: ["Accès refusé", "Vous n’avez pas les autorisations nécessaires pour cette page.", "Retour tableau de bord"],
  network: ["Erreur réseau", "Impossible de joindre le serveur. Vérifiez votre connexion.", "Réessayer"],
  offline: ["Mode hors ligne / synchronisation", "Suivez les données en attente de synchronisation.", "Synchroniser"],
  invoice: ["Impression facture", "Aperçu facture avant impression ou export.", "Imprimer"],
  export: ["Export rapport", "Choisissez période, format PDF / Excel et aperçu.", "Exporter"],
};

export function RoleWorkspacePage({ role, view, overrides = {} }) {
  const [query, setQuery] = useState("");
  const [apiRows, setApiRows] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const meta = pageMeta[view] ?? [`${roleCopy[role] ?? "Espace"} · ${view}`, "Interface prête à connecter aux API du module.", "Action"];
  const pageType = getPageType(view);
  const resource = useMemo(() => getResourceConfig(role, view, overrides), [role, view, overrides]);
  const rows = useMemo(() => filterRows(apiRows, query), [apiRows, query]);

  useEffect(() => {
    let ignore = false;

    async function loadRows() {
      if (!resource) {
        setApiRows([]);
        return;
      }
      if (resource.staticRows) {
        setApiRows(resource.staticRows);
        return;
      }

      setIsLoading(true);
      setError("");
      try {
        const data = await apiFetch(resource.path, { fallback: resource.fallback });
        if (!ignore) setApiRows(resource.map(data));
      } catch (err) {
        if (!ignore) {
          setApiRows([]);
          setError(err.message || resource.fallback);
        }
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    loadRows();
    return () => {
      ignore = true;
    };
  }, [resource]);

  if (["denied", "network", "offline"].includes(view)) {
    return <StateScreen view={view} meta={meta} />;
  }

  if (pageType === "form") {
    return <FormMock role={role} view={view} meta={meta} />;
  }

  if (pageType === "detail") {
    return <DetailMock role={role} view={view} meta={meta} rows={rows} />;
  }

  if (pageType === "report") {
    return <ReportMock role={role} view={view} meta={meta} rows={rows} />;
  }

  return (
    <section className="space-y-5">
      <PageHero role={role} title={meta[0]} subtitle={meta[1]} action={meta[2]} />
      <KpiStrip role={role} view={view} overrides={overrides} />
      {error && <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-600">{error}</div>}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchBox value={query} onChange={setQuery} placeholder="Rechercher par référence, statut, client, produit..." />
          <div className="flex flex-wrap gap-2">
            {["Tous", "Actifs", "En attente", "Critiques"].map((label) => (
              <SecondaryAction key={label} icon={label === "Tous" ? "SlidersHorizontal" : undefined}>{label}</SecondaryAction>
            ))}
          </div>
        </div>
      </div>
      {isLoading ? <LoadingPanel /> : <ResponsiveTable rows={rows} />}
    </section>
  );
}

export function roleWorkspaceSupports(view) {
  return Boolean(pageMeta[view]);
}

function PageHero({ role, title, subtitle, action }) {
  return (
    <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center">
      <div>
        <h1 className="mt-2 text-2xl font-black text-[var(--dashboard-secondary)] md:text-3xl">{title}</h1>
      </div>
      {action && action !== "Actualiser" && (
        <PrimaryAction icon={action?.includes("Exporter") ? "Download" : "Plus"}>{action}</PrimaryAction>
      )}
    </div>
  );
}

function KpiStrip({ role, view, overrides }) {
  const kpis = [
    ["Chiffre d’affaires", overrides["Chiffre d'affaires"] ?? money(2845000), "TrendingUp", "+12,5%"],
    [role === "SUPERADMIN" ? "Restaurants actifs" : "Commandes", role === "SUPERADMIN" ? overrides.Actifs ?? "128" : "128", "ClipboardList", "+18"],
    [view.includes("stock") || role === "STOCK" ? "Alertes stock" : "Panier moyen", view.includes("stock") || role === "STOCK" ? "18" : money(53520), "AlertTriangle", "À suivre"],
    ["Satisfaction", "94%", "CheckCircle2", "+4%"],
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map(([label, value, icon, trend]) => (
        <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
              <p className="mt-2 text-xs font-black text-emerald-600">{trend}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-[var(--dashboard-primary)]">
              <DashboardIcon name={icon} size={20} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ResponsiveTable({ rows }) {
  if (!rows.length) return <EmptyState title="Aucune donnée" text="Les éléments apparaîtront ici après synchronisation." />;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="lte-table min-w-[760px]">
          <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
            <tr>
              {["Référence", "Type", "Statut", "Montant / Valeur", "Date / Responsable", "Actions"].map((header) => (
                <th key={header} className="px-5 py-4">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.join("-")} className="hover:bg-slate-50">
                <td className="px-5 py-4 font-black text-slate-950">{row[0]}</td>
                <td className="px-5 py-4 font-semibold text-slate-600">{row[1]}</td>
                <td className="px-5 py-4"><StatusPill tone={statusTone(row[2])}>{row[2]}</StatusPill></td>
                <td className="px-5 py-4 font-black text-slate-900">{row[3]}</td>
                <td className="px-5 py-4 font-semibold text-slate-500">{row[4]}</td>
                <td className="px-5 py-4 text-right">
                  <button className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:border-[var(--dashboard-primary)] hover:text-[var(--dashboard-primary)]" title="Voir">
                    <DashboardIcon name="Eye" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-xs font-bold text-slate-500">
        <span>Affichage 1-{rows.length} sur {rows.length}</span>
        <span className="flex gap-2">
          <button className="rounded-md border border-slate-200 px-3 py-1">1</button>
          <button className="rounded-md border border-slate-200 px-3 py-1">2</button>
          <button className="rounded-md border border-slate-200 px-3 py-1">3</button>
        </span>
      </div>
    </div>
  );
}

function FormMock({ role, view, meta }) {
  return (
    <section className="space-y-5">
      <PageHero role={role} title={meta[0]} subtitle={meta[1]} action={meta[2]} />
      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <FormSection title="Informations générales" fields={formFields(view).slice(0, 4)} />
          <FormSection title="Paramètres avancés" fields={formFields(view).slice(4)} />
          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <SecondaryAction>Annuler</SecondaryAction>
            <PrimaryAction icon="CheckCircle2">{meta[2]}</PrimaryAction>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-black text-[var(--dashboard-secondary)]">Aperçu</h2>
          <div className="mt-4 rounded-xl bg-slate-50 p-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-emerald-50 text-[var(--dashboard-primary)]">
              <DashboardIcon name="Store" size={24} />
            </div>
            <p className="mt-4 text-xl font-black text-slate-950">Le Bon Coin</p>
            <p className="mt-2 text-sm font-medium text-slate-500">Les données saisies seront envoyées au module métier correspondant lorsqu’une action dédiée est disponible.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FormSection({ title, fields }) {
  return (
    <div>
      <h2 className="text-base font-black text-[var(--dashboard-secondary)]">{title}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <label key={field} className="block">
            <span className="mb-2 block text-xs font-black text-slate-700">{field}</span>
            <input className="form-control transition focus:border-[var(--dashboard-primary)] focus:ring-4 focus:ring-emerald-50" placeholder={field} />
          </label>
        ))}
      </div>
    </div>
  );
}

function DetailMock({ role, view, meta, rows }) {
  return (
    <section className="space-y-5">
      <PageHero role={role} title={meta[0]} subtitle={meta[1]} action={meta[2]} />
      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-emerald-50 text-[var(--dashboard-primary)]">
              <DashboardIcon name="Store" size={28} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-950">Bistro Gourmet</h2>
              <p className="text-sm font-semibold text-slate-500">Plan Premium · Tenant actif</p>
            </div>
          </div>
          <div className="mt-5 space-y-3 text-sm">
            {["Statut: Actif", "Responsable: Admin Propriétaire", "Dernière activité: Aujourd’hui 09:45", "Téléphone: +237 612 345 678"].map((line) => (
              <div key={line} className="flex justify-between rounded-lg border border-slate-100 px-3 py-2 font-semibold text-slate-600">
                <span>{line.split(":")[0]}</span>
                <span className="text-slate-950">{line.split(":").slice(1).join(":")}</span>
              </div>
            ))}
          </div>
        </div>
        <ResponsiveTable rows={rows} />
      </div>
    </section>
  );
}

function ReportMock({ role, view, meta, rows }) {
  return (
    <section className="space-y-5">
      <PageHero role={role} title={meta[0]} subtitle={meta[1]} action={meta[2]} />
      <KpiStrip role={role} view={view} />
      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-black text-[var(--dashboard-secondary)]">Évolution par période</h2>
          <div className="mt-6 flex h-64 items-end gap-3">
            {[48, 72, 61, 88, 75, 96, 83].map((height, index) => (
              <div key={index} className="flex flex-1 flex-col items-center gap-2">
                <span className="w-full max-w-12 rounded-t-lg bg-[var(--dashboard-primary)]" style={{ height: `${height}%` }} />
                <span className="text-xs font-bold text-slate-500">{String(index + 1).padStart(2, "0")}/05</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-black text-[var(--dashboard-secondary)]">Exports</h2>
          <div className="mt-4 grid gap-3">
            <SecondaryAction icon="FileText">Exporter en PDF</SecondaryAction>
            <SecondaryAction icon="Download">Exporter en Excel</SecondaryAction>
            <SecondaryAction icon="CalendarDays">Période personnalisée</SecondaryAction>
          </div>
        </div>
      </div>
      <ResponsiveTable rows={rows} />
    </section>
  );
}

function StateScreen({ view, meta }) {
  const icon = view === "denied" ? "ShieldCheck" : view === "network" ? "Cloud" : "Activity";
  return (
    <section className="flex min-h-[calc(100vh-140px)] items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="max-w-lg">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50 text-[var(--dashboard-primary)]">
          <DashboardIcon name={icon} size={42} />
        </div>
        <h1 className="mt-6 text-3xl font-black text-slate-950">{meta[0]}</h1>
        <p className="mt-3 text-sm font-medium leading-6 text-slate-500">{meta[1]}</p>
        <div className="mt-6 flex justify-center gap-3">
          <PrimaryAction icon="CheckCircle2">{meta[2]}</PrimaryAction>
          {view === "network" && <SecondaryAction>Retour hors connexion</SecondaryAction>}
        </div>
      </div>
    </section>
  );
}

function filterRows(rows, query) {
  const value = query.trim().toLowerCase();
  if (!value) return rows;
  return rows.filter((row) => row.join(" ").toLowerCase().includes(value));
}

function LoadingPanel() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
    </div>
  );
}

function getResourceConfig(role, view, overrides) {
  if (role === "SUPERADMIN" || ["restaurant-detail", "activation", "stats"].includes(view)) {
    if (Array.isArray(overrides.__restaurants)) {
      return { staticRows: mapRestaurants(overrides.__restaurants) };
    }
    return {
      path: "/api/v1/restaurants",
      fallback: "Impossible de charger les restaurants.",
      map: mapRestaurants,
    };
  }

  if (["activity", "activity-log", "search"].includes(view)) {
    return {
      path: "/api/v1/audit-logs?limit=50",
      fallback: "Impossible de charger le journal d'activité.",
      map: mapAuditLogs,
    };
  }

  if (view === "notifications") {
    return {
      path: "/api/v1/notifications?limit=50",
      fallback: "Impossible de charger les notifications.",
      map: mapNotifications,
    };
  }

  if (["users", "roles", "team", "server-report", "service-performance"].includes(view)) {
    return {
      path: "/api/v1/users",
      fallback: "Impossible de charger les utilisateurs.",
      map: mapUsers,
    };
  }

  if (role === "STOCK" || view.includes("stock") || ["suppliers", "production", "ingredients", "rotation", "low-stock", "thresholds", "damages"].includes(view)) {
    const pathByView = {
      suppliers: "/api/v1/stock/suppliers",
      damages: "/api/v1/stock/damages",
      movements: "/api/v1/stock/movements",
      "low-stock": "/api/v1/stock/low-stock",
      rotation: "/api/v1/finance/stock-rotation",
      production: "/api/v1/stock/production-sheets",
      ingredients: "/api/v1/stock/recipes",
    };
    return {
      path: pathByView[view] ?? "/api/v1/stock/items",
      fallback: "Impossible de charger les données stock.",
      map: mapStockRows,
    };
  }

  if (role === "COMPTABLE" || ["revenue", "expenses", "margins", "profits", "received-payments", "cash-collections", "income", "cashflow", "balance", "ledger", "financial-report"].includes(view)) {
    const pathByView = {
      revenue: "/api/v1/finance/revenues",
      expenses: "/api/v1/finance/expenses",
      margins: "/api/v1/finance/dish-margins",
      profits: "/api/v1/finance/reports/monthly-result",
      "received-payments": "/api/v1/finance/payments",
      "cash-collections": "/api/v1/finance/reports/cash-flow",
      income: "/api/v1/finance/reports/income-statement",
      cashflow: "/api/v1/finance/reports/cash-flow",
      balance: "/api/v1/finance/reports/balance-sheet",
      ledger: "/api/v1/finance/reports/ledger",
      "financial-report": "/api/v1/finance/summary",
    };
    return {
      path: pathByView[view] ?? "/api/v1/finance/entries",
      fallback: "Impossible de charger les données financières.",
      map: mapFinanceRows,
    };
  }

  return {
    path: "/api/v1/orders?limit=50",
    fallback: "Impossible de charger les commandes.",
    map: mapOrders,
  };
}

function asArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.entries)) return data.entries;
  if (data && typeof data === "object") return Object.entries(data).map(([key, value]) => ({ key, value }));
  return [];
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function quantity(item) {
  return Number(item?.quantity || 0) + Number(item?.kitchen_quantity || 0) + Number(item?.drink_quantity || 0);
}

function mapOrders(data) {
  return asArray(data).map((order) => [
    order.order_number ?? `Commande ${String(order.id ?? "").slice(0, 8)}`,
    order.table_name || order.fulfillment_type || order.order_source || "Commande",
    order.status ?? "-",
    money(order.total_amount),
    formatDate(order.created_at),
  ]);
}

function mapRestaurants(data) {
  return asArray(data).map((restaurant) => [
    restaurant.name ?? restaurant.slug ?? "Restaurant",
    restaurant.plan || restaurant.subscription_plan || restaurant.currency || "-",
    restaurant.is_active === false ? "Inactif" : "Actif",
    formatDate(restaurant.created_at || restaurant.subscription_ends_at),
    restaurant.city || restaurant.country || restaurant.slug || "-",
  ]);
}

function mapUsers(data) {
  return asArray(data).map((user) => [
    [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || user.email || "Utilisateur",
    user.role ?? "-",
    user.is_active === false ? "Inactif" : "Actif",
    user.branch_name || user.phone || user.email || "-",
    formatDate(user.created_at || user.updated_at),
  ]);
}

function mapAuditLogs(data) {
  return asArray(data).map((log) => [
    formatDate(log.created_at || log.timestamp),
    log.actor_name || log.username || log.user_email || "Système",
    log.action || log.event || "-",
    log.description || log.target || log.resource_type || "-",
    log.ip_address || log.ip || "-",
  ]);
}

function mapNotifications(data) {
  return asArray(data).map((notification) => [
    notification.title || notification.type || "Notification",
    notification.message || notification.body || "-",
    notification.read_at || notification.is_read ? "Lu" : "Non lu",
    notification.priority || notification.level || "-",
    formatDate(notification.created_at),
  ]);
}

function mapStockRows(data) {
  return asArray(data).map((item) => {
    const currentQuantity = quantity(item);
    const threshold = Number(item.alert_threshold || item.min_quantity || 0);
    const status = item.status || (threshold && currentQuantity <= threshold ? "Faible" : "OK");
    return [
      item.name || item.product_name || item.supplier_name || item.key || "Stock",
      item.category_name || item.product_type || item.location || item.type || "-",
      status,
      money(item.stock_value ?? item.value ?? currentQuantity * Number(item.purchase_price || item.unit_price || 0)),
      item.created_at ? formatDate(item.created_at) : `${currentQuantity.toLocaleString("fr-FR")} ${item.unit || ""}`.trim(),
    ];
  });
}

function mapFinanceRows(data) {
  return asArray(data).map((item) => [
    item.reference || item.entry_number || item.code || item.key || "Finance",
    item.label || item.description || item.account_name || item.journal_name || "-",
    item.status || (item.validated_at ? "Validé" : "Brouillon"),
    money(item.amount ?? item.balance ?? item.value ?? item.debit ?? item.credit),
    formatDate(item.created_at || item.date || item.period),
  ]);
}

function statusTone(status) {
  if (["Actif", "OK", "Payée", "Reçu", "Payé", "Comptabilisé", "Terminée"].includes(status)) return "green";
  if (["En attente", "En préparation", "En livraison", "En pause", "Faible"].includes(status)) return "orange";
  if (["Annulée", "Expiré", "Critique", "Inactif"].includes(status)) return "red";
  return "blue";
}

function getPageType(view) {
  if (view.startsWith("create-") || ["stock-in", "stock-out", "transfer", "inventory", "thresholds", "production", "ingredients", "damages", "discounts", "payment-method", "cash", "mobile", "card", "account", "profile", "export"].includes(view)) return "form";
  if (view.includes("detail") || ["activation", "invoice", "print-receipt", "cash-order-detail"].includes(view)) return "detail";
  if (view.includes("report") || ["stats", "profits", "margins", "income", "cashflow", "balance", "ledger", "financial-report", "period-summary", "rotation", "payment-totals", "cash-closing", "cash-report"].includes(view)) return "report";
  return "list";
}

function formFields(view) {
  if (view.includes("user")) return ["Prénom", "Nom", "Email", "Téléphone", "Rôle", "Branche", "Mot de passe", "Permissions"];
  if (view.includes("restaurant") || view.includes("branch")) return ["Nom", "Slug", "Adresse", "Ville", "Téléphone", "Email", "Responsable", "Plan"];
  if (view.includes("stock") || ["transfer", "inventory", "thresholds", "production", "ingredients", "damages"].includes(view)) return ["Produit", "Catégorie", "Quantité", "Unité", "Prix unitaire", "Fournisseur", "Emplacement", "Justification"];
  if (["cash", "mobile", "card", "payment-method", "discounts"].includes(view)) return ["Commande", "Montant", "Mode de paiement", "Référence", "Remise", "Motif", "Client", "Notes"];
  return ["Titre", "Catégorie", "Statut", "Période", "Responsable", "Montant", "Description", "Notes"];
}
