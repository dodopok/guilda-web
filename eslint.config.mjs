// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    ignores: ['server/db/migrations/**', 'docs/**', 'scripts-dist/**'],
  },
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
)
