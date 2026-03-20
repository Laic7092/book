/**
 * Color manipulation utilities for generating consistent colors
 * from strings and creating gradients.
 */

// Refined color palette for book covers and UI elements
const COLOR_PALETTE = [
  "#8b2e3a", // burgundy
  "#a64150", // rose
  "#7d3c5a", // plum
  "#5a4d6d", // aubergine
  "#4a5d7d", // slate
  "#3d6d7d", // teal
  "#2e7d6a", // forest
  "#5a7d4a", // olive
  "#7d6a3d", // ochre
  "#7d5a3d", // sienna
  "#8b4a2e", // rust
  "#6d4a5a", // mauve
] as const;

/**
 * Generate a consistent color from a string using a hash function.
 */
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

/**
 * Get the initial character from a title for cover display.
 */
export function getInitial(title: string): string {
  return title.charAt(0).toUpperCase() || "📖";
}

/**
 * Adjust a hex color by a percentage (positive = lighter, negative = darker).
 */
export function adjustColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = ((num >> 8) & 0x00ff) + amt;
  const B = (num & 0x0000ff) + amt;
  return (
    "#" +
    (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)
  );
}

/**
 * Generate a gradient for a book cover based on the title.
 */
export function getBookGradient(title: string): string {
  const baseColor = stringToColor(title);
  const shade = adjustColor(baseColor, -15);
  return `linear-gradient(145deg, ${baseColor} 0%, ${shade} 100%)`;
}

/**
 * Bookmark color options.
 */
export const BOOKMARK_COLORS = [
  { value: "#fbbf24", label: "Yellow" },
  { value: "#f472b6", label: "Pink" },
  { value: "#60a5fa", label: "Blue" },
  { value: "#34d399", label: "Green" },
  { value: "#a78bfa", label: "Purple" },
  { value: "#fb923c", label: "Orange" },
] as const;
