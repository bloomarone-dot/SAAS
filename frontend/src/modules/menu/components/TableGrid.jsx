import React, { useEffect, useMemo, useState } from 'react';
import { DashboardIcon } from '@/components/dashboard/icons';
import { useAutoRefresh } from '@/utils/useAutoRefresh';
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

export default function TableGrid({ restaurantId, onSelectTable }) {
  const [tables, setTables] = useState([]);
  const [form, setForm] = useState(emptyTable);
  const [showForm, setShowForm] = useState(false);
  const [roomFilter, setRoomFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadTables();
  }, [restaurantId]);

  useAutoRefresh(() => loadTables({ silent: true }), 8000, [restaurantId]);

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

  async function loadTables({ silent = false } = {}) {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const data = await tableApi.getTables(restaurantId);
      setTables(data);
    } catch {
      if (!silent) setError('Impossible de charger le plan de salle.');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function createTable(event) {
    event.preventDefault();
    try {
      const created = await tableApi.createTable(restaurantId, {
        name: form.name.trim(),
        capacity: Number(form.capacity || 1),
        room: form.room || 'Rez-de-chaussée',
      });
      setTables((current) => [...current, created]);
      setForm(emptyTable);
      setShowForm(false);
    } catch (err) {
      setError(err.message || 'Création de table impossible.');
    }
  }

  if (loading) return <div className="p-6 text-sm font-semibold text-slate-500">Chargement du plan de salle...</div>;

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <h2 className="text-xl font-black text-[#070528]">Plan des tables</h2>
          <Legend color="bg-emerald-600" label="Libre" />
          <Legend color="bg-orange-600" label="Occupée" />
          <Legend color="bg-amber-400" label="En attente d'addition" />
        </div>
        <div className="flex gap-2">
          <select value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)} className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm">
            <option value="ALL">Toutes les salles</option>
            {rooms.map((room) => <option key={room} value={room}>{room}</option>)}
          </select>
          <button type="button" onClick={loadTables} className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700">
            <DashboardIcon name="Activity" size={15} /> Actualiser
          </button>
          <button type="button" onClick={() => setShowForm((value) => !value)} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#f04438] px-3 text-xs font-black text-white">
            <DashboardIcon name="Plus" size={15} /> Table
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={createTable} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_180px_140px_auto]">
          <label className="space-y-1">
            <span className="text-xs font-black text-slate-500">
              Nom de la table <span className="text-red-500">*</span>
            </span>
            <input
              required
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
              type="number"
              value={form.capacity}
              onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-[#f04438]"
            />
          </label>
          <button type="submit" className="self-end rounded-lg bg-emerald-700 px-5 py-3 text-sm font-black text-white">
            Créer
          </button>
        </form>
      )}

      {error && <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-600">{error}</div>}

      <div className="overflow-x-auto">
        <div className="relative min-h-[450px] min-w-[920px] overflow-hidden border-[3px] border-slate-400 bg-white">
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
              <button type="button" onClick={() => setShowForm(true)} className="mt-3 rounded-lg bg-[#f04438] px-4 py-2 text-xs font-black text-white">Ajouter la première table</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VisualTable({ table, slot, fallbackNumber, onClick }) {
  const status = table.status || 'Libre';
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
      title={`${label} - ${table.room || 'Rez-de-chaussée'} - ${table.capacity} places`}
    >
      <span className="relative block h-24 w-28">
        <Chairs round={isRound} color={palette.chair} />
        <span className={`absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center border-2 text-xl font-black shadow-lg ${palette.table} ${sizeClass} ${isRound ? 'rounded-full' : 'rounded-lg'}`}>
          <span>{label}</span>
          <span className="text-[10px] font-black leading-none">{occupiedSeats}/{table.capacity}</span>
        </span>
        <span className="absolute -bottom-1 left-1/2 z-20 -translate-x-1/2 rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-700 shadow">
          {table.room || 'Rez-de-chaussée'} · {freeSeats} libre(s)
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
  const raw = table.name || table.number || String(fallbackNumber);
  const match = String(raw).match(/\d+/);
  return match ? match[0] : raw;
}

function tableSortValue(table) {
  const match = String(table.name || table.number || '').match(/\d+/);
  return match ? Number(match[0]) : Number(table.id || 0);
}
