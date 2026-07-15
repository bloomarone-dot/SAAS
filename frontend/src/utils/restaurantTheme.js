export function resolveRestaurantAssetUrl(url, { slug } = {}) {
  if (!url) return "";
  const normalized = String(url).trim();
  // Ancien logo demo global : ne pas l'afficher pour les autres restaurants.
  if (
    (normalized === "/logo.jpeg" || normalized.endsWith("/logo.jpeg"))
    && slug
    && !["main", "le-bon-coin", "leboncoin"].includes(String(slug).toLowerCase())
  ) {
    return "";
  }
  try {
    const parsed = new URL(normalized, window.location.origin);
    if (parsed.pathname.startsWith("/uploads/")) return parsed.pathname;
    if (parsed.pathname.startsWith("/")) return parsed.pathname;
  } catch {
    return normalized;
  }
  return normalized;
}

export function buildRestaurantTheme(restaurant) {
  if (!restaurant) return null;
  const slug = restaurant.slug;
  return {
    id: restaurant.id,
    name: restaurant.name,
    slug,
    logoUrl: resolveRestaurantAssetUrl(restaurant.logo_url, { slug }),
    primary: restaurant.primary_color || "#078d50",
    secondary: restaurant.secondary_color || "#003f2f",
    accent: restaurant.accent_color || "#F59E0B",
  };
}

export function normalizePublicRestaurant(restaurant) {
  if (!restaurant) return restaurant;
  const slug = restaurant.slug;
  return {
    ...restaurant,
    logo_url: resolveRestaurantAssetUrl(restaurant.logo_url, { slug }) || null,
    cover_image_url: resolveRestaurantAssetUrl(restaurant.cover_image_url, { slug }) || null,
  };
}
