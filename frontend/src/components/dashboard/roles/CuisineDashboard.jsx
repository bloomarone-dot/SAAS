import KitchenWorkspace from "@/modules/menu/components/KitchenWorkspace";

export function CuisineDashboard({ overrides = {} }) {
  const currentUser = overrides.__currentUser;
  return (
    <KitchenWorkspace
      restaurantId={currentUser?.restaurant_id}
      currentUser={currentUser}
      role="CUISINE"
    />
  );
}
