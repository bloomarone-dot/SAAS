import React from 'react';
import KitchenDisplay from '../components/KitchenDisplay';

export default function KitchenPage({ filter = 'orders' }) {
  return (
    <div className="min-h-screen bg-white">
      <KitchenDisplay filter={filter} />
    </div>
  );
}
