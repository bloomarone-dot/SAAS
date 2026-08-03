import { useMemo, useState } from "react";

import { AdminCard, Field, PrimaryAction } from "@/modules/admin/components/AdminUi";
import { parseFcfa } from "@/utils/money";
import { menuApi } from "../services/menuApi";

function isDrinkCategory(name = "") {
  return /boisson|cocktail|bar\b|vin\b|bi[eè]re|spiritueux|soft|soda|jus\b|whisky|rhum|caf[eé]|th[eé]/.test(
    name.trim().toLowerCase(),
  );
}

export default function DishForm({ categories, onDishCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [requiresKitchen, setRequiresKitchen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === categoryId),
    [categories, categoryId],
  );
  const drink = isDrinkCategory(selectedCategory?.name || "");

  const handleCategoryChange = (event) => {
    const nextId = event.target.value;
    setCategoryId(nextId);
    const category = categories.find((item) => item.id === nextId);
    setRequiresKitchen(!isDrinkCategory(category?.name || ""));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const parsedPrice = parseFcfa(price);
    if (!name.trim() || !categoryId || parsedPrice == null) {
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
        requires_kitchen: requiresKitchen,
      };

      const newDish = await menuApi.createDish(payload);

      setName("");
      setDescription("");
      setPrice("");
      setCategoryId("");
      setImageUrl("");
      setRequiresKitchen(true);

      if (onDishCreated) {
        onDishCreated(newDish);
      }
    } catch (err) {
      setError(err.message || `Impossible d'ajouter ${drink ? "la boisson" : "le plat"}`);
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
        title={drink ? "Créer une boisson" : "Créer un plat"}
        icon={drink ? "GlassWater" : "UtensilsCrossed"}
        footer={
          <PrimaryAction
            icon="Plus"
            type="submit"
            disabled={loading || !name.trim() || !categoryId || !price}
            className="ml-auto"
          >
            {loading ? "Ajout..." : drink ? "Ajouter la boisson" : "Ajouter le plat"}
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
              onChange={handleCategoryChange}
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
            label={drink ? "Nom de la boisson" : "Nom du plat"}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={drink ? "Ex: Coca-Cola, Jus de Bissap" : "Ex: Ndolé, Poulet DG"}
            disabled={loading}
          />

          <Field
            label="Prix de vente (FCFA)"
            required
            type="number"
            min="1"
            step="1"
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

          <Field
            label={drink ? "Description de la boisson" : "Description du plat"}
            required
            as="textarea"
            rows="3"
            className="md:col-span-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={drink ? "Contenance, marque..." : "Ingrédients, accompagnements..."}
            disabled={loading}
          />

          <label className="mb-4 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:col-span-2">
            <input
              type="checkbox"
              checked={requiresKitchen}
              onChange={(event) => setRequiresKitchen(event.target.checked)}
              className="mt-1"
              disabled={loading}
            />
            <span className="text-sm font-semibold text-slate-700">
              Préparer en cuisine
              <span className="mt-1 block text-xs font-medium text-slate-500">
                {drink
                  ? "Décochez pour les boissons bar (pas de ticket cuisine). Cochez pour jus frais / préparations."
                  : "Cochez pour les plats chauds envoyés en cuisine."}
              </span>
            </span>
          </label>

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
