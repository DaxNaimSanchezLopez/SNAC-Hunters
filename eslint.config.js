// eslint.config.js  — RF-03
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

// RF-03.2, RF-03.3, RF-03.4, RNF-01.3: módulos prohibidos dentro de packages/engine
const ENGINE_BANNED_IMPORTS = [
  'react',
  'react-dom',
  'react/**',
  '@aws-sdk/**',
  'aws-amplify',
  'aws-amplify/**',
  'node:fs',
  'node:path',
  'node:os',
  'fs',
  'path',
];

export default [
  js.configs.recommended,
  {
    // RF-03.1: Regla de imports prohibidos — solo aplica a archivos dentro de packages/engine
    files: ['packages/engine/src/**/*.ts'],
    languageOptions: { parser: tsParser },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      'no-restricted-imports': ['error', { patterns: ENGINE_BANNED_IMPORTS }],
    },
  },
  {
    // Reglas @typescript-eslint recommended para todos los .ts y .tsx del monorepo
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tsParser },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // TypeScript ya detecta identificadores no definidos (recomendación oficial de typescript-eslint)
      'no-undef': 'off',
    },
  },
];
