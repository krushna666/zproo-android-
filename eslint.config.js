import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** A CSS hex colour (#rgb, #rrggbb, #rrggbbaa) in a string, template or JSX text. */
const HEX_COLOUR = String.raw`/(^|[^\w&])#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w-])/`;
const HEX_MESSAGE =
  'Use a design token class (bg-primary, text-muted, border-border, …) instead of a hex colour. See the UI Style SOP §2.1.';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.turbo/**',
      'prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    ...jsxA11y.flatConfigs.recommended,
  },
  {
    files: ['apps/web/src/**/*.tsx'],
    ignores: ['**/*.test.tsx', 'apps/web/src/test/**'],
    rules: {
      'react-refresh/only-export-components': ['warn', { allowExportNames: ['routes'] }],
    },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    rules: { 'no-console': 'error' },
  },
  // UI Style SOP §2.1: colours come from the 13 design tokens (Tailwind classes), never hex
  // literals. Illustrations (SceneArt) keep their own palette; tests may use fixtures.
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'packages/ui/src/**/*.{ts,tsx}'],
    ignores: ['**/SceneArt.tsx', '**/*.test.{ts,tsx}', 'apps/web/src/test/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `Literal[value=${HEX_COLOUR}]`,
          message: HEX_MESSAGE,
        },
        {
          selector: `TemplateElement[value.raw=${HEX_COLOUR}]`,
          message: HEX_MESSAGE,
        },
        {
          selector: `JSXText[value=${HEX_COLOUR}]`,
          message: HEX_MESSAGE,
        },
      ],
    },
  },
);
