// RNF-02: Tests unitarios y de propiedades para SeededRng (Mulberry32)
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { SeededRng } from '../rng.js';

describe('SeededRng Unit Tests', () => {
  // RNF-02.3: Test con semilla fija que verifica determinismo
  it('RNF-02.3: dos instancias con la misma semilla numérica producen secuencias idénticas', () => {
    const seed = 12345;
    const rngA = new SeededRng(seed);
    const rngB = new SeededRng(seed);

    const valuesA = Array.from({ length: 10 }, () => rngA.next());
    const valuesB = Array.from({ length: 10 }, () => rngB.next());

    expect(valuesA).toEqual(valuesB);
  });

  it('RNF-02.1: dos instancias con la misma semilla string producen secuencias idénticas', () => {
    const seed = 'sherbet-forest-game-seed-13';
    const rngA = new SeededRng(seed);
    const rngB = new SeededRng(seed);

    const valuesA = Array.from({ length: 10 }, () => rngA.next());
    const valuesB = Array.from({ length: 10 }, () => rngB.next());

    expect(valuesA).toEqual(valuesB);
  });

  it('next() produce valores en el rango [0, 1)', () => {
    const rng = new SeededRng(999);
    for (let i = 0; i < 100; i++) {
      const val = rng.next();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('nextInt(min, max) devuelve enteros dentro del rango [min, max] inclusive', () => {
    const rng = new SeededRng('test-bounds');
    const min = 1;
    const max = 6;
    for (let i = 0; i < 100; i++) {
      const val = rng.nextInt(min, max);
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(min);
      expect(val).toBeLessThanOrEqual(max);
    }
  });

  it('dos semillas diferentes producen secuencias diferentes', () => {
    const rngA = new SeededRng(100);
    const rngB = new SeededRng(200);

    const valuesA = Array.from({ length: 5 }, () => rngA.next());
    const valuesB = Array.from({ length: 5 }, () => rngB.next());

    expect(valuesA).not.toEqual(valuesB);
  });
});

describe('SeededRng Property Tests', () => {
  // Property 8: RNG es determinista — dos instancias con el mismo seed producen secuencias idénticas
  // Validates: RNF-02.1, RNF-02.2
  it('Property 8: dos instancias con el mismo seed producen exactamente las mismas secuencias', () => {
    const seedArbitrary = fc.oneof(fc.integer(), fc.string({ minLength: 1 }));

    fc.assert(
      fc.property(seedArbitrary, fc.integer({ min: 1, max: 50 }), (seed, n) => {
        const rng1 = new SeededRng(seed);
        const rng2 = new SeededRng(seed);

        const seq1 = Array.from({ length: n }, () => rng1.next());
        const seq2 = Array.from({ length: n }, () => rng2.next());

        expect(seq1).toEqual(seq2);
      }),
    );
  });

  it('nextInt devuelve siempre un entero entre min y max para cualquier rango válido', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: 0, max: 2000 }),
        (seed, min, diff) => {
          const max = min + diff;
          const rng = new SeededRng(seed);
          const result = rng.nextInt(min, max);

          expect(Number.isInteger(result)).toBe(true);
          expect(result).toBeGreaterThanOrEqual(min);
          expect(result).toBeLessThanOrEqual(max);
        },
      ),
    );
  });
});
