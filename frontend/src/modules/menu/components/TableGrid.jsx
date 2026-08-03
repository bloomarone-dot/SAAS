import React, { useEffect, useMemo, useState } from 'react';
import { DashboardIcon } from '@/components/dashboard/icons';
import { AdminFormModal, DashboardSection, FilterBar } from '@/modules/admin/components/AdminUi';
import { useAutoRefresh } from '@/utils/useAutoRefresh';
import { cacheTables, getCachedTables } from '@/utils/offlineCache';
import { isNetworkError } from '@/utils/network';
import { createLocalTable, isLocalId } from '@/offline';
import { validationFor } from '@/utils/validation';
import { tableApi } from '../services/tableApi';

const emptyTable = { name: '', capacity: 4, room: 'Rez-de-chaussée' };
const defaultRooms = ['Rez-de-chaussée', 'Terrasse'];

const tableSlots = [
  { left: 15, top: 10, shape: 'round' },
  { left: 29, top: 10, shape: 'round' },
  { left: 43, top: 10, shape: 'rect' },
  { left: 61, top: 10, shape: 'round' },
  { left: 79, top: 10, shape: 'square' },
  { left: 7, top: 39, shape: 'rect' },
  { left: 25, top: 39, shape: 'round' },
  { left: 43, top: 39, shape: 'round' },
  { left: 61, top: 39, shape: 'round' },
  { left: 82, top: 39, shape: 'square' },
  { left: 7, top: 69, shape: 'round' },
  { left: 25, top: 69, shape: 'round' },
  { left: 43, top: 69, shape: 'square' },
  { left: 61, top: 69, shape: 'round' },
  { left: 78, top: 69, shape: 'square' },
];

