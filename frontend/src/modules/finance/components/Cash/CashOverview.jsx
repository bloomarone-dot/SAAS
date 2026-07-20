import { useEffect, useState } from "react";

import { money } from "../shared/format";
import { Panel } from "../shared/ui";

export function CashOverview({ registers, api, onMessage }) {
  const [balances, setBalances] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadBalances() {
      setLoading(true);
      const next = {};
      await Promise.all(
        (registers || []).map(async (register) => {
          try {
            const data = await api(`/api/v1/finance/cash-registers/${register.id}/balance`);
            next[register.id] = data?.balance ?? data?.amount ?? 0;
          } catch {
            next[register.id] = null;
          }
        }),
      );
      if (mounted) {
        setBalances(next);
        setLoading(false);
      }
    }
    if (registers?.length) loadBalances();
    else setLoading(false);
    return () => {
      mounted = false;
    };
  }, [registers, api]);

  const total = Object.values(balances).reduce((sum, value) => sum + Number(value || 0), 0);

  return (
    <section className="space-y-6">
      <Panel
        title="Solde caisse"
        description="C'est l'argent disponible dans la caisse du restaurant. Chaque sortie d'argent enregistrée (transport, livreur, loyer…) le diminue. Chaque vente encaissée l'augmente."
      >
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
          <p className="text-sm font-semibold text-emerald-800">Total disponible</p>
          <p className="mt-2 text-3xl font-black tabular-nums text-emerald-950">
            {loading ? "…" : money(total)}
          </p>
        </div>
      </Panel>

      <Panel title="Caisses configurées" description="Détail par point de caisse du restaurant.">
        {loading && <p className="text-sm font-semibold text-slate-500">Chargement des soldes…</p>}
        {!loading && !registers?.length && (
          <p className="text-sm font-semibold text-slate-500">Aucune caisse configurée.</p>
        )}
        {!loading && registers?.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {registers.map((register) => (
              <div key={register.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="font-black text-slate-900">{register.name}</p>
                <p className="text-xs font-semibold text-slate-500">{register.code || "Caisse principale"}</p>
                <p className="mt-3 text-xl font-black tabular-nums text-slate-950">
                  {balances[register.id] == null ? "—" : money(balances[register.id])}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-400">
                  {register.is_active === false ? "Inactive" : "Active"}
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </section>
  );
}
