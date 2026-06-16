import { useMemo, useState } from "react";

import { DashboardIcon } from "./icons";
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

const tableRows = [
  ["#CMD-1258", "Table 8", "En préparation", money(36500), "12:45"],
  ["#CMD-1257", "Livraison", "En livraison", money(42000), "12:30"],
  ["#CMD-1256", "Table 2", "Terminée", money(18000), "12:05"],
  ["#CMD-1255", "À emporter", "Payée", money(27000), "11:50"],
  ["#CMD-1254", "Table 10", "Annulée", money(9200), "11:35"],
];

const stockRows = [
  ["Boeuf haché", "Viandes", "7,2 kg", "Faible", money(86400)],
  ["Poulet fermier", "Viandes", "12,5 kg", "OK", money(87500)],
  ["Saumon frais", "Poissons", "4,3 kg", "Faible", money(68800)],
  ["Tomates pelées", "Épicerie", "28 boîtes", "OK", money(33600)],
  ["Huile d’olive", "Épicerie", "3,2 L", "Faible", money(51200)],
];

const financeRows = [
  ["RC-2024-0529", "Vente sur place", "Espèces", money(85000), "Reçu"],
  ["RC-2024-0528", "Livraison", "Mobile Money", money(62000), "Reçu"],
  ["DEP-2024-0419", "Boissons", "Carte bancaire", money(42000), "Payé"],
  ["DEP-2024-0418", "Énergie", "Prélèvement", money(32000), "Payé"],
  ["AV-2024-0112", "Avarie saumon", "Stock", money(18400), "Comptabilisé"],
];

const teamRows = [
  ["Sophie Martin", "Manager", "Actif", "Service soir", "20/05/2024"],
  ["Julien Bernard", "Serveur", "Actif", "Salle principale", "20/05/2024"],
  ["Camille Durand", "Caissier", "Actif", "Caisse 01", "20/05/2024"],
  ["Thomas Leroy", "Cuisine", "Inactif", "Repos", "19/05/2024"],
  ["Alexandre Petit", "Livreur", "Actif", "Livraison", "18/05/2024"],
];

const activityRows = [
  ["31/05/2026 09:45", "Admin", "Connexion", "Connexion réussie", "192.168.1.10"],
  ["31/05/2026 09:30", "Julie Bernard", "Création commande", "Commande #CMD-1258", "192.168.1.15"],
  ["31/05/2026 09:15", "Camille Durand", "Paiement", "Paiement espèces validé", "192.168.1.12"],
  ["31/05/2026 08:50", "Alexis", "Stock", "Plat signalé indisponible", "192.168.1.18"],
  ["31/05/2026 08:35", "Admin", "Export", "Rapport ventes PDF", "192.168.1.10"],
];

const restaurantsRows = [
  ["Bistro Gourmet", "Premium", "Actif", "20/06/2026", "Paris"],
  ["Pizza House", "Pro", "Actif", "15/06/2026", "Lyon"],
  ["Sushi Zen", "Business", "Actif", "10/07/2026", "Marseille"],
  ["Burger Corner", "Pro", "Expiré", "18/06/2026", "Douala"],
  ["Tacos City", "Premium", "En pause", "22/06/2026", "Yaoundé"],
];

export function RoleWorkspacePage({ role, view, overrides = {} }) {
  const [query, setQuery] = useState("");
  const meta = pageMeta[view] ?? [`${roleCopy[role] ?? "Espace"} · ${view}`, "Interface prête à connecter aux API du module.", "Action"];
  const pageType = getPageType(view);
  const rows = useMemo(() => filterRows(getRows(role, view), query), [role, view, query]);

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
      <ResponsiveTable rows={rows} />
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
        <p className="text-xs font-black uppercase tracking-normal text-[var(--dashboard-primary)]">{roleCopy[role]}</p>
        <h1 className="mt-2 text-2xl font-black text-[var(--dashboard-secondary)] md:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">{subtitle}</p>
      </div>
      <PrimaryAction icon={action?.includes("Exporter") ? "Download" : "Plus"}>{action}</PrimaryAction>
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
            <p className="mt-2 text-sm font-medium text-slate-500">Les données saisies alimenteront cette fiche. Les validations API pourront remplacer ces champs mockés.</p>
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

function getRows(role, view) {
  if (role === "SUPERADMIN" || ["create-restaurant", "restaurant-detail", "activation", "stats"].includes(view)) return restaurantsRows;
  if (role === "STOCK" || view.includes("stock") || ["suppliers", "production", "ingredients", "rotation", "low-stock", "thresholds", "damages"].includes(view)) return stockRows;
  if (role === "COMPTABLE" || ["revenue", "expenses", "margins", "profits", "received-payments", "cash-collections", "income", "cashflow", "balance", "ledger", "financial-report"].includes(view)) return financeRows;
  if (["users", "roles", "team", "table-assignment", "server-report", "service-performance"].includes(view)) return teamRows;
  if (["activity", "activity-log", "notifications", "search"].includes(view)) return activityRows;
  return tableRows;
}

function filterRows(rows, query) {
  const value = query.trim().toLowerCase();
  if (!value) return rows;
  return rows.filter((row) => row.join(" ").toLowerCase().includes(value));
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
