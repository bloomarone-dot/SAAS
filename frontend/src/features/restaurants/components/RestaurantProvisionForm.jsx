const fields = [
  ["name", "Nom du restaurant", "text", "Le Bon Coin"],
  ["slug", "Slug", "text", "le-bon-coin"],
  ["owner_first_name", "Prénom propriétaire", "text", "Brice"],
  ["owner_last_name", "Nom propriétaire", "text", "Mboule"],
  ["owner_email", "Email propriétaire", "email", "owner@restaurant.cm"],
  ["owner_username", "Nom utilisateur propriétaire", "text", "owner"],
  ["owner_password", "Mot de passe propriétaire", "password", "Minimum 8 caractères"],
];

export function RestaurantProvisionForm({ value, onChange, onSubmit, isLoading }) {
  return (
    <form onSubmit={onSubmit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
        <div className="border-b border-slate-200 bg-[#07133d] px-6 py-5 text-white md:px-7">
          <p className="text-xs font-black uppercase text-[#ffb4ad]">Nouveau tenant</p>
          <h2 className="mt-2 text-2xl font-black">Créer un restaurant</h2>
          <p className="mt-2 max-w-2xl text-sm font-medium text-white/75">
            Renseignez les informations de base du restaurant et de son propriétaire.
          </p>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-2 md:p-7">
          {fields.map(([name, label, type, placeholder]) => (
            <label key={name} className={name === "owner_email" ? "md:col-span-2" : ""}>
              <span className="mb-2 block text-sm font-black text-slate-900">{label}</span>
              <input
                name={name}
                type={type}
                value={value[name]}
                onChange={onChange}
                placeholder={placeholder}
                required
                minLength={name === "owner_password" ? 8 : undefined}
                pattern={name === "slug" ? "[a-z0-9-]+" : undefined}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#f04438] focus:ring-4 focus:ring-[#f04438]/10"
              />
            </label>
          ))}
        </div>

        <div className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50 px-6 py-5 md:flex-row md:items-center md:justify-between md:px-7">
          <p className="text-sm font-semibold text-slate-600">
            Le propriétaire aura le rôle administrateur du restaurant.
          </p>
          <button
            type="submit"
            disabled={isLoading}
            className="h-11 rounded-lg bg-[#f04438] px-6 font-black text-white shadow-[0_12px_28px_rgba(240,68,56,0.18)] transition-all hover:bg-[#d92d20] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? "Création..." : "Créer le restaurant"}
          </button>
        </div>
      </div>

      <aside className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
        <div className="border-b border-slate-200 bg-[#f04438] px-5 py-4 text-white">
          <h3 className="font-black">Provisionnement</h3>
          <p className="mt-1 text-xs font-semibold text-white/80">Créé automatiquement</p>
        </div>
        <div className="divide-y divide-slate-100">
          {[
            ["1", "Restaurant", "Tenant principal, compté comme restaurant"],
            ["2", "Branche initiale", "Affichée comme 1 branche par défaut"],
            ["3", "Propriétaire", "Compte admin avec accès complet"],
          ].map(([step, title, text]) => (
            <div key={step} className="flex gap-4 px-5 py-5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f04438]/10 text-sm font-black text-[#f04438]">
                {step}
              </span>
              <div>
                <p className="font-black text-[#07133d]">{title}</p>
                <p className="mt-1 text-sm font-medium leading-5 text-slate-500">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </form>
  );
}
