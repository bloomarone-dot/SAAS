const API_URL = 'http://localhost:8000/api/tables'; // Ajuste le port si nécessaire

export const tableApi = {
  // 1. Récupérer toutes les tables d'un restaurant
  getTables: async (restaurantId) => {
    const response = await fetch(`${API_URL}/restaurant/${restaurantId}`);
    if (!response.ok) {
      throw new Error('Erreur lors de la récupération des tables.');
    }
    return response.json();
  },

  // 2. Créer une nouvelle table
  createTable: async (restaurantId, tableData) => {
    const response = await fetch(`${API_URL}?restaurant_id=${restaurantId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tableData),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Erreur lors de la création de la table.');
    }
    return response.json();
  },

  // 3. Changer le statut d'une table (FREE, OCCUPIED, RESERVED)
  updateTableStatus: async (tableId, status) => {
    const response = await fetch(`${API_URL}/${tableId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      throw new Error('Erreur lors de la mise à jour du statut.');
    }
    return response.json();
  }
};