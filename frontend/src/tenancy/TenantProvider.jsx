import { useEffect, useMemo, useState } from "react";

const DEFAULT_THEME = {
  primary_color: "#E4572E",
  secondary_color: "#0F172A",
  accent_color: "#F59E0B",
  background_color: "#FFFFFF",
  text_color: "#0F172A",
  button_color: "#078D50",
};

function normalizeHex(value) {
  return /^#[0-9A-Fa-f]{6}$/.test(value || "") ? value.toUpperCase() : null;
}

function hexToRgb(hex) {
  const clean = normalizeHex(hex) || DEFAULT_THEME.primary_color;
  return {
    r: parseInt(clean.slice(1, 3), 16),
    g: parseInt(clean.slice(3, 5), 16),
    b: parseInt(clean.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function mix(hex, targetHex, amount) {
  const source = hexToRgb(hex);
  const target = hexToRgb(targetHex);
  return rgbToHex({
    r: source.r + (target.r - source.r) * amount,
    g: source.g + (target.g - source.g) * amount,
    b: source.b + (target.b - source.b) * amount,
  });
}

function isDefaultTheme(restaurant = {}) {
  return ["primary_color", "secondary_color", "accent_color", "background_color", "text_color", "button_color"].every(
    (key) => !restaurant?.[key] || normalizeHex(restaurant[key]) === normalizeHex(DEFAULT_THEME[key]),
  );
}

function isDefaultValue(restaurant = {}, key) {
  return !restaurant?.[key] || normalizeHex(restaurant[key]) === normalizeHex(DEFAULT_THEME[key]);
}

async function extractDominantLogoColor(src) {
  if (!src || typeof window === "undefined") return null;

  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 48;
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, size, size);
        const pixels = context.getImageData(0, 0, size, size).data;
        const buckets = new Map();

        for (let index = 0; index < pixels.length; index += 16) {
          const alpha = pixels[index + 3];
          if (alpha < 180) continue;
          const r = pixels[index];
          const g = pixels[index + 1];
          const b = pixels[index + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if (max > 245 && min > 230) continue;
          if (max < 35) continue;
          if (max - min < 18) continue;

          const key = `${Math.round(r / 32) * 32},${Math.round(g / 32) * 32},${Math.round(b / 32) * 32}`;
          buckets.set(key, (buckets.get(key) || 0) + 1);
        }

        const dominant = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (!dominant) {
          resolve(null);
          return;
        }

        const [r, g, b] = dominant.split(",").map(Number);
        resolve(rgbToHex({ r, g, b }));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function buildTheme(restaurant = {}, logoColor = null) {
  const shouldUseLogo = logoColor && isDefaultTheme(restaurant);
  const primary = normalizeHex(shouldUseLogo ? logoColor : restaurant?.primary_color) || DEFAULT_THEME.primary_color;
  const secondary = normalizeHex(shouldUseLogo && isDefaultValue(restaurant, "secondary_color") ? mix(primary, "#000000", 0.78) : restaurant?.secondary_color) || mix(primary, "#000000", 0.78);
  const accent = normalizeHex(shouldUseLogo && isDefaultValue(restaurant, "accent_color") ? mix(primary, "#FFFFFF", 0.22) : restaurant?.accent_color) || mix(primary, "#FFFFFF", 0.22);
  const background = normalizeHex(restaurant?.background_color) || DEFAULT_THEME.background_color;
  const text = normalizeHex(restaurant?.text_color) || DEFAULT_THEME.text_color;
  const button = normalizeHex(shouldUseLogo && isDefaultValue(restaurant, "button_color") ? primary : restaurant?.button_color) || primary;

  return {
    primary_color: primary,
    secondary_color: secondary,
    accent_color: accent,
    background_color: background,
    text_color: text,
    button_color: button,
  };
}

export function tenantThemeStyle(restaurant = {}) {
  const theme = buildTheme(restaurant);
  return {
    "--tenant-primary": theme.primary_color,
    "--tenant-secondary": theme.secondary_color,
    "--tenant-accent": theme.accent_color,
    "--tenant-bg": theme.background_color,
    "--tenant-text": theme.text_color,
    "--tenant-button": theme.button_color || theme.primary_color,
    "--tenant-primary-soft": mix(theme.primary_color, "#FFFFFF", 0.88),
    "--tenant-accent-soft": mix(theme.accent_color, "#FFFFFF", 0.86),
    "--tenant-secondary-soft": mix(theme.secondary_color, "#FFFFFF", 0.9),
  };
}

export function TenantThemeProvider({ restaurant, children }) {
  const [logoColor, setLogoColor] = useState(null);

  useEffect(() => {
    let active = true;
    setLogoColor(null);
    if (!restaurant?.logo_url || !isDefaultTheme(restaurant)) return undefined;

    extractDominantLogoColor(restaurant.logo_url).then((color) => {
      if (active) setLogoColor(color);
    });

    return () => {
      active = false;
    };
  }, [restaurant?.logo_url, restaurant?.primary_color, restaurant?.secondary_color, restaurant?.accent_color, restaurant?.button_color]);

  const style = useMemo(() => {
    const theme = buildTheme(restaurant, logoColor);
    return {
      "--tenant-primary": theme.primary_color,
      "--tenant-secondary": theme.secondary_color,
      "--tenant-accent": theme.accent_color,
      "--tenant-bg": theme.background_color,
      "--tenant-text": theme.text_color,
      "--tenant-button": theme.button_color || theme.primary_color,
      "--tenant-primary-soft": mix(theme.primary_color, "#FFFFFF", 0.88),
      "--tenant-accent-soft": mix(theme.accent_color, "#FFFFFF", 0.86),
      "--tenant-secondary-soft": mix(theme.secondary_color, "#FFFFFF", 0.9),
    };
  }, [restaurant, logoColor]);

  return (
    <div style={style} className="min-h-screen bg-[var(--tenant-bg)] text-[var(--tenant-text)]">
      {children}
    </div>
  );
}
