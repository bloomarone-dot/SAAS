import React, { useState } from 'react';
import { DashboardIcon } from '@/components/dashboard/icons';
import { PageContainer, PageHeader } from '@/modules/admin/components/AdminUi';
import TableGrid from '../components/TableGrid';
import TableSessionModal from '../components/TableSessionModal';
import DishesPage from './DishesPage';

export default function POSPage({ restaurantId, role, currentUser }) {
  const currentRestaurantId = restaurantId
  const [selectedTable, setSelectedTable] = useState(null);
  const [activeOrderContext, setActiveOrderContext] = useState(null);

  const handleOpenMenuForOrder = (orderId, tableNumber, tableRoom) => {
    setActiveOrderContext({
      orderId: orderId,
      tableNumber: tableNumber,
      tableRoom: tableRoom || "Rez-de-chaussée"
    });
  };

  const handleBackToTables = () => {
    setActiveOrderContext(null);
  };

  return (
    <PageContainer>
      {!activeOrderContext ? (
        <>
          <PageHeader
            eyebrow="Service"
            title="Espace prise de commande"
            subtitle="Sélectionnez une table libre ou occupée pour ouvrir une commande et accéder à la carte."
          />
          <TableGrid 
            restaurantId={currentRestaurantId} 
            onSelectTable={(table) => setSelectedTable(table)} 
          />
          {selectedTable && (
            <TableSessionModal
              table={selectedTable}
              currentUser={currentUser}
              restaurantId={currentRestaurantId}
              onClose={() => setSelectedTable(null)}
              onOpenMenuForOrder={handleOpenMenuForOrder}
            />
          )}
        </>
      ) : (
        <div className="animate-fade-in space-y-5">
          <PageHeader
            eyebrow="Commande en cours"
            title={`${activeOrderContext.tableRoom} · Table ${activeOrderContext.tableNumber}`}
            subtitle={`Facture #${activeOrderContext.orderId}`}
            secondaryActions={
              <button
                type="button"
                onClick={handleBackToTables}
                className="lte-btn lte-btn-default"
              >
                <DashboardIcon name="ArrowLeft" size={16} />
                Retour au plan
              </button>
            }
          />
          <DishesPage
            restaurantId={currentRestaurantId}
            role={role}
            activeOrderId={activeOrderContext.orderId}
          />
        </div>
      )}
    </PageContainer>
  );
}
