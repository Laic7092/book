/**
 * ReaderSettings moved to core (../core/reader-settings) — core must not
 * import from plugins. This file keeps only settings-plugin-private types.
 */

export interface CustomFontFace {
  id: string;
  name: string;
  data: string; // base64-encoded font data
  format: string; // "woff2" | "ttf" | "otf"
}
