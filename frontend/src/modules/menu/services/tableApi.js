import { apiFetch } from "@/config/http";

const request = (path, options = {}) =>
  apiFetch(path, { ...options, fallback: "Requete table impossible." });

export const tableApi = {
  getTables: (restaurantId) => request(`/tables/restaurant/${restaurantId}`),

  createTable: (restaurantId, tableData) =>
    request(`/tables?restaurant_id=${restaurantId}`, {
      method: "POST",
      body: JSON.stringify(tableData),
    }),

  updateTableStatus: (tableId, status) =>
    request(`/tables/${tableId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  getActiveOrders: (tableId) => request(`/tables/${tableId}/orders/active`),

  createOrder: (tableId, payload = { party_size: 1 }) =>
    request(`/tables/${tableId}/orders`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
