// RF-05.3: test trivial para verificar que Vitest está correctamente configurado
import { describe, it, expect } from 'vitest';
import { SeededRng, loadMonsters, MonsterSchema, startCombat } from '../index.js';

describe('trivial', () => {
  it('1 + 1 equals 2', () => {
    expect(1 + 1).toBe(2);
  });

  it('engine barrel exports SeededRng', () => {
    const rng = new SeededRng(42);
    expect(typeof rng.next()).toBe('number');
  });

  it('engine barrel exports loadMonsters', () => {
    expect(typeof loadMonsters).toBe('function');
  });

  it('engine barrel exports startCombat', () => {
    expect(typeof startCombat).toBe('function');
  });

  it('engine barrel exports MonsterSchema', () => {
    expect(MonsterSchema).toBeDefined();
  });
});
