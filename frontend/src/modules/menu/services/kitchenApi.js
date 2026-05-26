const API_URL = 'http://localhost:8000/api/kitchen'; // Ajuste le port si nécessaire

export const kitchenApi = {
  // 1. Récupérer les tickets de cuisine actifs (en attente, en cours, prêts)
  getActiveTickets: async () => {
    const response = await fetch(`${API_URL}/tickets/active`);
    if (!response.ok) {
      throw new Error('Erreur lors de la récupération des tickets de cuisine.');
    }
    return response.json();
  },

  // 2. Changer le statut d'un ticket (COOKING, READY, SERVED)
  updateTicketStatus: async (ticketId, status) => {
    const response = await fetch(`${API_URL}/ticket/${ticketId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      throw new Error('Erreur lors de la mise à jour du statut du ticket.');
    }
    return response.json();
  }
};