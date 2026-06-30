import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { AdminCard, AdminPage, DashboardSection, EmptyState, Field, FilterBar, IconButton, PrimaryAction, SearchBox, SecondaryAction, StatCard, StatusPill, TableFooter } from "@/modules/admin/components/AdminUi";
import { menuApi } from "../services/menuApi";

const emptyForm = { name: "", description: "", image_url: "" };

export default function CategoriesPage({ restaurantId, role, showCreateOnMount = false }) {
  const [categories, setCategories] = useState([]);
  const [dishesByCategory, setDishesByCategory] = useState({});
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(showCreateOnMount);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const createOnly = showCreateOnMount;

  const visibleCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    return categories.filter((category) => !query || [category.name, category.description].join(" ").toLowerCase().includes(query));
  }, [categories, search]);
  const dishesCount = Object.values(dishesByCategory).reduce((total, rows) => total + rows.length, 0);
  const topCategories = [...categories]
    .sort((a, b) => (dishesByCategory[b.id]?.length || 0) - (dishesByCategory[a.id]?.length || 0))
    .slice(0, 5);

  useEffect(() => {
    loadCategories();
  }, [restaurantId]);

  useEffect(() => {
    setShowForm(showCreateOnMount);
  }, [showCreateOnMount]);

  async function loadCategories() {
    setLoading(true);
    setError("");
    try {
      const data = await menuApi.getCategories(restaurantId);
      const entries = await Promise.all(data.map(async (category) => [category.id, await menuApi.getDishesByCategory(category.id)]));
      setCategories(data);
      setDishesByCategory(Object.fromEntries(entries));
    } catch {
      setError("Impossible de charger les catégories du restaurant.");
    } finally {
      setLoading(false);
    }
  }

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function uploadImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imageUrl = await menuApi.uploadImage(file);
      setForm((current) => ({ ...current, image_url: imageUrl }));
    } catch (err) {
      setError(err.message || "Import image impossible.");
    } finally {
      event.target.value = "";
    }
  }

  async function createCategory(event) {
    event.preventDefault();
    try {
      const created = await menuApi.createCategory({
        restaurant_id: restaurantId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        image_url: form.image_url.trim() || null,
      });
      setCategories((current) => [created, ...current]);
      setDishesByCategory((current) => ({ ...current, [created.id]: [] }));
      setForm(emptyForm);
      if (!createOnly) {
        setShowForm(false);
      }
    } catch (err) {
      setError(err.message || "Création de la catégorie impossible.");
    }
  }

  async function deleteCategory(category) {
    if (!window.confirm(`Archiver "${category.name}" ?\n\nLa catégorie restera en base de données.`)) return;
    await menuApi.deleteCategory(category.id);
    setCategories((current) => current.filter((item) => item.id !== category.id));
  }

  if (loading) return <div className="p-6 text-sm font-semibold text-slate-500">Chargement des catégories...</div>;

  return (
    <AdminPage
      eyebrow={role === "CUISINE" ? "Cuisine" : "Catégories"}
      title={createOnly ? "Créer une catégorie" : "Gestion des catégories"}
      subtitle={createOnly ? "Renseignez les informations de la catégorie à ajouter au menu." : "Organisez vos catégories de plats pour une meilleure gestion de votre menu."}
      action={!createOnly && (
        <div className="flex flex-wrap gap-3">
          <PrimaryAction icon="Plus" onClick={() => setShowForm((value) => !value)}>{showForm ? "Fermer" : "Nouvelle catégorie"}</PrimaryAction>
          <SecondaryAction icon="Download" onClick={() => exportCsv(visibleCategories, dishesByCategory)}>Exporter</SecondaryAction>
        </div>
      )}
    >
      {error && <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-600">{error}</div>}

      {!createOnly && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Catégories" value={categories.length.toLocaleString("fr-FR")} icon="ClipboardList" trend="À jour" tone="info" />
          <StatCard label="Actives" value={categories.filter((category) => category.is_active).length.toLocaleString("fr-FR")} icon="CheckCircle2" trend="Disponibles" tone="success" />
          <StatCard label="Plats associés" value={dishesCount.toLocaleString("fr-FR")} icon="Utensils" trend="Carte" tone="default" />
          <StatCard label="Top catégorie" value={topCategories[0]?.name || "-"} icon="BarChart3" trend={`${dishesByCategory[topCategories[0]?.id]?.length || 0} plat(s)`} tone="warning" />
        </div>
      )}

      {showForm && (
        <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
          <AdminCard title="Informations générales">
            <form onSubmit={createCategory}>
              <div className="grid gap-4 md:grid-cols-2">
                <Field name="name" label="Nom de la catégorie" required value={form.name} onChange={updateForm} placeholder="Ex : Entrées, Plats principaux..." />
                <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 text-sm font-black text-slate-700">
                  <DashboardIcon name="Cloud" size={17} />
                  Cliquez pour télécharger
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadImage} className="hidden" />
                </label>
              </div>
              <Field name="description" label="Description" as="textarea" rows={3} value={form.description} onChange={updateForm} className="mt-4" placeholder="Décrivez cette catégorie..." />
              <Field name="image_url" label="URL image" value={form.image_url} onChange={updateForm} className="mt-4" />
              <div className="mt-5 flex justify-end">
                <PrimaryAction icon="Plus" type="submit">Enregistrer</PrimaryAction>
              </div>
            </form>
          </AdminCard>
          <AdminCard title="Aperçu de la catégorie">
            <div className="rounded-lg border border-slate-200 p-6 text-center">
              {form.image_url ? <img src={form.image_url} alt="" className="mx-auto h-20 w-20 rounded-full object-cover" /> : <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-[var(--dashboard-primary)]"><DashboardIcon name="Utensils" size={30} /></div>}
              <h3 className="mt-4 text-xl font-black text-slate-950">{form.name || "Entrées"}</h3>
              <StatusPill>Active</StatusPill>
              <p className="mx-auto mt-4 max-w-xs text-sm font-medium leading-6 text-slate-500">{form.description || "Découvrez nos plats soigneusement organisés pour vos clients."}</p>
            </div>
          </AdminCard>
        </div>
      )}

      {!createOnly && <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <DashboardSection
          title="Liste des catégories"
          description={`${visibleCategories.length.toLocaleString("fr-FR")} catégorie(s) selon la recherche`}
        >
          <FilterBar className="mb-5">
            <SearchBox value={search} onChange={setSearch} placeholder="Rechercher une catégorie..." />
          </FilterBar>
          <CategoriesTable categories={visibleCategories} dishesByCategory={dishesByCategory} onDelete={deleteCategory} role={role} />
        </DashboardSection>
        <div className="space-y-5">
          <DashboardSection title="Aperçu rapide">
            <Insight label="Catégories actives" value={categories.filter((category) => category.is_active).length} />
            <Insight label="Catégories inactives" value={categories.filter((category) => !category.is_active).length} />
            <Insight label="Plats sans catégorie" value="0" />
            <Insight label="Catégorie la plus utilisée" value={topCategories[0] ? `${topCategories[0].name} (${dishesByCategory[topCategories[0].id]?.length || 0})` : "-"} />
          </DashboardSection>
          <DashboardSection title="Top catégories">
            <div className="space-y-4">
              {topCategories.map((category, index) => (
                <div key={category.id}>
                  <div className="flex justify-between text-sm">
                    <span className="font-black text-slate-800">{index + 1}. {category.name}</span>
                    <span className="font-semibold text-slate-500">{dishesByCategory[category.id]?.length || 0} plats</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100"><span className="block h-2 rounded-full bg-[var(--dashboard-primary)]" style={{ width: `${Math.min(100, ((dishesByCategory[category.id]?.length || 0) / Math.max(dishesCount, 1)) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          </DashboardSection>
        </div>
      </div>}
    </AdminPage>
  );
}

function CategoriesTable({ categories, dishesByCategory, onDelete, role }) {
  if (!categories.length) return <EmptyState title="Aucune catégorie" text="Créez une catégorie pour organiser la carte." />;
  return (
    <>
    <div className="overflow-x-auto">
      <table className="lte-table min-w-[780px]">
        <thead>
          <tr>
            <th>Catégorie</th>
            <th>Description</th>
            <th>Nombre de plats</th>
            <th>Statut</th>
            <th>Date de création</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category.id}>
              <td>
                <div className="flex items-center gap-3">
                  {category.image_url ? <img src={category.image_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-[var(--dashboard-primary)]"><DashboardIcon name="ClipboardList" size={17} /></span>}
                  <span className="font-semibold text-slate-800">{category.name}</span>
                </div>
              </td>
              <td className="text-slate-500">{category.description || "Sans description"}</td>
              <td className="font-semibold text-[var(--dashboard-primary)]">{dishesByCategory[category.id]?.length || 0}</td>
              <td><StatusPill tone={category.is_active ? "green" : "red"}>{category.is_active ? "Active" : "Inactive"}</StatusPill></td>
              <td className="text-slate-500">{new Date(category.created_at).toLocaleDateString("fr-FR")}</td>
              <td className="text-right">
                <IconButton icon="Eye" title="Voir" />
                {role !== "CUISINE" && <IconButton icon="Trash2" title="Supprimer" tone="red" onClick={() => onDelete(category)} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <TableFooter count={categories.length} label="catégorie" plural="catégories" />
    </>
  );
}

function Insight({ label, value }) {
  return <div className="flex items-center justify-between py-3 text-sm"><span className="font-semibold text-slate-500">{label}</span><strong className="text-slate-950">{value}</strong></div>;
}

function exportCsv(rows, dishesByCategory) {
  const csv = ["Catégorie;Description;Plats;Statut", ...rows.map((category) => `${category.name};${category.description || ""};${dishesByCategory[category.id]?.length || 0};${category.is_active ? "Active" : "Inactive"}`)].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = "categories.csv";
  link.click();
}
