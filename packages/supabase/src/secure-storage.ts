export type SecureStorageDriver = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

type Manifest = { version: string; count: number };
function manifest(value: string | null): Manifest | null {
  try {
    const item = JSON.parse(value ?? 'null');
    return item && /^[a-z0-9-]+$/.test(item.version) && Number.isInteger(item.count) && item.count > 0 && item.count <= 256 ? item : null;
  } catch { return null; }
}

// Session JWTs can exceed SecureStore's per-value limit. Commit the manifest last,
// preserving the old session if any chunk write fails. Never fall back to plaintext.
export function createSecureStorage(driver: SecureStorageDriver) {
  // Serialize chunk operations per key. The SDK may overlap reads, refreshes,
  // and sign-out; a reader must not observe a manifest while its chunks change.
  const pending = new Map<string, Promise<void>>();
  function exclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const result = (pending.get(key) ?? Promise.resolve()).then(operation);
    const settled = result.then(() => {}, () => {});
    pending.set(key, settled);
    void settled.then(() => { if (pending.get(key) === settled) pending.delete(key); });
    return result;
  }
  async function cleanup(key: string, item: Manifest | null) {
    if (item) await Promise.allSettled(Array.from({ length: item.count }, (_, i) => driver.deleteItemAsync(`${key}.${item.version}.${i}`)));
  }
  const operations = {
    async getItem(key: string) {
      const item = manifest(await driver.getItemAsync(key));
      if (!item) return null;
      const parts = await Promise.all(Array.from({ length: item.count }, (_, i) => driver.getItemAsync(`${key}.${item.version}.${i}`)));
      return parts.some(part => part === null) ? null : parts.join('');
    },
    async setItem(key: string, value: string) {
      const previous = manifest(await driver.getItemAsync(key));
      const parts = value.match(/[\s\S]{1,400}/gu) ?? [''];
      if (parts.length > 256) throw new Error('Session exceeds secure storage capacity.');
      const item = { version: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, count: parts.length };
      try {
        // Sequential writes allow complete cleanup after a failed operation.
        for (const [i, part] of parts.entries()) await driver.setItemAsync(`${key}.${item.version}.${i}`, part);
        await driver.setItemAsync(key, JSON.stringify(item));
      } catch (error) { await cleanup(key, item); throw error; }
      await cleanup(key, previous);
    },
    async removeItem(key: string) {
      const previous = manifest(await driver.getItemAsync(key));
      await driver.deleteItemAsync(key);
      await cleanup(key, previous);
    },
  };
  return {
    getItem: (key: string) => exclusive(key, () => operations.getItem(key)),
    setItem: (key: string, value: string) => exclusive(key, () => operations.setItem(key, value)),
    removeItem: (key: string) => exclusive(key, () => operations.removeItem(key)),
  };
}
