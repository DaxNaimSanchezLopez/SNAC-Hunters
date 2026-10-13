import { MonsterSchema } from './schemas.js';
import type { Monster } from './types.js';

/**
 * RF-09: Carga y valida un array de monstruos desde contenido JSON crudo.
 * D-04: La función es pura — no hace I/O. El caller es responsable de leer el JSON.
 *
 * @param raw - Contenido JSON crudo (resultado de JSON.parse o un objeto literal)
 * @returns Array de Monster válidos y tipados
 * @throws Error descriptivo si la entrada no es un array o contiene monstruos inválidos
 */
export function loadMonsters(raw: unknown): Monster[] {
  // RF-09.5: rechaza cualquier valor que no sea un array
  if (!Array.isArray(raw)) {
    throw new Error(
      `loadMonsters: se esperaba un array, se recibió ${typeof raw}`,
    );
  }

  // RF-09.2, RF-09.3: valida cada elemento con MonsterSchema
  return raw.map((item, index) => {
    const result = MonsterSchema.safeParse(item);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
        .join('\n');
      throw new Error(
        `loadMonsters: monstruo en índice ${index} es inválido:\n${issues}`,
      );
    }
    // RF-09.4: devuelve los datos sin modificar
    return result.data as Monster;
  });
}
