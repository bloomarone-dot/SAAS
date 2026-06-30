export const money = (value) =>
  `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;

export const today = () => new Date().toISOString().slice(0, 10);
