import React, { useState, useEffect } from 'react';
import { tableApi } from '../services/tableApi';

export default function TableGrid({ restaurantId, onSelectTable }) {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Charger les tables au démarrage
  useEffect(() => {
    async function fetchTables() {
      try {
        const data = await tableApi.getTables(restaurantId);
        setTables(data);
      } catch (err) {
        setError('Impossible de charger le plan de salle.');
      } finally {
        setLoading(false);
      }
    }
    fetchTables();
  }, [restaurantId]);

  if (loading) return <div className="p-6 text-sm text-gray-500">Chargement du plan de salle...</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="border-b pb-3">
        <h2 className="text-xl font-bold text-gray-900">Plan de Salle</h2>
        <p className="text-xs text-gray-500">Sélectionnez une table pour prendre ou gérer une commande</p>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md border border-red-100">
          {error}
        </div>
      )}

      {/* Grille de sélection des tables */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
        {tables.map((table) => {
          const isOccupied = table.status === 'OCCUPIED';
          const isReserved = table.status === 'RESERVED';
          
          // Gestion dynamique de la couleur selon le statut de la table
          let cardStyle = "border-green-200 bg-green-50 text-green-700 hover:bg-green-100";
          if (isOccupied) cardStyle = "border-red-200 bg-red-50 text-red-700 hover:bg-red-100";
          if (isReserved) cardStyle = "border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100";

          return (
            <button
              key={table.id}
              onClick={() => onSelectTable(table)}
              className={`p-6 border rounded-xl flex flex-col items-center justify-center transition-all shadow-sm font-medium ${cardStyle}`}
            >
              <span className="text-lg font-bold">{table.number}</span>
              <span className="text-xs opacity-75">{table.capacity} places</span>
              <span className="mt-2 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white bg-opacity-60 font-semibold">
                {table.status === 'FREE' ? 'Libre' : table.status === 'OCCUPIED' ? 'Occupée' : 'Réservée'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}