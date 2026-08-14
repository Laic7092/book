// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import type { Component } from "vue";
import {
  registerPlugin,
  setupPlugin,
  setBootstrap,
  teardownPlugin,
  setPluginEnabled,
  getAllPlugins,
  getPluginSetupErrors,
} from "./registry";
import {
  PLUGIN_BRAND,
  PLUGIN_API_VERSION,
  type Plugin,
  type PluginContext,
  type PluginStorageAdapter,
} from "./types";
import { registeredModals, registeredFooterActions } from "./context";

/**
 * Replace only the storage factory with an in-memory adapter so the manager's
 * own persistence (savePluginStates) runs without IndexedDB; everything else
 * (TrackedContext, registered* collections, event/hook buses) stays real.
 */
vi.mock("./context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./context")>();
  class MemoryAdapter implements PluginStorageAdapter {
    private map = new Map<string, unknown>();
    async get<T>(key: string): Promise<T | undefined> {
      return this.map.get(key) as T | undefined;
    }
    async put<T>(key: string, value: T): Promise<void> {
      this.map.set(key, value);
    }
    async getAll<T>(): Promise<T[]> {
      return [...this.map.values()] as T[];
    }
    async delete(key: string): Promise<void> {
      this.map.delete(key);
    }
    async clear(): Promise<void> {
      this.map.clear();
    }
  }
  return { ...actual, createPluginStorageAdapter: () => new MemoryAdapter() };
});

const bootstrap = { app: {} as never };

let counter = 0;
function makePlugin(overrides: Partial<Plugin> = {}): Plugin {
  counter++;
  return {
    [PLUGIN_BRAND]: true as const,
    id: `test-plugin-${counter}`,
    name: "Test Plugin",
    version: "1.0.0",
    ...overrides,
  };
}

function setupErrorOf(id: string): Error | undefined {
  const message = getPluginSetupErrors()[id];
  return message ? new Error(message) : undefined;
}

beforeEach(() => {
  setBootstrap(bootstrap);
});

