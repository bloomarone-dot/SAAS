import { useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { menuApi } from "../services/menuApi";

function formatPrice(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

export default function DishCard({ dish, onDishUpdated, onDishDeleted, canDelete = true }) {
  const [loading, setLoading] = useState(false);

  const handleToggleAvailability = async () => {
    setLoading(true);
    try {
      const updatedDish = await menuApi.toggleDishAvailability(dish.id);
      if (onDishUpdated) {
        onDishUpdated(updatedDish);
      }
    } catch (err) {
      alert(err.message || "Impossible de changer la disponibilité");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Voulez-vous vraiment retirer "${dish.name}" du menu ?`)) {
      return;
    }

    setLoading(true);
    try {
      await menuApi.softDeleteDish(dish.id);
      if (onDishDeleted) {
        onDishDeleted(dish.id);
      }
    } catch (err) {
      alert(err.message || "Erreur lors de la suppression du plat");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex h-full flex-col justify-between border bg-white p-5 shadow-sm ${!dish.is_available ? "border-slate-200 opacity-75" : "border-slate-200"}`}>
      <div>
        {dish.image_url && (
          <img src={dish.image_url} alt="" className="mb-4 h-32 w-full object-cover" />
        )}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="truncate text-base font-black text-[#070528]">{dish.name}</h4>
            <p className="mt-1 text-xs font-bold text-slate-400">Carte restaurant</p>
          </div>
          <span className="shrink-0 bg-[#fff4ed] px-3 py-1 text-xs font-black text-[#f04438]">
            {formatPrice(dish.price)}
          </span>
        </div>

        <p className="mb-4 line-clamp-3 text-sm font-medium text-slate-500">
          {dish.description || "Sans description"}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
        <label className="inline-flex cursor-pointer select-none items-center">
          <input
            type="checkbox"
            checked={dish.is_available}
            onChange={handleToggleAvailability}
            disabled={loading}
            className="sr-only peer"
          />
          <div className="relative h-5 w-9 rounded-full bg-slate-200 peer peer-checked:bg-emerald-600 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
          <span className="ml-2 text-xs font-black text-slate-600">
            {dish.is_available ? "Disponible" : "Indisponible"}
          </span>
        </label>

        {canDelete && (
          <button
            onClick={handleDelete}
            disabled={loading}
            className="inline-flex h-9 w-9 items-center justify-center border border-red-100 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            title="Retirer du menu"
          >
            <DashboardIcon name="Trash2" size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
