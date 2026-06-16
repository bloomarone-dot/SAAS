import React, { useEffect, useMemo, useState } from 'react';
import { tableApi } from '../services/tableApi';

export default function TableSessionModal({ table, currentUser, onClose, onOpenMenuForOrder }) {
  const [activeOrders, setActiveOrders] = useState([]);
  const [partySize, setPartySize] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function loadActiveOrders() {
      setLoading(true);
      setError('');
      try {
        const data = await tableApi.getActiveOrders(table.id);
        if (mounted) setActiveOrders(data);
      } catch (err) {
        if (mounted) setError(err.message || 'Impossible de charger les commandes actives.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (table) loadActiveOrders();
    return () => {
      mounted = false;
    };
  }, [table]);

  const otherServerOrders = useMemo(
    () => activeOrders.filter((order) => order.server_id && order.server_id !== currentUser?.id),
    [activeOrders, currentUser?.id]
  );
  const currentServerOrders = useMemo(
    () => activeOrders.filter((order) => order.server_id === currentUser?.id),
    [activeOrders, currentUser?.id]
  );
  const occupiedSeats = useMemo(
    () => activeOrders.reduce((total, order) => total + Math.max(1, Number(order.party_size || 1)), 0),
    [activeOrders]
  );
  const freeSeats = Math.max(0, Number(table?.capacity || 0) - occupiedSeats);
  const requestedSeats = Math.max(1, Number(partySize || 1));
  const canCreateOrder = requestedSeats <= freeSeats;

  if (!table) return null;

  async function createSeparateOrder() {
    if (!canCreateOrder) {
      setError(`Places insuffisantes: ${freeSeats} place(s) libre(s) sur ${table.capacity}.`);
      return;
    }

    try {
      const result = await tableApi.createOrder(table.id, { party_size: requestedSeats });
      onOpenMenuForOrder(result.order.id, table.name || table.number, table.room);
      onClose();
    } catch (err) {
      setError(err.message || "Erreur lors de l'ouverture de la commande.");
    }
  }

  function openExistingOrder(order) {
    onOpenMenuForOrder(order.id, table.name || table.number, table.room);
    onClose();
  }

  return (
    <section className="overflow-hidden rounded border-t-4 border-t-[var(--dashboard-primary)] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-4">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--dashboard-primary)]">Ouverture de commande</p>
            <h3 className="mt-1 text-lg font-bold text-slate-800">Table {table.name || table.number}</h3>
            <p className="text-xs font-semibold text-slate-500">
              {table.room || 'Rez-de-chaussée'} · {occupiedSeats}/{table.capacity} place(s) occupée(s) · {freeSeats} libre(s)
            </p>
          </div>
          <button type="button" onClick={onClose} className="lte-btn lte-btn-default lte-btn-sm">
            Fermer
          </button>
        </div>

        <div className="space-y-5 p-6">
          {loading && <p className="text-sm font-semibold text-slate-500">Chargement des commandes actives...</p>}
          {error && <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-600">{error}</div>}

          {!loading && otherServerOrders.length > 0 && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
              <p className="text-sm font-black text-orange-900">
                Il y a déjà une commande active sur cette table gérée par une autre serveuse.
              </p>
              <p className="mt-1 text-sm font-semibold text-orange-800">
                Voulez-vous ouvrir une nouvelle commande séparée ?
              </p>
            </div>
          )}

          {!loading && currentServerOrders.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-black uppercase text-slate-500">Vos commandes actives</p>
              {currentServerOrders.map((order) => (
                <OrderRow key={order.id} order={order} onOpen={() => openExistingOrder(order)} />
              ))}
            </div>
          )}

          {!loading && otherServerOrders.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-black uppercase text-slate-500">Commandes des autres serveuses</p>
              {otherServerOrders.map((order) => (
                <OrderRow key={order.id} order={order} disabled />
              ))}
            </div>
          )}

          {!loading && activeOrders.length === 0 && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-center">
              <p className="text-sm font-black text-emerald-800">Cette table est libre.</p>
              <p className="mt-1 text-xs font-semibold text-emerald-700">Aucune commande active n'est rattachée à cette table.</p>
            </div>
          )}

          {!loading && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <label className="text-xs font-black uppercase text-slate-500" htmlFor="party-size">
                Nombre de personnes à installer
              </label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  id="party-size"
                  type="number"
                  min="1"
                  max={Math.max(1, freeSeats)}
                  value={partySize}
                  onChange={(event) => setPartySize(event.target.value)}
                  className="h-11 w-28 rounded border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-[var(--dashboard-primary)]"
                />
                <p className={`text-sm font-bold ${canCreateOrder ? 'text-emerald-700' : 'text-red-600'}`}>
                  {canCreateOrder
                    ? `${freeSeats - requestedSeats} place(s) resteront libres.`
                    : `Seulement ${freeSeats} place(s) libre(s).`}
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={createSeparateOrder}
              disabled={!canCreateOrder || loading || freeSeats <= 0}
              className="lte-btn lte-btn-primary"
            >
              {otherServerOrders.length > 0 ? 'Oui' : 'Ouvrir une commande'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded border border-slate-200 px-4 text-sm font-bold text-slate-700"
            >
              Annuler
            </button>
          </div>
        </div>
    </section>
  );
}

function OrderRow({ order, onOpen, disabled = false }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <div>
        <p className="text-sm font-black text-slate-900">Commande #{order.order_number}</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">Serveuse : {order.server_name}</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">{Number(order.party_size || 1)} personne(s)</p>
        <p className="mt-1 text-xs font-black text-[#f04438]">{Number(order.total_amount || 0).toLocaleString('fr-FR')} FCFA</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onOpen}
        className="lte-btn lte-btn-default lte-btn-sm"
      >
        Compléter
      </button>
    </div>
  );
}
