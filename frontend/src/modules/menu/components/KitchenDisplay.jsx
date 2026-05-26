import React, { useState, useEffect } from 'react';
import { kitchenApi } from '../services/kitchenApi';

export default function KitchenDisplay() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Charger les tickets de cuisine au démarrage et rafraîchir automatiquement
  useEffect(() => {
    async function loadTickets() {
      try {
        const data = await kitchenApi.getActiveTickets();
        setTickets(data);
      } catch (err) {
        setError('Impossible de charger les commandes en cuisine.');
      } finally {
        setLoading(false);
      }
    }

    loadTickets();
    // Système de rafraîchissement automatique toutes les 10 secondes
    const interval = setInterval(loadTickets, 10000);
    return () => clearInterval(interval);
  }, []);

  // Action : Faire progresser le statut du plat
  const handleStatusChange = async (ticketId, currentStatus) => {
    let nextStatus = 'COOKING';
    if (currentStatus === 'COOKING') nextStatus = 'READY';
    if (currentStatus === 'READY') nextStatus = 'SERVED';

    try {
      await kitchenApi.updateTicketStatus(ticketId, nextStatus);
      // Mettre à jour l'affichage localement sans attendre le rechargement
      setTickets((prev) =>
        prev
          .map((t) => (t.id === ticketId ? { ...t, status: nextStatus } : t))
          .filter((t) => t.status !== 'SERVED') // On retire si c'est déjà servi
      );
    } catch (err) {
      alert('Erreur lors du changement de statut.');
    }
  };

  if (loading) return <div className="p-6 text-sm text-gray-500">Chargement de l'écran cuisine...</div>;

  return (
    <div className="p-6 bg-gray-900 min-h-screen text-white space-y-6">
      {/* En-tête de l'écran cuisine */}
      <div className="border-b border-gray-800 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">ÉCRAN CUISINE (KDS)</h1>
          <p className="text-xs text-gray-400">Suivi des préparations et des cuissons en temps réel</p>
        </div>
        <div className="bg-gray-800 px-4 py-2 rounded-lg text-sm font-bold text-green-400 border border-gray-700">
          {tickets.length} Plats en cours
        </div>
      </div>

      {error && (
        <div className="p-3 text-sm bg-red-900 text-red-200 rounded-md border border-red-800">
          {error}
        </div>
      )}

      {/* Grille des bons de commande */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tickets.map((ticket) => {
          // Logique visuelle selon l'état de préparation
          let cardBg = "bg-yellow-50 border-yellow-200 text-yellow-900";
          let btnText = "Lancer la cuisson";
          let btnStyle = "bg-yellow-600 hover:bg-yellow-700 text-white";

          if (ticket.status === 'COOKING') {
            cardBg = "bg-blue-50 border-blue-200 text-blue-900";
            btnText = "Marquer comme Prêt";
            btnStyle = "bg-blue-600 hover:bg-blue-700 text-white";
          } else if (ticket.status === 'READY') {
            cardBg = "bg-green-50 border-green-200 text-green-900";
            btnText = "Récupéré par la serveuse";
            btnStyle = "bg-green-600 hover:bg-green-700 text-white";
          }

          return (
            <div key={ticket.id} className={`border rounded-xl shadow-md p-4 flex flex-col justify-between ${cardBg}`}>
              <div>
                <div className="flex justify-between items-start border-b border-black border-opacity-10 pb-2 mb-3">
                  <span className="text-xl font-black">TABLE {ticket.table_number}</span>
                  <span className="text-xs font-mono font-bold bg-white bg-opacity-60 px-2 py-0.5 rounded">
                    #{ticket.order_id}
                  </span>
                </div>

                <div className="space-y-1">
                  <p className="text-lg font-bold leading-tight">
                    <span className="text-xl font-extrabold mr-2">x{ticket.quantity}</span> 
                    {ticket.item_name}
                  </p>
                  {ticket.notes && (
                    <p className="text-xs font-medium italic bg-red-100 text-red-800 p-1.5 rounded mt-1">
                      ⚠️ Note : {ticket.notes}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <button
                  onClick={() => handleStatusChange(ticket.id, ticket.status)}
                  className={`w-full py-2.5 px-4 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${btnStyle}`}
                >
                  {btnText}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {tickets.length === 0 && (
        <div className="text-center py-20 text-gray-500 text-sm">
          Aucun plat en attente pour le moment. La cuisine est à jour !
        </div>
      )}
    </div>
  );
}