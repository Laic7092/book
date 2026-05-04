import PluginsPanel from "./PluginsPanel.vue";
import type { Plugin } from "../types";

export const corePlugin: Plugin = {
  id: "core",
  name: "Core",
  version: "1.0.0",
  core: true,
  modalComponents: { plugins: PluginsPanel },
};
