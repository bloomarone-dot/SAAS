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
    <form onSubmit={onSubmit} className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="border border-[#e7d8c9] bg-[#fffdf8] shadow-[0_18px_60px_rgba(87,52,26,0.08)]">
        <div className="border-b border-[#2a211c] bg-[#17110d] px-6 py-6 text-white md:px-8">
          <p className="text-xs font-black uppercase text-[#f6b23b]">Nouveau tenant restaurant</p>
          <h2 className="mt-2 text-2xl font-black">Créer un restaurant</h2>
          <p className="mt-2 max-w-2xl text-sm font-medium text-[#f7eadf]/80">
            Renseignez les informations de base du restaurant et de son propriétaire.
          </p>
        </div>

        <div className="grid gap-5 p-6 md:grid-cols-2 md:p-8">
          {fields.map(([name, label, type, placeholder]) => (
            <label key={name} className={name === "owner_email" ? "md:col-span-2" : ""}>
              <span className="mb-2 block text-sm font-black text-[#2d1f18]">{label}</span>
              <input
                name={name}
                type={type}
                value={value[name]}
                onChange={onChange}
                placeholder={placeholder}
                required
                minLength={name === "owner_password" ? 8 : undefined}
                pattern={name === "slug" ? "[a-z0-9-]+" : undefined}
                className="h-12 w-full border border-[#e7d8c9] bg-white px-4 text-sm font-semibold text-[#2d1f18] outline-none transition-all placeholder:text-[#b6a79a] focus:border-[#d7261e] focus:ring-4 focus:ring-[#f6b23b]/20"
              />
            </label>
          ))}
        </div>

        <div className="flex flex-col gap-4 border-t border-[#e7d8c9] bg-[#fff7ea] px-6 py-5 md:flex-row md:items-center md:justify-between md:px-8">
          <p className="text-sm font-semibold text-[#6f5a4a]">
            Le propriétaire aura le rôle administrateur du restaurant.
          </p>
          <button
            type="submit"
            disabled={isLoading}
            className="h-12 bg-[#d7261e] px-6 font-black text-white shadow-xl shadow-[#d7261e]/15 transition-all hover:bg-[#b91c16] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? "Création..." : "Créer le restaurant"}
          </button>
        </div>
      </div>

      <aside className="border border-[#e7d8c9] bg-[#221711] shadow-[0_18px_60px_rgba(34,23,17,0.12)]">
        <div className="border-b border-[#3b2a22] bg-[#d7261e] px-5 py-4 text-white">
          <h3 className="font-black">Provisioning</h3>
          <p className="mt-1 text-xs font-semibold text-white/80">Étapes créées automatiquement</p>
        </div>
        <div className="divide-y divide-[#3b2a22]">
          {[
            ["1", "Création du tenant", "Restaurant isolé dans la plateforme"],
            ["2", "Compte propriétaire", "Admin owner avec permissions complètes"],
            ["3", "Configuration par défaut", "Devise XAF et timezone Africa/Douala"],
          ].map(([step, title, text]) => (
            <div key={step} className="flex gap-4 px-5 py-5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#f6b23b] text-sm font-black text-[#221711]">
                {step}
              </span>
              <div>
                <p className="font-black text-white">{title}</p>
                <p className="mt-1 text-sm font-medium leading-5 text-[#f7eadf]/70">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </form>
  );
}
