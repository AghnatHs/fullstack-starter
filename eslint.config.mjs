import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'packages/db/migrations/**'],
  },
  { ...js.configs.recommended, files: ['**/*.mjs'] },
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@starter/db', '@starter/db/*', '**/packages/db/**'],
              message: 'Database access belongs in apps/api.',
            },
          ],
        },
      ],
    },
  },
];
