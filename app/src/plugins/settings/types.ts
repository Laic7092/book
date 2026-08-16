/**
 * ReaderSettings moved to core (../core/reader-settings) — core must not
 * import from plugins. This file keeps settings-plugin-private types and
 * re-exports the shared font type from core.
 */
export type { CustomFontFace } from "../../core/reader-settings";
