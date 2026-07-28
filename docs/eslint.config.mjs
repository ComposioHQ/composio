import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

// Messages must not contain the literal hostnames or they trip their own selectors.
const utmMessage =
  'Links to the Composio dashboard must carry utm_source=docs plus utm_medium and utm_campaign so sign-ups can be attributed to docs (MDX links are checked by tests/static/dashboard-links.test.ts).';
const bannedHostMessage =
  'The app/platform composio hosts do not exist; link to the Composio dashboard with a go-link path instead.';
const goLinkMessage =
  'Composio dashboard links with a path must be go-links (/~/project/... or /~/org/...) or /login so they resolve inside the user workspace.';

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
        {
          selector:
            'Literal[value=/(?<![a-z0-9-])(app|platform)\\.composio\\.dev/]',
          message: bannedHostMessage,
        },
        {
          selector:
            'TemplateElement[value.raw=/(?<![a-z0-9-])(app|platform)\\.composio\\.dev/]',
          message: bannedHostMessage,
        },
        {
          selector:
            'Literal[value=/dashboard\\.composio\\.dev\\u002F(?!~\\u002F(project|org)([\\u002F?#]|$)|login([\\u002F?#]|$))/]',
          message: goLinkMessage,
        },
        {
          selector:
            'TemplateElement[value.raw=/dashboard\\.composio\\.dev\\u002F(?!~\\u002F(project|org)([\\u002F?#]|$)|login([\\u002F?#]|$))/]',
          message: goLinkMessage,
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