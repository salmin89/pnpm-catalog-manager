import { defineConfig } from 'oxfmt';

export default defineConfig({
  printWidth: 140,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
  overrides: [
    {
      files: ['*.md'],
      options: {
        tabWidth: 4,
      },
    },
  ],
  importOrderParserPlugins: ['typescript', 'decorators-legacy'],
  importOrder: ['<BUILTIN_MODULES>', '<THIRD_PARTY_MODULES>', '', '^~(.*)$', '', '^[./]'],
});
