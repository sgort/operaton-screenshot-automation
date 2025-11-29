import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  {
    // Global ignores
    ignores: [
      'node_modules/**',
      'output/**',
      'coverage/**',
      '*.min.js',
    ],
  },
  {
    // JavaScript files configuration
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
    rules: {
      // Possible Errors
      'no-console': 'off', // We need console for CLI tools
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      
      // Best Practices
      'curly': ['error', 'multi-line'],
      'default-case': 'warn',
      'dot-notation': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-else-return': 'warn',
      'no-empty-function': 'warn',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-return-await': 'warn',
      'no-throw-literal': 'error',
      'no-useless-catch': 'warn',
      'prefer-promise-reject-errors': 'error',
      'require-await': 'warn',
      
      // ES6+
      'arrow-body-style': ['warn', 'as-needed'],
      'no-var': 'error',
      'prefer-arrow-callback': 'warn',
      'prefer-const': 'error',
      'prefer-destructuring': ['warn', {
        array: false,
        object: true,
      }],
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
      'prefer-template': 'warn',
      
      // Style (handled by Prettier, but some semantic ones)
      'no-lonely-if': 'warn',
      'no-unneeded-ternary': 'warn',
      'operator-assignment': ['warn', 'always'],
      'prefer-object-spread': 'warn',
    },
  },
  // Prettier config (disables conflicting rules)
  eslintConfigPrettier,
];
