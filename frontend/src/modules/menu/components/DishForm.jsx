import { useState } from "react";

import { AdminCard, Field, PrimaryAction } from "@/modules/admin/components/AdminUi";
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
    <form onSubmit={handleSubmit}>
      <AdminCard
        title="Créer un plat"
        icon="UtensilsCrossed"
        footer={
          <PrimaryAction
            icon="Plus"
            type="submit"
            disabled={loading || !name.trim() || !categoryId || !price}
            className="ml-auto"
          >
            {loading ? "Ajout..." : "Ajouter le plat"}
          </PrimaryAction>
        }
      >
        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">
            {error}
          </div>
        )}

        <div className="grid gap-x-4 md:grid-cols-2">
          <Field label="Catégorie" required>
            <select
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="form-control"
              disabled={loading}
            >
              <option value="">Choisir</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Nom du plat"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Ndolé, Poulet DG, Jus de Bissap"
            disabled={loading}
          />

          <Field
            label="Prix de vente"
            required
            type="number"
            min="1"
            step="any"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Ex: 2500"
            disabled={loading}
          />

          <Field
            label="URL de l'image"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
            disabled={loading}
          />

          <Field label="Description du plat" required as="textarea" rows="3" className="md:col-span-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ingrédients, accompagnements..."
            disabled={loading}
          />

          <Field label="Importer une image" className="md:col-span-2">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleImageUpload}
              disabled={loading}
              className="block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-[#fff4ed] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#f04438]"
            />
          </Field>

          {imageUrl && (
            <img src={imageUrl} alt="" className="h-32 w-full rounded border border-slate-200 object-cover md:col-span-2" />
          )}
        </div>
      </AdminCard>
    </form>
  );
}
