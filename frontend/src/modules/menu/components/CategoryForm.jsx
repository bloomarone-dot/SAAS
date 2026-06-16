import { useState } from "react";

import { AdminCard, Field, PrimaryAction } from "@/modules/admin/components/AdminUi";
import { menuApi } from "../services/menuApi";

export default function CategoryForm({ restaurantId, onCategoryCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError("");

    try {
      const payload = {
        restaurant_id: restaurantId,
        name: name.trim(),
        description: description.trim() || null,
        image_url: imageUrl.trim() || null,
      };

      const newCategory = await menuApi.createCategory(payload);
      setName("");
      setDescription("");
      setImageUrl("");

      if (onCategoryCreated) {
        onCategoryCreated(newCategory);
      }
    } catch (err) {
      setError(err.message || "Impossible de créer la catégorie");
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
        title="Créer une catégorie"
        icon="ClipboardList"
        footer={
          <PrimaryAction icon="Plus" type="submit" disabled={loading || !name.trim()} className="ml-auto">
            {loading ? "Création..." : "Ajouter la catégorie"}
          </PrimaryAction>
        }
      >
        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">
            {error}
          </div>
        )}

        <Field
          label="Nom de la catégorie"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Entrées, grillades, boissons"
          disabled={loading}
        />

        <Field label="Description" as="textarea" rows="3"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Petite description pour la carte..."
          disabled={loading}
        />

        <Field label="URL de l'image"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://..."
          disabled={loading}
        />

        <Field label="Importer une image">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={handleImageUpload}
            disabled={loading}
            className="block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-[#fff4ed] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#f04438]"
          />
        </Field>

        {imageUrl && (
          <img src={imageUrl} alt="" className="h-28 w-full rounded border border-slate-200 object-cover" />
        )}
      </AdminCard>
    </form>
  );
}
