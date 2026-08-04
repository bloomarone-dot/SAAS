import { apiFetch } from "@/config/http";

const request = (path, options = {}) =>
  apiFetch(path, { ...options, fallback: "Action commande impossible." });

export const orderApi = {
  list: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    const suffix = query.toString() ? `?${query}` : "";
    return request(`/api/v1/orders${suffix}`);
  },

  get: (orderId) => request(`/api/v1/orders/${orderId}`),

  update: (orderId, payload) =>
    request(`/api/v1/orders/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  sendToKitchen: (orderId) =>
    request(`/api/v1/orders/${orderId}/send-to-kitchen`, {
      method: "POST",
    }),

  applyPromo: (orderId, code) =>
    request(`/api/v1/orders/${orderId}/promo`, {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  updateStatus: (orderId, status) =>
    request(`/api/v1/orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  // Ferme la commande (client demande la note) : plus d'ajout d'articles possible.
  close: (orderId) =>
    request(`/api/v1/orders/${orderId}/close`, { method: "POST" }),

  // Réouvre une commande fermée (manager/admin, motif obligatoire).
  reopen: (orderId, reason) =>
    request(`/api/v1/orders/${orderId}/reopen`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  validatePayment: (orderId, payload) =>
    request(`/api/v1/orders/${orderId}/payment`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  claimForCashier: (orderId) =>
    request(`/api/v1/orders/${orderId}/claim-cashier`, {
      method: "POST",
    }),

  cancelPayment: (orderId) =>
    request(`/api/v1/orders/${orderId}/payment-cancel`, {
      method: "POST",
    }),

  logReceiptPrint: (orderId) =>
    request(`/api/v1/orders/${orderId}/receipt-print`, {
      method: "POST",
    }),

  cashierReport: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    const suffix = query.toString() ? `?${query}` : "";
    return request(`/api/v1/orders/cashier-report${suffix}`);
  },

  getCashSession: () => request("/api/v1/orders/cash-session"),

  openCashSession: (payload) =>
    request("/api/v1/orders/cash-session/open", {
      method: "POST",
      body: payload,
    }),

  closeCashSession: (payload) =>
    request("/api/v1/orders/cash-session/close", {
      method: "POST",
      body: payload,
    }),

  createCashierDelivery: (payload) =>
    request("/api/v1/orders/cashier-delivery", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  cashierNetworkReport: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    const suffix = query.toString() ? `?${query}` : "";
    return request(`/api/v1/orders/cashier-network-report${suffix}`);
  },

  completedPayments: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    const suffix = query.toString() ? `?${query}` : "";
    return request(`/api/v1/orders/payments/completed${suffix}`);
  },

  listDeliveryAreas: (params = {}) => {
    const query = new URLSearchParams({ active_only: "true", ...params });
    const suffix = query.toString() ? `?${query}` : "";
    return request(`/api/v1/branches/delivery-areas${suffix}`);
  },

  updateDeliveryAreaFee: (areaId, deliveryFee) =>
    request(`/api/v1/branches/delivery-areas/${areaId}`, {
      method: "PATCH",
      body: { delivery_fee: Number(deliveryFee) },
    }),
};
