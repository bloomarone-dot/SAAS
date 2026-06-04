import { useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { menuApi } from "../services/menuApi";

export default function DishForm({ categories, onDishCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const parsedPrice = parseFloat(price);
    if (!name.trim() || !categoryId || isNaN(parsedPrice) || parsedPrice <= 0) {
      setError("Veuillez remplir correctement tous les champs requis.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload = {
        category_id: categoryId,
        name: name.trim(),
        description: description.trim(),
        price: parsedPrice,
        image_url: imageUrl.trim() || null,
        is_available: true,
      };

      const newDish = await menuApi.createDish(payload);

      setName("");
      setDescription("");
      setPrice("");
      setCategoryId("");
      setImageUrl("");

      if (onDishCreated) {
        onDishCreated(newDish);
      }
    } catch (err) {
      setError(err.message || "Impossible d'ajouter le plat");
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      setImageUrl(await menuApi.uploadImage(file));
    } catch (err) {
      setError(err.message || "Import de l'image impossible");
    } finally {
      event.target.value = "";
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-[#070528]">Créer un plat</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Ajoutez un produit vendable avec son prix et sa catégorie.
          </p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#f04438] text-white">
          <DashboardIcon name="UtensilsCrossed" size={19} />
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {error && (
          <div className="border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-600 md:col-span-2">
            {error}
          </div>
        )}

        <label className="block">
          <span className="text-xs font-black text-[#070528]">
            Catégorie <span className="text-red-500">*</span>
          </span>
          <select
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="mt-2 h-11 w-full border border-slate-200 bg-white px-3 text-sm font-black outline-none transition-all focus:border-[#f04438] focus:ring-4 focus:ring-[#fee4e2]"
            disabled={loading}
          >
            <option value="">Choisir</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-black text-[#070528]">
            Nom du plat <span className="text-red-500">*</span>
          </span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Ndolé, Poulet DG, Jus de Bissap"
            className="mt-2 h-11 w-full border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition-all placeholder:text-slate-400 focus:border-[#f04438] focus:ring-4 focus:ring-[#fee4e2]"
            disabled={loading}
          />
        </label>

        <label className="block">
          <span className="text-xs font-black text-[#070528]">
            Prix de vente <span className="text-red-500">*</span>
          </span>
          <input
            type="number"
            required
            min="1"
            step="any"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Ex: 2500"
            className="mt-2 h-11 w-full border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition-all placeholder:text-slate-400 focus:border-[#f04438] focus:ring-4 focus:ring-[#fee4e2]"
            disabled={loading}
          />
        </label>

        <label className="block md:col-span-2">
          <span className="text-xs font-black text-[#070528]">Description du plat</span>
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ingrédients, accompagnements..."
            rows="3"
            className="mt-2 w-full border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none transition-all placeholder:text-slate-400 focus:border-[#f04438] focus:ring-4 focus:ring-[#fee4e2]"
            disabled={loading}
          />
        </label>

        <label className="block">
          <span className="text-xs font-black text-[#070528]">URL de l'image</span>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
            className="mt-2 h-11 w-full border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition-all placeholder:text-slate-400 focus:border-[#f04438] focus:ring-4 focus:ring-[#fee4e2]"
            disabled={loading}
          />
        </label>

        <label className="block">
          <span className="text-xs font-black text-[#070528]">Importer une image</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={handleImageUpload}
            disabled={loading}
            className="mt-2 w-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 file:mr-3 file:border-0 file:bg-[#fff4ed] file:px-3 file:py-1.5 file:text-xs file:font-black file:text-[#f04438]"
          />
        </label>

        {imageUrl && (
          <img src={imageUrl} alt="" className="h-32 w-full border border-slate-200 object-cover md:col-span-2" />
        )}
      </div>

      <button
        type="submit"
        disabled={loading || !name.trim() || !categoryId || !price}
        className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#f04438] px-5 text-sm font-black text-white shadow-lg shadow-[#fecdca] transition-all hover:bg-[#d92d20] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <DashboardIcon name="Plus" size={17} />
        {loading ? "Ajout..." : "Ajouter le plat"}
      </button>
    </form>
  );
}
