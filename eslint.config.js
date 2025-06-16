import { antfu } from '@antfu/eslint-config'

export default antfu(
  {
    ignores: ['src/assets/**', 'src/env.d.ts', 'libs/**/*', 'resources/**/*', 'packages/ui/icons', 'packages/database/drizzle'],
  },
  {
    rules: {
      'curly': 'off',
      'unicorn/prefer-node-protocol': 'off',
      'no-console': 'off',
      'antfu/if-newline': 'off',
      'antfu/generic-spacing': 'off',
      'import/no-mutable-exports': 'off',
      'ts/ban-ts-comment': 'off',
      'eslint-comments/no-unlimited-disable': 'off',
      'ts/consistent-type-definitions': 'off',
      'dot-notation': 'off',
    },
  },
)
