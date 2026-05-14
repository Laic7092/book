import { reactive, computed } from "vue";

const instances = new Map<string, any>();

export function defineStore<
  Id extends string,
  State extends Record<string, any>,
  Getters extends Record<string, any>,
  Actions extends Record<string, (...args: any[]) => any>,
>(
  id: Id,
  options: {
    state: () => State;
    getters?: { [K in keyof Getters]: (state: State) => Getters[K] };
    actions?: Actions & ThisType<State & Getters & Actions & { $reset(): void }>;
  },
): () => State & Getters & Actions & { $reset(): void } {
  return (_pinia?: any) => {
    if (instances.has(id)) return instances.get(id);

    const state = reactive(options.state());

    for (const [key, fn] of Object.entries(options.getters ?? {})) {
      (state as any)[key] = computed(() => (fn as any)(state));
    }

    for (const [key, fn] of Object.entries(options.actions ?? {})) {
      (state as any)[key] = (fn as any).bind(state);
    }

    (state as any).$reset = () => {
      const fresh = options.state();
      for (const key of Object.keys(fresh)) {
        state[key as keyof typeof state] = fresh[key];
      }
    };

    instances.set(id, state);
    return state as unknown as State & Getters & Actions & { $reset(): void };
  };
}
