/**
 * Theme Registry — core provides the mechanism, plugins provide the colors.
 *
 * - Core registers 3 builtin themes (light, dark, sepia) at startup.
 * - Plugins call `ctx.themes.register({ id, name, chrome, content })` to add
 *   new themes or override existing ones.
 * - `setTheme(id)` reads chrome colors and applies them as CSS variables on :root.
 * - `generateThemeCSS(id, contrast)` reads content colors for the reader iframe.
 */

// ── Type definitions ──

/** CSS variable values for the application chrome (reader container, modals, header). */
export interface ChromeTheme {
  bg: string;
  text: string;
  textSecondary: string;
  headerBg: string;
  border: string;
  borderSubtle: string;
  hoverBg: string;
  accent: string;
  accentSoft: string;
  accentMuted: string;
  accentHover: string;
  modalBg: string;
  modalText: string;
  progressTrack: string;
  bgElevated: string;
  bgSecondary: string;
  bgTertiary: string;
}

/** CSS variable values for the reader iframe (book content area). */
export interface ContentTheme {
  background: string;
  text: string;
  /** When omitted, computed from background/text in generateThemeCSS. */
  textSecondary?: string;
  /** When omitted, computed from background/text in generateThemeCSS. */
  borderSubtle?: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  chrome: ChromeTheme;
  content: ContentTheme;
}

// ── Registry ──

export class ThemeRegistry {
  private _themes = new Map<string, ThemeDefinition>();

  constructor(defaults?: ThemeDefinition[]) {
    if (defaults) {
      for (const t of defaults) {
        this._themes.set(t.id, t);
      }
    }
  }

  /** Register or override a theme. */
  register(theme: ThemeDefinition): void {
    this._themes.set(theme.id, theme);
  }

  /** Look up a theme by id. Falls back to "light". */
  get(id: string): ThemeDefinition {
    return this._themes.get(id) ?? this._themes.get("light")!;
  }

  /** Return all registered themes. */
  getAll(): ThemeDefinition[] {
    return Array.from(this._themes.values());
  }
}

// ── Builtin themes ──

const BUILTIN_THEMES: ThemeDefinition[] = [
  {
    id: "light",
    name: "Light",
    chrome: {
      bg: "#fdfcfb",
      text: "#1f1a17",
      textSecondary: "#6e6659",
      headerBg: "rgba(253, 252, 251, 0.9)",
      border: "#e6e2d8",
      borderSubtle: "rgba(90, 82, 72, 0.08)",
      hoverBg: "#f5f3ef",
      accent: "#8b2e3a",
      accentSoft: "rgba(139, 46, 58, 0.08)",
      modalBg: "#fdfcfb",
      modalText: "#1f1a17",
      progressTrack: "#e6e2d8",
      bgElevated: "#ffffff",
      bgSecondary: "#f7f5f2",
      bgTertiary: "#efece6",
      accentMuted: "rgba(139, 46, 58, 0.15)",
      accentHover: "#6d242e",
    },
    content: {
      background: "#ffffff",
      text: "#333333",
    },
  },
  {
    id: "dark",
    name: "Dark",
    chrome: {
      bg: "#1a1816",
      text: "#e8e4de",
      textSecondary: "#a8a094",
      headerBg: "rgba(26, 24, 22, 0.9)",
      border: "#3d3630",
      borderSubtle: "rgba(232, 228, 222, 0.06)",
      hoverBg: "#2a2622",
      accent: "#c45d6a",
      accentSoft: "rgba(196, 93, 106, 0.12)",
      modalBg: "#221f1c",
      modalText: "#e8e4de",
      progressTrack: "#3d3630",
      bgElevated: "#2a2622",
      bgSecondary: "#221f1c",
      bgTertiary: "#2d2924",
      accentMuted: "rgba(196, 93, 106, 0.15)",
      accentHover: "#a94d58",
    },
    content: {
      background: "#1a1a1a",
      text: "#e0e0e0",
    },
  },
  {
    id: "sepia",
    name: "Sepia",
    chrome: {
      bg: "#f5f0e6",
      text: "#3d352a",
      textSecondary: "#7a6f5a",
      headerBg: "rgba(245, 240, 230, 0.9)",
      border: "#c9bfa8",
      borderSubtle: "rgba(61, 53, 42, 0.08)",
      hoverBg: "#ebe5d5",
      accent: "#8b5a3a",
      accentSoft: "rgba(139, 90, 58, 0.1)",
      modalBg: "#f5f0e6",
      modalText: "#3d352a",
      progressTrack: "#c9bfa8",
      bgElevated: "#ebe5d5",
      bgSecondary: "#ebe5d5",
      bgTertiary: "#dfd6c2",
      accentMuted: "rgba(139, 90, 58, 0.15)",
      accentHover: "#6d462a",
    },
    content: {
      background: "#f4ecd8",
      text: "#5b4636",
    },
  },
];

/** Singleton registry shared across the app. */
export const themeRegistry = new ThemeRegistry(BUILTIN_THEMES);
