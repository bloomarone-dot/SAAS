function getApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  return `${window.location.protocol}//${window.location.hostname}:8001`;
}

async function request(path, options = {}) {
  const token = localStorage.getItem("access_token");
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    let detail = "Requete menu impossible.";
    try {
      const data = await response.json();
      detail = data.detail ?? detail;
    } catch {
      // Keep the generic message when the backend does not return JSON.
    }
    throw new Error(detail);
  }

  if (response.status === 204) return null;
  return response.json();
}

export const menuApi = {
  getCategories: (restaurantId) =>
    request(`/api/v1/menu/categories/restaurant/${restaurantId}`),

  createCategory: (categoryData) =>
    request("/api/v1/menu/categories", {
      method: "POST",
      body: JSON.stringify(categoryData),
    }),

  uploadImage: async (file) => {
    const token = localStorage.getItem("access_token");
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(`${getApiBaseUrl()}/api/v1/menu/images`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail ?? "Import de l'image impossible.");
    return data.image_url;
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
