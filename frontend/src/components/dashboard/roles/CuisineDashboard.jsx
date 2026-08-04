import KitchenWorkspace from "@/modules/menu/components/KitchenWorkspace";
import { PageContainer, PageHeader } from "@/modules/admin/components/AdminUi";
import { KITCHEN_ENABLED } from "@/config/features";

export function CuisineDashboard({ overrides = {} }) {
  const currentUser = overrides.__currentUser;

  if (!KITCHEN_ENABLED) {
    return (
      <PageContainer>
        <PageHeader
          eyebrow="Cuisine"
          title="Module cuisine désactivé"
          subtitle="Le service est géré directement par les serveuses et les caissières : prise de commande, marquage « servi », puis envoi en caisse. Réactivez le module cuisine plus tard si besoin."
        />
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-600 shadow-sm">
          Aucun écran à afficher pour le moment. Contactez l&apos;administrateur si vous devez reprendre la production cuisine sur tablette.
        </div>
      </PageContainer>
    );
  }

  return (
    <KitchenWorkspace
      restaurantId={currentUser?.restaurant_id}
      currentUser={currentUser}
      role="CUISINE"
    />
  );
}
