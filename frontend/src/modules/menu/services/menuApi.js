import { apiFetch } from "@/config/http";

const request = (path, options = {}) =>
  apiFetch(path, { ...options, fallback: "Requete menu impossible." });

export const menuApi = {
  getCategories: (restaurantId) =>
    request(`/api/v1/menu/categories/restaurant/${restaurantId}`),

  createCategory: (categoryData) =>
    request("/api/v1/menu/categories", {
      method: "POST",
      body: JSON.stringify(categoryData),
    }),

  uploadImage: async (file) => {
    const body = new FormData();
    body.append("file", file);
    const data = await apiFetch("/api/v1/menu/images", {
      method: "POST",
      body,
      fallback: "Import de l'image impossible.",
    });
    return data?.image_url;
  },

  deleteCategory: (categoryId) =>
    request(`/api/v1/menu/categories/${categoryId}`, {
      method: "DELETE",
    }),

  getDishesByCategory: (categoryId, includeUnavailable = true) =>
    request(`/api/v1/menu/categories/${categoryId}/dishes?include_unavailable=${includeUnavailable}`),

  createDish: (dishData) =>
    request("/api/v1/menu/dishes", {
      method: "POST",
      body: JSON.stringify(dishData),
    }),

  toggleDishAvailability: (dishId) =>
    request(`/api/v1/menu/dishes/${dishId}/toggle-availability`, {
      method: "PATCH",
    }),

  softDeleteDish: (dishId) =>
    request(`/api/v1/menu/dishes/${dishId}`, {
      method: "DELETE",
    }),
};
