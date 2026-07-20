import { ArrowLeft } from "lucide-react";

export function AccountingModuleShell({ title, description, onBack, actions, children }) {
  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              <ArrowLeft size={16} />
              Retour au tableau de bord
            </button>
            <h2 className="mt-4 text-2xl font-black text-slate-950">{title}</h2>
            {description && (
              <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">
                {description}
              </p>
            )}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>
      {children}
    </section>
  );
}