export default function TableGrid({ restaurantId, onSelectTable, readOnly = false }) {
  const [tables, setTables] = useState([]);
  const [form, setForm] = useState(emptyTable);
  const [showForm, setShowForm] = useState(false);
  const [roomFilter, setRoomFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    loadTables();
  }, [restaurantId]);

  useAutoRefresh(() => loadTables({ silent: true }), 8000, [restaurantId]);

  useEffect(() => {
    const onRemap = (event) => {
      if (event.detail?.kind !== 'table') return;
      setTables((current) =>
        current.map((table) =>
          String(table.id) === String(event.detail.localId)
            ? { ...table, id: event.detail.serverId, _local: false }
            : table,
        ),
      );
    };
    window.addEventListener('offline-id-remapped', onRemap);
    return () => window.removeEventListener('offline-id-remapped', onRemap);
  }, []);

  const rooms = useMemo(() => {
    const values = [...defaultRooms, ...tables.map((table) => table.room).filter(Boolean)];
    return [...new Set(values)];
  }, [tables]);

  const positionedTables = useMemo(() => {
    return [...tables]
      .filter((table) => roomFilter === 'ALL' || (table.room || 'Rez-de-chaussée') === roomFilter)
      .sort((a, b) => tableSortValue(a) - tableSortValue(b))
      .map((table, index) => ({ ...table, slot: tableSlots[index % tableSlots.length] }));
  }, [roomFilter, tables]);

  function mergeWithLocalTables(remoteTables = []) {
    const cached = getCachedTables(restaurantId) || [];
    const localOnly = cached.filter((table) => isLocalId(table.id));
    const byId = new Map((remoteTables || []).map((table) => [String(table.id), table]));
    for (const local of localOnly) {
      if (!byId.has(String(local.id))) byId.set(String(local.id), local);
    }
    return [...byId.values()];
  }

  async function loadTables({ silent = false } = {}) {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    if (!navigator.onLine) {
      const cached = getCachedTables(restaurantId);
      if (cached?.length) {
        setTables(cached);
        if (!silent) setNotice('Mode hors ligne : plan de salle depuis le cache local.');
      } else if (!silent) {
        setError('Hors ligne et aucun plan de salle en cache. Créez une table localement.');
      }
      if (!silent) setLoading(false);
      return;
    }
    try {
      const data = await tableApi.getTables(restaurantId);
      const merged = mergeWithLocalTables(data);
      setTables(merged);
      cacheTables(restaurantId, merged);
      if (!silent) setNotice('');
    } catch (error) {
      const cached = getCachedTables(restaurantId);
      if (cached?.length) {
        setTables(cached);
        if (!silent) setNotice('Connexion instable : affichage du plan de salle local.');
      } else if (!silent) setError(error.message || 'Impossible de charger le plan de salle.');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function createTableLocally(requestedTable) {
    const created = normalizeTable(
      await createLocalTable({
        restaurantId,
        name: requestedTable.name,
        room: requestedTable.room,
        capacity: requestedTable.capacity,
      }),
      requestedTable,
    );
    setTables((current) => [...current.filter((table) => String(table.id) !== String(created.id)), created]);
    setRoomFilter(created.room || 'Rez-de-chaussée');
    setForm(emptyTable);
    setShowForm(false);
    setError('');
    setNotice(`Table « ${created.name} » créée hors ligne. Elle sera synchronisée à la reconnexion.`);
    return created;
  }

  async function createTable(event) {
    event.preventDefault();
    const requestedTable = {
      name: form.name.trim(),
      capacity: Number(form.capacity || 1),
      room: form.room || 'Rez-de-chaussée',
    };
    if (!requestedTable.name) {
      setError('Indiquez un nom de table.');
      return;
    }

    if (!navigator.onLine) {
      try {
        await createTableLocally(requestedTable);
      } catch (err) {
        setError(err.message || 'Création locale de table impossible.');
      }
      return;
    }

    try {
      const created = normalizeTable(await tableApi.createTable(restaurantId, requestedTable), requestedTable);
      setTables((current) => [...current.filter((table) => String(table.id) !== String(created.id)), created]);
      setRoomFilter(created.room || 'Rez-de-chaussée');
      setForm(emptyTable);
      setShowForm(false);
      setNotice('');
      await loadTables({ silent: true });
    } catch (err) {
      if (isNetworkError(err)) {
        try {
          await createTableLocally(requestedTable);
          return;
        } catch (localErr) {
          setError(localErr.message || 'Création locale de table impossible.');
          return;
        }
      }
      setError(err.message || 'Création de table impossible.');
    }
  }

  if (loading) return <div className="p-6 text-sm font-semibold text-slate-500">Chargement du plan de salle...</div>;

  return (
    <DashboardSection
      title="Plan des tables"
      description="Vue salle avec disponibilité, occupation et accès rapide aux commandes."
    >
      <FilterBar
        right={
          <div className="flex flex-wrap gap-2">
            <select value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)} className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm">
              <option value="ALL">Toutes les salles</option>
              {rooms.map((room) => <option key={room} value={room}>{room}</option>)}
            </select>
            {!readOnly && (
              <button type="button" onClick={() => setShowForm((value) => !value)} className="lte-btn lte-btn-primary">
                <DashboardIcon name="Plus" size={15} /> Table
              </button>
            )}
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <Legend color="bg-emerald-600" label="Libre" />
          <Legend color="bg-orange-600" label="Occupée" />
          <Legend color="bg-amber-400" label="En attente d'addition" />
        </div>
      </FilterBar>

      {error && <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-600">{error}</div>}
      {notice && !error && (
        <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          {notice}
        </div>
      )}

      <AdminFormModal
        open={showForm && !readOnly}
        onClose={() => {
          setShowForm(false);
          setForm(emptyTable);
        }}
        title="Nouvelle table"
        description="Configurez le nom, la salle et le nombre de places."
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setForm(emptyTable);
              }}
              className="lte-btn lte-btn-default"
            >
              Annuler
            </button>
            <button type="submit" form="create-table-form" className="lte-btn lte-btn-primary">
              Créer
            </button>
          </>
        }
      >
        <form id="create-table-form" onSubmit={createTable} className="grid gap-4">
          <label className="space-y-1">
            <span className="text-xs font-black text-slate-500">
              Nom de la table <span className="text-red-500">*</span>
            </span>
            <input
              required
              name="name"
              {...validationFor("name")}
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ex: T1, Terrasse 2, VIP"
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-[#f04438]"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-black text-slate-500">
              Salle <span className="text-red-500">*</span>
            </span>
            <select
              required
              value={form.room}
              onChange={(event) => setForm((current) => ({ ...current, room: event.target.value }))}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-[#f04438]"
            >
              {rooms.map((room) => <option key={room} value={room}>{room}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-black text-slate-500">
              Places <span className="text-red-500">*</span>
            </span>
            <input
              required
              min="1"
              max="100"
              type="number"
              value={form.capacity}
              onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-[#f04438]"
            />
          </label>
        </form>
      </AdminFormModal>

      <div className="overflow-x-auto">
        <div className="relative min-h-[450px] min-w-[920px] overflow-hidden rounded-lg border border-slate-300 bg-white">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] bg-[size:120px_120px]" />
          <div className="absolute left-0 top-0 h-full w-12 border-r border-slate-200 bg-stone-100/80" />
          <div className="absolute bottom-0 left-[22%] h-10 w-44 border-x border-t border-stone-300 bg-stone-100 text-center text-sm font-black leading-10 text-slate-600">Entrée</div>
          <div className="absolute bottom-0 left-[58%] h-10 w-52 border-x border-t border-stone-300 bg-stone-100 text-center text-sm font-black leading-10 text-slate-600">Bar</div>
          <Plant className="left-10 top-9" />
          <Plant className="right-4 top-6" />
          <Plant className="bottom-20 left-4" />
          <Plant className="bottom-14 right-4" />
          <Plant className="bottom-4 right-2" />

          {positionedTables.map((table, index) => (
            <VisualTable
              key={table.id}
              table={table}
              slot={table.slot}
              fallbackNumber={index + 1}
              onClick={() => onSelectTable(table)}
            />
          ))}

          {positionedTables.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <p className="text-sm font-semibold text-slate-500">Aucune table configurée.</p>
              {!readOnly && (
                <button type="button" onClick={() => setShowForm(true)} className="mt-3 lte-btn lte-btn-primary lte-btn-sm">
                  Ajouter la première table
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardSection>
  );
}

function VisualTable({ table, slot, fallbackNumber, onClick }) {
  const status = table.status || 'Libre';
  const localPending = isLocalId(table.id) || Boolean(table._local);
  const occupiedSeats = Number(table.occupied_seats || 0);
  const freeSeats = Math.max(0, Number(table.free_seats ?? table.capacity ?? 0));
  const palette = {
    Libre: {
      table: 'border-emerald-300 bg-emerald-200 text-emerald-950 shadow-emerald-100',
      chair: 'border-emerald-300 bg-white',
    },
    Occupée: {
      table: 'border-orange-500 bg-orange-600 text-white shadow-orange-100',
      chair: 'border-orange-500 bg-orange-100',
    },
    Réservée: {
      table: 'border-amber-500 bg-amber-400 text-slate-950 shadow-amber-100',
      chair: 'border-amber-500 bg-amber-100',
    },
  }[status] || {
    table: 'border-emerald-300 bg-emerald-200 text-emerald-950 shadow-emerald-100',
    chair: 'border-emerald-300 bg-white',
  };
  const isRound = slot.shape === 'round';
  const sizeClass = slot.shape === 'rect' ? 'h-16 w-24' : 'h-16 w-16';
  const label = tableLabel(table, fallbackNumber);

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${slot.left}%`, top: `${slot.top}%` }}
      title={`${label} - ${table.room || 'Rez-de-chaussée'} - ${table.capacity} places${localPending ? ' (hors ligne)' : ''}`}
    >
      <span className="relative block h-24 w-28">
        <Chairs round={isRound} color={palette.chair} />
        <span className={`absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center border-2 text-xl font-black shadow-lg ${palette.table} ${sizeClass} ${isRound ? 'rounded-full' : 'rounded-lg'}`}>
          <span className="block max-w-full truncate px-1 text-center text-sm leading-tight">{label}</span>
          <span className="text-[10px] font-black leading-none">{occupiedSeats}/{table.capacity}</span>
        </span>
        <span className="absolute -bottom-1 left-1/2 z-20 -translate-x-1/2 rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-700 shadow">
          {localPending ? 'Hors ligne' : `${table.room || 'Rez-de-chaussée'} · ${freeSeats} libre(s)`}
        </span>
      </span>
    </button>
  );
}

function Chairs({ round, color }) {
  const chairs = round
    ? [
        'left-1/2 top-0 -translate-x-1/2',
        'right-2 top-4 rotate-45',
        'right-2 bottom-4 -rotate-45',
        'left-1/2 bottom-0 -translate-x-1/2',
        'left-2 bottom-4 rotate-45',
        'left-2 top-4 -rotate-45',
      ]
    : [
        'left-1/2 top-1 -translate-x-1/2',
        'right-1 top-1/2 -translate-y-1/2',
        'left-1/2 bottom-1 -translate-x-1/2',
        'left-1 top-1/2 -translate-y-1/2',
      ];
  return chairs.map((position) => (
    <span key={position} className={`absolute h-5 w-3 rounded-sm border ${color} ${position}`} />
  ));
}

function Plant({ className }) {
  return (
    <span className={`absolute h-12 w-12 ${className}`}>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((rotation) => (
        <span
          key={rotation}
          className="absolute left-1/2 top-1/2 h-6 w-3 origin-bottom rounded-full bg-emerald-500/70"
          style={{ transform: `translate(-50%, -100%) rotate(${rotation}deg)` }}
        />
      ))}
      <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-700" />
    </span>
  );
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-2 text-xs font-bold text-slate-500">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function tableLabel(table, fallbackNumber) {
  return String(table.name || table.number || `Table ${fallbackNumber}`);
}

function tableSortValue(table) {
  const match = String(table.name || table.number || '').match(/\d+/);
  return match ? Number(match[0]) : Number(table.id || 0);
}

function normalizeTable(table, fallback) {
  return {
    ...fallback,
    ...table,
    name: table?.name || table?.number || fallback.name,
    number: table?.number || table?.name || fallback.name,
    room: table?.room || fallback.room || 'Rez-de-chaussée',
    capacity: Number(table?.capacity || fallback.capacity || 1),
  };
}
