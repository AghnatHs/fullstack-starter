import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import moduleBoundaries from './scripts/eslint-module-boundaries.mjs';

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'packages/db/migrations/**'],
  },
  { ...js.configs.recommended, files: ['**/*.mjs'] },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}'],
    plugins: {
      starter: moduleBoundaries(dirname(fileURLToPath(import.meta.url))),
    },
    rules: {
      'starter/module-boundaries': 'error',
    },
  },
];
