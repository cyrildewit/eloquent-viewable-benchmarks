import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist/', '.astro/', '.cache/', 'build/', 'runs/', 'results/', 'node_modules/']),
  js.configs.recommended,
  tseslint.configs.strict,
  astro.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['src/**/*.{ts,astro}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }],
    },
  },
  prettier,
]);
