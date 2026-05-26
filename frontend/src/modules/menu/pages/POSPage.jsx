import React, { useState } from 'react';
import TableGrid from '../components/TableGrid';
import TableSessionModal from '../components/TableSessionModal';
import CategoriesPage from './CategoriesPage'; // Ton module Menu du Sprint 3

export default function POSPage() {
  const currentRestaurantId = 1; // ID de test pour le restaurant
  const [selectedTable, setSelectedTable] = useState(null);
  const [activeOrderContext, setActiveOrderContext] = useState(null);

  // Fonction appelée quand on sélectionne une commande ou qu'on en ouvre une nouvelle
  const handleOpenMenuForOrder = (orderId, tableNumber) => {
    setActiveOrderContext({
      orderId: orderId,
      tableNumber: tableNumber
    });
  };

  // Quitter le menu de prise de commande pour revenir au plan de salle
  const handleBackToTables = () => {
    setActiveOrderContext(null);
    // Optionnel : recharger le plan de salle ici si nécessaire
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Si aucune commande n'est active, on affiche le Plan de Salle */}
      {!activeOrderContext ? (
        <div className="max-w-7xl mx-auto py-6">
          <div className="px-6 flex justify-between items-center mb-4">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Espace Prise de Commande</h1>
          </div>

          {/* Grille des tables */}
          <TableGrid 
            restaurantId={currentRestaurantId} 
            onSelectTable={(table) => setSelectedTable(table)} 
          />

          {/* Fenêtre surgissante au clic sur une table */}
          {selectedTable && (
            <TableSessionModal
              table={selectedTable}
              onClose={() => setSelectedTable(null)}
              onOpenMenuForOrder={handleOpenMenuForOrder}
            />
          )}
        </div>
      ) : (
        /* Si une commande est sélectionnée, on affiche l'interface du Menu (Sprint 3) */
        <div className="animate-fade-in">
          <div className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm">
            <div>
              <button 
                onClick={handleBackToTables}
                className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                ← Retour au Plan de Salle
              </button>
              <h2 className="text-lg font-bold text-gray-900 mt-1">
                Prise de commande — Table {activeOrderContext.tableNumber}
              </h2>
            </div>
            <div className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1.5 rounded-full border border-blue-100">
              Facture #{activeOrderContext.orderId}
            </div>
          </div>

          {/* Ici on charge ta page de gestion du menu et des catégories */}
          {/* On lui passe l'orderId pour que chaque plat ajouté y soit lié */}
          <CategoriesPage 
            restaurantId={currentRestaurantId} 
            activeOrderId={activeOrderContext.orderId} 
          />
        </div>
      )}
    </div>
  );
}