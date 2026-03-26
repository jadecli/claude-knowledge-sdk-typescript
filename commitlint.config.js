export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'init',
        'types',
        'agent',
        'knowledge',
        'context',
        'monitoring',
        'plugin',
        'crawler',
        'cli',
        'eval',
        'deps',
        'ci',
        'release',
        'security',
        'docs',
        'infra',
      ],
    ],
  },
};
