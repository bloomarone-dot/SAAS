import React from 'react';
import KitchenDisplay from '../components/KitchenDisplay';

export default function KitchenPage() {
  return (
    <div className="bg-gray-900 min-h-screen">
      {/* Chargement de l'écran de suivi des tickets */}
      <KitchenDisplay />
    </div>
  );
}