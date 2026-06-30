import React, { useEffect, useMemo, useState } from 'react';
import { DashboardIcon } from '@/components/dashboard/icons';
import { DashboardSection, PageHeader, StatCard } from '@/modules/admin/components/AdminUi';
import { kitchenApi } from '../services/kitchenApi';

const columns = [
  { key: 'En attente', title: 'En attente', tone: 'orange', action: 'Lancer la préparation' },
  { key: 'En préparation', title: 'En préparation', tone: 'blue', action: 'Marquer prête' },
  { key: 'Prête', title: 'Prêtes', tone: 'green', action: 'Marquer servie' },
];

const nextStatus = { 'En attente': 'En préparation', 'En préparation': 'Prête', Prête: 'Servie' };

export default function KitchenDisplay({ filter = 'orders' }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function loadTickets() {
      if (document.hidden || !navigator.onLine) return;
      try {
        const data = await kitchenApi.getActiveTickets();
        if (mounted) {
          setTickets(data);
          setError('');
        }
      } catch (err) {
        if (mounted) setError('Impossible de charger les commandes en cuisine.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadTickets();
    const interval = window.setInterval(loadTickets, 5000);
    window.addEventListener('focus', loadTickets);
    document.addEventListener('visibilitychange', loadTickets);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', loadTickets);
      document.removeEventListener('visibilitychange', loadTickets);
    };
  }, []);

  const visibleColumns = useMemo(() => {
    if (filter === 'preparation') return columns.filter((column) => column.key === 'En préparation');
    if (filter === 'ready') return columns.filter((column) => column.key === 'Prête');
    return columns;
  }, [filter]);

  const pageCopy = useMemo(() => {
    if (filter === 'preparation') return ['Commandes en préparation', "Suivez les plats déjà lancés en cuisine."];
    if (filter === 'ready') return ['Commandes prêtes', "Validez les tickets prêts à partir en salle."];
    if (filter === 'urgent') return ['Commandes urgentes', "Priorisez les tickets qui dépassent le délai de préparation."];
    if (filter === 'notes') return ['Notes spéciales', "Consultez les consignes client et remarques de préparation."];
    return ['Commandes cuisine', "Gérez les commandes en temps réel et suivez l'avancement en cuisine."];
  }, [filter]);

  const stats = useMemo(() => ({
    EN_ATTENTE: tickets.filter((ticket) => ticket.status === 'En attente').length,
    EN_PREPARATION: tickets.filter((ticket) => ticket.status === 'En préparation').length,
    PRETE: tickets.filter((ticket) => ticket.status === 'Prête').length,
    URGENT: tickets.filter((ticket) => minutesSince(ticket.created_at) >= 20).length,
  }), [tickets]);

  async function advance(ticket) {
    const status = nextStatus[ticket.status];
    if (!status) return;
    try {
      await kitchenApi.updateTicketStatus(ticket.id, status);
      setTickets((current) => current
        .map((item) => (item.id === ticket.id ? { ...item, status } : item))
        .filter((item) => item.status !== 'Servie'));
    } catch {
      setError('Mise a jour du ticket impossible.');
    }
  }

  if (loading) return <div className="p-6 text-sm font-semibold text-slate-500">Chargement de l'ecran cuisine...</div>;

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Cuisine"
        title={pageCopy[0]}
        subtitle={pageCopy[1]}
      />

      {error && <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-600">{error}</div>}

      <div className="grid gap-4 md:grid-cols-4">
        <Metric icon="Clock3" label="Commandes en attente" value={stats.EN_ATTENTE} tone="orange" />
        <Metric icon="ChefHat" label="En préparation" value={stats.EN_PREPARATION} tone="blue" />
        <Metric icon="CheckCircle2" label="Prêtes" value={stats.PRETE} tone="green" />
        <Metric icon="AlertTriangle" label="Commandes urgentes" value={stats.URGENT} tone="red" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_280px]">
        <div className="grid gap-5 lg:grid-cols-3">
          {visibleColumns.map((column) => {
            const items = tickets.filter((ticket) => {
              const matchesColumn = ticket.status === column.key;
              const matchesUrgent = filter !== 'urgent' || minutesSince(ticket.created_at) >= 20;
              const matchesNotes = filter !== 'notes' || Boolean(ticket.notes);
              return matchesColumn && matchesUrgent && matchesNotes;
            });
            return (
              <DashboardSection
                key={column.key}
                title={column.title}
                action={<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{items.length}</span>}
              >
                <div className="space-y-3">
                  {items.map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} action={column.action} onAdvance={() => advance(ticket)} />
                  ))}
                  {items.length === 0 && <p className="py-10 text-center text-sm font-semibold text-slate-400">Aucune commande.</p>}
                </div>
              </DashboardSection>
            );
          })}
        </div>

        <aside className="space-y-4">
          <Panel title="Commandes urgentes">
            {tickets.filter((ticket) => minutesSince(ticket.created_at) >= 20).slice(0, 4).map((ticket) => (
              <div key={ticket.id} className="border-b border-slate-100 py-3 last:border-0">
                <p className="font-black text-[#070528]">#{ticket.order_id}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">Table {ticket.table_number} - {ticket.quantity}x {ticket.item_name}</p>
                <p className="mt-2 text-xs font-black text-red-500">{minutesSince(ticket.created_at)} min</p>
              </div>
            ))}
          </Panel>
          <Panel title="Avaries enregistrees">
            {['Four principal', 'Friteuse', 'Refrigerateur 2'].map((item) => (
              <div key={item} className="flex items-center gap-2 py-2 text-sm font-semibold text-slate-600">
                <DashboardIcon name="AlertTriangle" size={15} className="text-red-500" />
                {item}
              </div>
            ))}
          </Panel>
        </aside>
      </div>
    </section>
  );
}

function Metric({ icon, label, value, tone }) {
  const tones = { orange: 'warning', blue: 'info', green: 'success', red: 'danger' };
  return <StatCard icon={icon} label={label} value={value} tone={tones[tone] ?? 'default'} />;
}

function TicketCard({ ticket, action, onAdvance }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="font-black text-[#070528]">#{ticket.order_id}</p>
        <span className="text-xs font-black text-orange-500">{formatTime(ticket.created_at)}</span>
      </div>
      <p className="mt-2 text-xs font-semibold text-slate-500">Table {ticket.table_number}</p>
      <p className="mt-3 text-sm font-bold text-slate-700">{ticket.quantity}x {ticket.item_name}</p>
      {ticket.notes && <p className="mt-3 rounded bg-slate-50 p-2 text-xs font-semibold text-slate-500">{ticket.notes}</p>}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs font-black text-slate-500">{minutesSince(ticket.created_at)} min</span>
        <button type="button" onClick={onAdvance} className="lte-btn lte-btn-primary lte-btn-sm">
          {action}
        </button>
      </div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-base font-black text-[#070528]">{title}</h2>
      {children}
    </div>
  );
}

function minutesSince(value) {
  const created = new Date(value).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.round((Date.now() - created) / 60000));
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
