import { apiFetch } from "@/config/http";
import { bustMenuApiCache } from "@/utils/money";

const request = (path, options = {}) =>
  apiFetch(path, { ...options, fallback: "Requete menu impossible." });

async function mutatingRequest(path, options = {}) {
  const data = await request(path, options);
  await bustMenuApiCache();
  return data;
}

function browserImageUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.pathname.startsWith("/uploads/")) return parsed.pathname;
  } catch {
    return url;
  }
  return url;
}

export const menuApi = {
  getCategories: (restaurantId) =>
    request(`/api/v1/menu/categories/restaurant/${restaurantId}`).then((rows) =>
      rows.map((row) => ({ ...row, image_url: browserImageUrl(row.image_url) }))
    ),

  createCategory: (categoryData) =>
    mutatingRequest("/api/v1/menu/categories", {
      method: "POST",
      body: categoryData,
    }),

  uploadImage: async (file) => {
    const body = new FormData();
    body.append("file", file);
    const data = await apiFetch("/api/v1/menu/images", {
      method: "POST",
      body,
      fallback: "Import de l'image impossible.",
    });
    return browserImageUrl(data?.image_url);
  },

  updateCategory: (categoryId, categoryData) =>
    mutatingRequest(`/api/v1/menu/categories/${categoryId}`, {
      method: "PUT",
      body: categoryData,
    }).then((row) => ({ ...row, image_url: browserImageUrl(row.image_url) })),

  deleteCategory: (categoryId) =>
    mutatingRequest(`/api/v1/menu/categories/${categoryId}`, {
      method: "DELETE",
    }),

  getDishesByCategory: (categoryId, includeUnavailable = true) =>
    request(`/api/v1/menu/categories/${categoryId}/dishes?include_unavailable=${includeUnavailable}`).then((rows) =>
      rows.map((row) => ({ ...row, image_url: browserImageUrl(row.image_url) }))
    ),

  createDish: (dishData) =>
    mutatingRequest("/api/v1/menu/dishes", {
      method: "POST",
      body: dishData,
    }).then((row) => ({ ...row, image_url: browserImageUrl(row.image_url) })),

  updateDish: (dishId, dishData) =>
    mutatingRequest(`/api/v1/menu/dishes/${dishId}`, {
      method: "PUT",
      body: dishData,
    }).then((row) => ({ ...row, image_url: browserImageUrl(row.image_url) })),

  toggleDishAvailability: (dishId) =>
    mutatingRequest(`/api/v1/menu/dishes/${dishId}/toggle-availability`, {
      method: "PATCH",
    }).then((row) => ({ ...row, image_url: browserImageUrl(row.image_url) })),

  softDeleteDish: (dishId) =>
    mutatingRequest(`/api/v1/menu/dishes/${dishId}`, {
      method: "DELETE",
    }),
};
