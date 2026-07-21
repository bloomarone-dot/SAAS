import { RestaurantLandingPage, RestaurantLoginPage } from "@/features/auth/PublicAuthPages";

/**
 * Vitrine publique multi-tenant.
 * Sections : null (accueil) | menu | commande | infos
 */
export default function RestaurantStorefrontPage({
  apiBaseUrl,
  slug,
  initialSection = null,
  initialData = null,
  loginPath,
}) {
  return (
    <RestaurantLandingPage
      apiBaseUrl={apiBaseUrl}
      slug={slug}
      initialSection={initialSection}
      initialData={initialData}
      loginPath={loginPath || `/restaurant/${slug}/login`}
    />
  );
}

export function RestaurantStaffLogin({ apiBaseUrl, slug, onAuthenticated }) {
  return (
    <RestaurantLoginPage
      apiBaseUrl={apiBaseUrl}
      slug={slug}
      onAuthenticated={onAuthenticated}
    />
  );
}