describe("plugin lifecycle", () => {
  it("runs setup when apiVersion matches (explicit or omitted)", async () => {
    const explicit = makePlugin({ apiVersion: PLUGIN_API_VERSION, setup: vi.fn() });
    const omitted = makePlugin({ setup: vi.fn() });
    registerPlugin(explicit);
    registerPlugin(omitted);

    await setupPlugin(explicit.id);
    await setupPlugin(omitted.id);

    expect(explicit.setup).toHaveBeenCalledTimes(1);
    expect(omitted.setup).toHaveBeenCalledTimes(1);
    expect(setupErrorOf(explicit.id)).toBeUndefined();
    expect(setupErrorOf(omitted.id)).toBeUndefined();
  });

  it("rejects setup when apiVersion mismatches and records the error", async () => {
    const plugin = makePlugin({ apiVersion: 999, setup: vi.fn() });
    registerPlugin(plugin);

    await setupPlugin(plugin.id);

    expect(plugin.setup).not.toHaveBeenCalled();
    const err = setupErrorOf(plugin.id);
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain("apiVersion 999");
  });

  it("rolls back partial registrations when setup throws (no leak)", async () => {
    const onTeardown = vi.fn();
    const plugin = makePlugin({
      async setup(ctx, helpers) {
        ctx.ui.registerModal("leaky-modal", { render: () => null } as Component);
        ctx.events.on("book:opened", () => {});
        helpers.onTeardown(onTeardown);
        throw new Error("boom");
      },
    });
    registerPlugin(plugin);

    await setupPlugin(plugin.id);

    // The failing plugin's registrations must not survive.
    expect(registeredModals.value["leaky-modal"]).toBeUndefined();
    expect(onTeardown).toHaveBeenCalledTimes(1);
    const err = setupErrorOf(plugin.id);
    expect(err?.message).toContain("boom");
  });

  it("teardown unregisters UI and runs onTeardown callbacks", async () => {
    const onTeardown = vi.fn();
    const plugin = makePlugin({
      setup(ctx, helpers) {
        ctx.ui.registerModal("temp-modal", { render: () => null } as Component);
        ctx.ui.registerFooterAction({
          id: "temp-action",
          position: "menu",
          label: "Temp",
          icon: "",
          order: 1,
        });
        helpers.onTeardown(onTeardown);
      },
    });
    registerPlugin(plugin);
    await setupPlugin(plugin.id);

    expect(registeredModals.value["temp-modal"]).toBeDefined();
    expect(registeredFooterActions.value.some((a) => a.id === "temp-action")).toBe(true);

    await teardownPlugin(plugin.id);

    expect(registeredModals.value["temp-modal"]).toBeUndefined();
    expect(registeredFooterActions.value.some((a) => a.id === "temp-action")).toBe(false);
    expect(onTeardown).toHaveBeenCalledTimes(1);
  });

  it("core plugins cannot be toggled", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const plugin = makePlugin({ core: true, enabled: true, setup: vi.fn() });
    registerPlugin(plugin);

    await setPluginEnabled(plugin.id, false);

    expect(warn).toHaveBeenCalled();
    expect(plugin.enabled).toBe(true);
    expect(plugin.setup).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("enable runs setup, disable runs teardown, and persists state", async () => {
    const setup = vi.fn();
    const plugin = makePlugin({ enabled: false, setup });
    registerPlugin(plugin);
    const initial = getAllPlugins().find((p) => p.id === plugin.id)!;
    expect(initial.enabled).toBe(false);

    await setPluginEnabled(plugin.id, true);
    expect(setup).toHaveBeenCalledTimes(1);
    expect(getAllPlugins().find((p) => p.id === plugin.id)!.enabled).toBe(true);

    await setPluginEnabled(plugin.id, false);
    expect(getAllPlugins().find((p) => p.id === plugin.id)!.enabled).toBe(false);
  });

  it("expose/require: services are visible across plugins and removed on teardown", async () => {
    const provider = makePlugin({
      setup(ctx) {
        ctx.expose("example:svc", { hello: "world" });
      },
    });
    registerPlugin(provider);
    await setupPlugin(provider.id);

    // A second plugin (consumer) sees the service at its own setup time.
    const consumerSetup = vi.fn((ctx: PluginContext) => {
      expect(ctx.require<{ hello: string }>("example:svc")?.hello).toBe("world");
      expect(ctx.require("missing:svc")).toBeUndefined();
    });
    const consumer = makePlugin({ setup: consumerSetup });
    registerPlugin(consumer);
    await setupPlugin(consumer.id);
    expect(consumerSetup).toHaveBeenCalledTimes(1);

    // Teardown of the provider removes its service.
    await teardownPlugin(provider.id);
    const consumerSetup2 = vi.fn((ctx: PluginContext) => {
      expect(ctx.require("example:svc")).toBeUndefined();
    });
    const consumer2 = makePlugin({ setup: consumerSetup2 });
    registerPlugin(consumer2);
    await setupPlugin(consumer2.id);
    expect(consumerSetup2).toHaveBeenCalledTimes(1);
  });

  it("enable upgrades a metadata stub via its lazy module loader", async () => {
    const setup = vi.fn();
    // Stub: registered from metadata with no setup implementation.
    const stub = makePlugin({ enabled: false });
    registerPlugin(stub);

    const { pluginModuleLoaders } = await import("./registry");
    pluginModuleLoaders.set(stub.id, async () => {
      return {
        realPlugin: {
          [PLUGIN_BRAND]: true as const,
          id: stub.id,
          name: "Real Plugin",
          version: "2.0.0",
          setup,
        } satisfies Plugin,
      };
    });

    await setPluginEnabled(stub.id, true);

    expect(setup).toHaveBeenCalledTimes(1);
    const upgraded = getAllPlugins().find((p) => p.id === stub.id)!;
    expect(upgraded.version).toBe("2.0.0");
    expect(upgraded.enabled).toBe(true);
  });
});
