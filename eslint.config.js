// ESLint for the API (Node) and the web app (React), run from the repo root: npm run lint.
// Formatting (4-space indentation, 120 columns, quotes) is Prettier's job; eslint-config-prettier
// turns off the ESLint rules that would fight it. max-len still catches long comments and strings.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
    {
        ignores: ['**/node_modules/', '**/dist/', 'api/seed/', 'data/'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    prettier,
    {
        files: ['**/*.{js,mjs,cjs,ts,tsx}'],
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
        files: ['*.js', 'web/vite.config.ts'],
        languageOptions: { globals: globals.node },
    },
);
