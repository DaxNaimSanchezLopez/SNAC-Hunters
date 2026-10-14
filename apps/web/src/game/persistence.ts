// Persistencia local en IndexedDB (idb-keyval). Sobrevive a cerrar y reabrir el navegador.
import { del, get, set } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';

const memory = new Map<string, string>();
const hasIdb = typeof indexedDB !== 'undefined';

/** Adaptador de almacenamiento para zustand/persist. Si no hay IndexedDB, cae a memoria. */
export const idbStorage: StateStorage = {
  async getItem(name) {
    if (!hasIdb) return memory.get(name) ?? null;
    try {
      return (await get<string>(name)) ?? null;
    } catch {
      return null;
    }
  },
  async setItem(name, value) {
    if (!hasIdb) {
      memory.set(name, value);
      return;
    }
    await set(name, value);
  },
  async removeItem(name) {
    if (!hasIdb) {
      memory.delete(name);
      return;
    }
    await del(name);
  },
};
