/** Small in-memory cache so identical AI requests aren't paid for twice. */
export function createTtlCache<V>({ maxEntries, ttlMs }: { maxEntries: number; ttlMs: number }) {
  const store = new Map<string, { value: V; expires: number }>();

  return {
    get(key: string, now: number = Date.now()): V | undefined {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expires <= now) {
        // Stryker disable next-line CallExpression: only frees memory; entries expire in the order they are evicted
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: V, now: number = Date.now()): void {
      store.delete(key);
      if (store.size >= maxEntries) store.delete(store.keys().next().value!);
      store.set(key, { value, expires: now + ttlMs });
    },
  };
}
