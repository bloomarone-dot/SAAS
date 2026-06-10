// Constantes et helpers partages entre StockOperations et ses panneaux.
// Extrait pour reduire la taille du composant principal.

export const movementLabels = {
  IN: "Entrée vers magasin",
  OUT: "Sortie / consommation",
  TRANSFER: "Transfert magasin",
  ADJUSTMENT: "Ajustement inventaire",
};

export const productTypeLabels = {
  INGREDIENT: "Ingrédient / nourriture",
  BOISSON: "Boisson / vin",
  EMBALLAGE: "Emballage",
};

export const damageReasonLabels = {
  PERIME: "Périmé",
  VOL_COULAGE: "Vol / Coulage",
  CASSE_PREPARATION: "Erreur préparation / Cassé",
  OFFERT_GESTE: "Offert / Geste commercial",
  ECART_INVENTAIRE: "Écart d’inventaire",
};

export const locationLabels = {
  MAGASIN: "Stock magasin",
  CUISINE: "Stock cuisine",
  BOISSON: "Stock boisson",
};

export function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}
