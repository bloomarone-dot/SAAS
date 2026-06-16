import { apiFetch } from "@/config/http";

const request = (path, options = {}) =>
  apiFetch(path, { ...options, fallback: "Action de paiement impossible." });

export const paymentApi = {
  // Serveur : transmet une demande de paiement à la caisse.
  createRequest: (payload) =>
    request("/api/v1/payments/requests", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Caisse : liste les demandes (PENDING par défaut).
  listRequests: (status = "PENDING") =>
    request(`/api/v1/payments/requests?status=${encodeURIComponent(status)}`),

  // Caisse : valide une demande → lance le paiement (push USSD) ou encaisse l'espèce.
  validateRequest: (requestId) =>
    request(`/api/v1/payments/requests/${requestId}/validate`, {
      method: "POST",
    }),

  // Caisse : rejette une demande.
  rejectRequest: (requestId) =>
    request(`/api/v1/payments/requests/${requestId}/reject`, {
      method: "POST",
    }),
};
