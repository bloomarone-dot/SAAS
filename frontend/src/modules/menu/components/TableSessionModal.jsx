import React, { useState, useEffect } from 'react';
import { tableApi } from '../services/tableApi';

export default function TableSessionModal({ table, onClose, onOpenMenuForOrder }) {
  const [activeOrders, setActiveOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  // Simuler l'utilisateur actuellement connecté (Reine)
  const currentUserId = 1; 
  const currentUserName = "Reine";

  useEffect(() => {
    if (table && table.status === 'OCCUPIED') {
      setLoading(true);
      // Ici, on va normalement requêter l'API de ton collègue pour récupérer 
      // les commandes actives liées à cette table.
      // Pour le test, on simule deux factures en cours sur cette même table :
      setTimeout(() => {
        setActiveOrders([
          { id: 1024, server_id: 1, server_name: "Reine", total_amount: 4500, status: "PENDING" },
          { id: 1025, server_id: 2, server_name: "Florence", total_amount: 12000, status: "PREPARING" }
        ]);
        setLoading(false);
      }, 500);
    } else {
      setActiveOrders([]);
    }
  }, [table]);

  if (!table) return null;

  // Action : Ouvrir une toute nouvelle commande/facture sur cette table
  const handleCreateNewOrder = async () => {
    try {
      // 1. Si la table était libre, on passe son statut à OCCUPIED dans le backend
      if (table.status === 'FREE') {
        await tableApi.updateTableStatus(table.id, 'OCCUPIED');
      }
      
      // 2. Ici on appellera l'API de ton collègue pour créer la commande en base de données
      // ex: const newOrder = await orderApi.createOrder({ table_id: table.id, server_id: currentUserId })
      const mockNewOrderId = Math.floor(Math.random() * 1000) + 2000;

      // 3. On bascule la serveuse vers l'écran du menu (Sprint 3) avec l'ID de la nouvelle commande
      onOpenMenuForOrder(mockNewOrderId, table.number);
      onClose();
    } catch (err) {
      alert("Erreur lors de l'ouverture de la commande.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
        
        {/* En-tête */}
        <div className="p-4 bg-gray-900 text-white flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold">Table {table.number}</h3>
            <p className="text-xs text-gray-400">Capacité : {table.capacity} personnes</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white font-bold text-lg">&times;</button>
        </div>

        {/* Corps de la Modal */}
        <div className="p-6 space-y-6">
          
          {/* CAS 1 : LA TABLE EST OCCUPÉE (Gestion des factures multiples/serveuses) */}
          {table.status === 'OCCUPIED' && (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Factures actives sur cette table :</p>
              
              {loading ? (
                <p className="text-sm text-gray-400">Chargement des factures...</p>
              ) : (
                <div className="space-y-2">
                  {activeOrders.map((order) => (
                    <div key={order.id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                      <div>
                        <p className="text-sm font-bold text-gray-800">Commande #{order.id}</p>
                        <p className="text-xs text-gray-500">Serveuse : <span className="font-medium text-gray-700">{order.server_name}</span></p>
                        <p className="text-xs text-blue-600 font-semibold mt-1">{order.total_amount} XAF</p>
                      </div>
                      
                      <button 
                        onClick={() => onOpenMenuForOrder(order.id, table.number)}
                        className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Compléter la note
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <hr className="my-4 border-gray-100" />
            </div>
          )}

          {/* CAS 2 : LA TABLE EST LIBRE */}
          {table.status === 'FREE' && (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto text-xl font-bold">✓</div>
              <p className="text-sm text-gray-600 mt-3">Cette table est actuellement libre. Aucun client n'y est installé.</p>
            </div>
          )}

          {/* Bouton d'action principal : Toujours disponible pour ouvrir un compte séparé */}
          <button
            onClick={handleCreateNewOrder}
            className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            {table.status === 'OCCUPIED' ? '+ Ouvrir une autre facture séparée' : 'Ouvrir une table / Prendre commande'}
          </button>
        </div>
      </div>
    </div>
  );
}