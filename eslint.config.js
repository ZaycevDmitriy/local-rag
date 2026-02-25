import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'comma-dangle': ['error', 'always-multiline'],
      'indent': ['error', 2],
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
      }],
    },
  },
  {
    ignores: ['dist/', 'node_modules/'],
  },
);
