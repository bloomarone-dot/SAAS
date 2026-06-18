import ServerWorkspace from "@/modules/menu/components/ServerWorkspace";

export function ServerDashboard({ overrides = {} }) {
  const currentUser = overrides.__currentUser;
  return (
    <ServerWorkspace
      restaurantId={currentUser?.restaurant_id}
      currentUser={currentUser}
    />
  );
}
