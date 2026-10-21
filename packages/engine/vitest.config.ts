// RF-05.1: Configuración de Vitest con cobertura >= 90%
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // types.ts solo contiene tipos: no genera código ejecutable que cubrir
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/__tests__/**', 'src/types.ts'],
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
      },
      reporter: ['text', 'lcov'],
    },
  },
});
