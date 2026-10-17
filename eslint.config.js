// ESLint for the API (Node) and the web app (React), run from the repo root: npm run lint.
// Formatting (4-space indentation, 120 columns, quotes) is Prettier's, run through ESLint by
// eslint-plugin-prettier so formatting problems are lint errors (and in the SARIF report) like any
// other; its recommended config also turns off the ESLint rules that would fight Prettier. Markdown,
// HTML, YAML, JSON and CSS are linted only for that rule: Markdown and HTML need real parsers
// (@eslint/markdown, @html-eslint/parser) or the plugin formats them as JavaScript; the rest go
// through a plain-text parser.
// max-len still catches long comments and strings, which Prettier doesn't wrap.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import prettierPlugin from 'eslint-plugin-prettier';
import * as plainParser from 'eslint-parser-plain';
import markdown from '@eslint/markdown';
import * as htmlParser from '@html-eslint/parser';

const CODE = ['**/*.{js,mjs,cjs,ts,tsx}'];

export default tseslint.config(
    {
        ignores: ['**/node_modules/', '**/dist/', 'api/seed/', 'data/'],
    },
    // JavaScript and TypeScript rules only for code (they don't apply to Markdown and the rest).
    ...[js.configs.recommended, ...tseslint.configs.recommended].map((config) => ({ ...config, files: CODE })),
    { ...prettierRecommended, files: CODE },
    {
        files: CODE,
        rules: {
            // No single-letter names: variables, parameters, functions, catch errors.
            'id-length': ['error', { min: 2, properties: 'never' }],
            // One variable per declaration, each on its own line.
            'one-var': ['error', 'never'],
            'one-var-declaration-per-line': ['error', 'always'],
            'max-len': [
                'error',
                {
                    code: 120,
                    tabWidth: 4,
                    ignoreUrls: true,
                    ignoreStrings: true,
                    ignoreTemplateLiterals: true,
                    ignoreRegExpLiterals: true,
                },
            ],
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
            ],
            // == null / != null is the one allowed loose comparison (null or undefined).
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'prefer-const': 'error',
            'no-var': 'error',
        },
    },
    {
        files: ['api/**/*.ts'],
        languageOptions: { globals: globals.node },
    },
    {
        files: ['web/**/*.{ts,tsx}'],
        languageOptions: { globals: globals.browser },
        plugins: { 'react-hooks': reactHooks },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'error',
        },
    },
    {
        files: ['*.js', 'tools/**/*.js', 'web/vite.config.ts'],
        languageOptions: { globals: globals.node },
    },
    // Everything else Prettier formats, checked by the same prettier/prettier rule.
    {
        files: ['**/*.md'],
        plugins: { markdown, prettier: prettierPlugin },
        language: 'markdown/commonmark',
        rules: { 'prettier/prettier': 'error' },
    },
    {
        files: ['**/*.html'],
        languageOptions: { parser: htmlParser },
        plugins: { prettier: prettierPlugin },
        rules: { 'prettier/prettier': 'error' },
    },
    {
        files: ['**/*.{yml,yaml,json,css}'],
        languageOptions: { parser: plainParser },
        plugins: { prettier: prettierPlugin },
        rules: { 'prettier/prettier': 'error' },
    },
);
