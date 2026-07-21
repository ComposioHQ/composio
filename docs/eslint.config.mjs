import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

const utmMessage =
  'Links to the Composio dashboard must carry utm_source=docs plus utm_medium and utm_campaign so sign-ups can be attributed to docs (MDX links are checked by tests/static/utm-links.test.ts).';

const eslintConfig = defineConfig([
  ...nextVitals,
  {
    rules: {
      // Pre-existing violations across interactive components; warn until the
      // debt is burned down, then flip back to error.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Literal[value=/dashboard\\.composio\\.dev/]:not([value=/utm_source=/])',
          message: utmMessage,
        },
        {
          selector:
            'TemplateElement[value.raw=/dashboard\\.composio\\.dev/]:not([value.raw=/utm_source=/])',
          message: utmMessage,
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    '.source/**',
  ]),
]);

export default eslintConfig;