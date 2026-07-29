import React from 'react';
import KitchenDisplay from '../components/KitchenDisplay';

export default function KitchenPage({ filter = "orders", restaurantId = null }) {
  return (
    <div className="min-h-screen bg-white">
      <KitchenDisplay filter={filter} restaurantId={restaurantId} />
    </div>
  );
}
