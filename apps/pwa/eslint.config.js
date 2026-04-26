import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  {
    // Third-party vendored code: self-host de Firebase SDK y pdf.js worker.
    // No debe ser lintado — es código minificado/UMD que trae sus propios globals (define, module, etc.)
    ignores: ['dist/**', 'node_modules/**', 'public/vendor/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['public/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        firebase: 'readonly',
        importScripts: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Baseline pragmático: evita bloquear CI/producción por deuda técnica existente.
      // Subir estas reglas gradualmente cuando el proyecto lo permita.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-unused-vars': 'off',
      'prefer-const': 'off',
      'no-empty': 'off',
      // console.* directo en app = deuda técnica; usar logger de @/lib/logger.
      // 'warn' para no bloquear CI mientras se migra el código existente.
      'no-console': 'warn',
    },
  },
  {
    // Refuerzo global por si alguna config recomendada reintroduce severidad.
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
