import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

const reactPlugins = {
  react,
  'react-hooks': reactHooks,
  'react-refresh': reactRefresh,
}

const reactRules = {
  ...react.configs.recommended.rules,
  ...react.configs['jsx-runtime'].rules,
  ...reactHooks.configs.recommended.rules,
  'react/jsx-no-target-blank': 'off',
  'react/prop-types': 'off',
  'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
}

export default [
  { ignores: ['dist', 'android', 'ios'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: '19.2' } },
    plugins: reactPlugins,
    rules: {
      ...js.configs.recommended.rules,
      ...reactRules,
    },
  },
  // Arquivos TypeScript. Sem este bloco o ESLint ignora .ts/.tsx por completo —
  // era o caso até aqui, então nenhum componente de components/ui/ nem os
  // services migrados jamais passaram por lint.
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: '19.2' } },
    plugins: {
      ...reactPlugins,
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.reduce((acc, c) => ({ ...acc, ...c.rules }), {}),
      ...reactRules,
      // `any` é proibido pela stack contratada — erro, não aviso.
      '@typescript-eslint/no-explicit-any': 'error',
      // `no-unused-vars` do core dá falso positivo em tipos/interfaces.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]
