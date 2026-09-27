// ESLint gates from SPEC §9.1 / CLAUDE.md.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { noSupabaseOutsideData } from './scripts/eslint-rules/no-supabase-outside-data.mjs';
import { noNestedComponents } from './scripts/eslint-rules/no-nested-components.mjs';
import { noEmoji } from './scripts/eslint-rules/no-emoji.mjs';

const local = {
  rules: {
    'no-supabase-outside-data': noSupabaseOutsideData,
    'no-nested-components': noNestedComponents,
    'no-emoji': noEmoji,
  },
};

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dev-dist/**',
      'node_modules/**',
      'scratch/**',
      'worker/dist/**',
      'supabase/functions/**', // Deno; linted by `deno lint` in CI
      'src/data/database.types.ts',
      'public/sw.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks, local },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'local/no-supabase-outside-data': 'error',
      'local/no-nested-components': 'error',
      'local/no-emoji': 'error',
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Network calls live only in src/data/.' },
      ],
    },
  },
  {
    // The data layer and the probes are the only places allowed to talk to Supabase / fetch.
    files: ['src/data/**', 'tests/security/**', 'tests/e2e/**', 'scripts/**', 'worker/**'],
    rules: { 'local/no-supabase-outside-data': 'off', 'no-restricted-globals': 'off' },
  },
  {
    files: ['worker/**', 'scripts/**', 'tests/**'],
    rules: { 'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }], 'no-console': 'off' },
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
