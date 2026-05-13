import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";
import AutoReadControls from "./AutoReadControls.vue";
import type { ReaderSession } from "../../core/session";

export const loadOn = "reader" as const;

let _session: (() => ReaderSession | null) | null = null;

export const getAutoReadSession = () => _session?.() ?? null;

export const autoReadPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "auto-read",
  name: "Auto Read",
  version: "1.0.0",
  setup(ctx) {
    _session = ctx.readerSession;
    ctx.ui.registerToolbarItem({ id: "auto-read", order: 10, component: AutoReadControls });
  },
};
