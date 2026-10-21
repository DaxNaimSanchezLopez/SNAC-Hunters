// Persistencia local en IndexedDB (idb-keyval). Sobrevive a cerrar y reabrir el navegador.
import { del, get, set } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';

// Algunos navegadores tienen IndexedDB pero no dejan abrirla (modo privado, almacenamiento
// restringido). Al primer fallo se usa localStorage el resto de la sesión, y si tampoco
// está disponible, memoria: el juego nunca se rompe por no poder guardar.
let idbUsable = typeof indexedDB !== 'undefined';

const memory = new Map<string, string>();

const fallback = {
  get(name: string): string | null {
    try {
      return localStorage.getItem(name) ?? memory.get(name) ?? null;
    } catch {
      return memory.get(name) ?? null;
    }
  },
  set(name: string, value: string): void {
    memory.set(name, value);
    try {
      localStorage.setItem(name, value);
    } catch {
      // Sin localStorage (o lleno): queda en memoria
    }
  },
  remove(name: string): void {
    memory.delete(name);
    try {
      localStorage.removeItem(name);
    } catch {
      // Sin localStorage: ya se borró de memoria
    }
  },
};

async function withIdb<T>(op: () => Promise<T>, otherwise: () => T): Promise<T> {
  if (!idbUsable) return otherwise();
  try {
    return await op();
  } catch {
    idbUsable = false;
    return otherwise();
  }
}

/** Adaptador de almacenamiento para zustand/persist: IndexedDB → localStorage → memoria. */
export const idbStorage: StateStorage = {
  getItem: (name) =>
    withIdb(
      async () => (await get<string>(name)) ?? null,
      () => fallback.get(name),
    ),
  setItem: (name, value) =>
    withIdb(
      () => set(name, value),
      () => fallback.set(name, value),
    ),
  removeItem: (name) =>
    withIdb(
      () => del(name),
      () => fallback.remove(name),
    ),
};
