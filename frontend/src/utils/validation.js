const PATTERNS = {
  name: "[A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9 \\.,'’\\(\\)\\&\\/\\-]{1,158}",
  personName: "[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ '\\-]{1,79}",
  username: "[a-zA-Z0-9\\._\\-]{3,50}",
  slug: "[a-z0-9]+(?:-[a-z0-9]+)*",
  subdomain: "[a-z0-9]+(?:-[a-z0-9]+)*",
  phone: "\\+?[0-9 \\(\\)\\-]{5,30}",
  currency: "[A-Za-z]{3}",
  timezone: "[A-Za-z_]+/[A-Za-z0-9_\\+\\-\\/]+",
  url: "(https?://.+|/.+)",
  password: "(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,128}",
};

export const validationAttrs = {
  name: {
    pattern: PATTERNS.name,
    minLength: 2,
    maxLength: 160,
    title: "Utilisez 2 à 160 caractères: lettres, chiffres, espaces et ponctuation simple.",
  },
  personName: {
    pattern: PATTERNS.personName,
    minLength: 2,
    maxLength: 80,
    title: "Utilisez 2 à 80 caractères: lettres, espaces, apostrophes ou tirets.",
  },
  username: {
    pattern: PATTERNS.username,
    minLength: 3,
    maxLength: 50,
    title: "Utilisez 3 à 50 caractères: lettres, chiffres, point, tiret ou underscore.",
  },
  slug: {
    pattern: PATTERNS.slug,
    minLength: 2,
    maxLength: 80,
    title: "Utilisez des minuscules, chiffres et tirets, sans espace.",
  },
  subdomain: {
    pattern: PATTERNS.subdomain,
    minLength: 2,
    maxLength: 120,
    title: "Utilisez des minuscules, chiffres et tirets, sans espace ni point.",
  },
  phone: {
    pattern: PATTERNS.phone,
    minLength: 5,
    maxLength: 30,
    inputMode: "tel",
    title: "Entrez un numéro valide, avec chiffres, espaces, tirets et + optionnel.",
  },
  currency: {
    pattern: PATTERNS.currency,
    minLength: 3,
    maxLength: 3,
    title: "Entrez un code devise sur 3 lettres, par exemple XAF.",
  },
  timezone: {
    pattern: PATTERNS.timezone,
    maxLength: 80,
    title: "Entrez un fuseau IANA, par exemple Africa/Douala.",
  },
  url: {
    pattern: PATTERNS.url,
    maxLength: 500,
    inputMode: "url",
    title: "Entrez une URL commençant par http://, https:// ou /uploads/.",
  },
  password: {
    pattern: PATTERNS.password,
    minLength: 8,
    maxLength: 128,
    title: "Utilisez au moins 8 caractères avec minuscule, majuscule, chiffre et symbole.",
  },
  positiveNumber: {
    min: "0",
    step: "0.01",
  },
  positiveInteger: {
    min: "0",
    step: "1",
  },
};

export function validationFor(name, fallback = {}) {
  const byField = {
    name: validationAttrs.name,
    legal_name: validationAttrs.name,
    city: validationAttrs.name,
    country: validationAttrs.name,
    category: validationAttrs.name,
    first_name: validationAttrs.personName,
    last_name: validationAttrs.personName,
    owner_first_name: validationAttrs.personName,
    owner_last_name: validationAttrs.personName,
    username: validationAttrs.username,
    owner_username: validationAttrs.username,
    slug: validationAttrs.slug,
    subdomain: validationAttrs.subdomain,
    phone: validationAttrs.phone,
    owner_phone: validationAttrs.phone,
    owner_alt_phone: validationAttrs.phone,
    whatsapp_phone: validationAttrs.phone,
    currency: validationAttrs.currency,
    timezone: validationAttrs.timezone,
    website_url: validationAttrs.url,
    image_url: validationAttrs.url,
    logo_url: validationAttrs.url,
    cover_image_url: validationAttrs.url,
    password: validationAttrs.password,
    owner_password: validationAttrs.password,
  };
  return { ...(byField[name] ?? {}), ...fallback };
}
