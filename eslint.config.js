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
      'src/vendor/**', // vendored third-party builds (pdf.js), minified as released
      'public/vendor/**', // pdf.js's image decoders, as released
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
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name=/^(toLocaleDateString|toLocaleTimeString|toLocaleString|toISOString|getTimezoneOffset)$/]",
          message: 'Dates are stored UTC and shown in the project zone through src/lib/dates only (CLAUDE.md rule 14).',
        },
        {
          selector: "JSXOpeningElement[name.name='input'] > JSXAttribute[name.name='type'][value.value=/^(date|time|datetime-local|month|week)$/]",
          message: 'Date and time boxes are TextField or DateInput (src/ui/Fields.tsx): a tap anywhere in the box opens the picker.',
        },
        ...['Literal[value', 'TemplateElement[value.raw'].map((node) => ({
          selector: `${node}=/(^|\\s)(truncate|text-ellipsis|line-clamp-\\w+)(\\s|$)/]`,
          message: 'Never cut a title off: let it wrap (break-words, or wrap-anywhere for long names with no spaces). CLAUDE.md rule 15.',
        })),
      ],
    },
  },
  {
    // The data layer and the probes are the only places allowed to talk to Supabase / fetch.
    files: ['src/data/**', 'tests/security/**', 'tests/e2e/**', 'scripts/**', 'worker/**'],
    rules: { 'local/no-supabase-outside-data': 'off', 'no-restricted-globals': 'off' },
  },
  {
    // The one place raw Date methods are allowed; everything else formats through it.
    files: ['src/lib/dates.ts', 'src/lib/dates.test.ts', 'src/data/**', 'worker/**', 'tests/**', 'scripts/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // Speed: a tool's code loads when it is first used (src/app/frame/lazyTools.ts, src/app/lazyPages.tsx). The frame,
    // ui, lib and data never import a feature's code, or that tool would ride along in everyone's first download.
    files: ['src/app/**', 'src/ui/**', 'src/lib/**', 'src/data/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/**'],
              allowTypeImports: true,
              message: 'Load tools through src/app/frame/lazyTools.ts or src/app/lazyPages.tsx; shared bits belong in src/lib.',
            },
          ],
        },
      ],
    },
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
