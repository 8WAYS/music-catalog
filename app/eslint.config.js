import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'public', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, __APP_VERSION__: 'readonly' } },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  // Хуки Preact живут по тем же правилам, что и в React: вызов в цикле или по условию ломает
  // порядок состояний (правило сразу нашло хуки после раннего return в Release.tsx).
  // exhaustive-deps не включаем: с Signals и осознанными зависимостями он даёт только ложные
  // срабатывания, а его советы ломают код — Editor сбрасывал бы несохранённый черновик при каждой
  // автопубликации, TagInput перестал бы видеть новые теги (зависимость allTags.value нужна).
  {
    files: ['src/**/*.tsx', 'src/hooks/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error' },
  },
);
