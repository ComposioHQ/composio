/**
 * Stub file for @composio/core/generated exports.
 * Run `composio ts generate` to generate the actual toolkit types.
 */

const ERROR_MESSAGE = `
@composio/core/generated has not been initialized.
Please run \`composio ts generate\` in your project to generate the toolkit types.
`;

export const Toolkits = new Proxy(
  {},
  {
    get(_, prop) {
      throw new Error(ERROR_MESSAGE);
    },
  }
);
