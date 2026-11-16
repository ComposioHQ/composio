// Update the docs catalog claim here. Markdown and MDX use %TOOLKIT_COUNT%.
export const TOOLKIT_COUNT_LABEL = '1,500+';

export function resolveToolkitCount(text: string): string {
  return text.replaceAll('%TOOLKIT_COUNT%', TOOLKIT_COUNT_LABEL);
}

export const HOME_OG_DESCRIPTION = `Build AI agents with ${TOOLKIT_COUNT_LABEL} apps. Connect LLMs to external services like GitHub, Slack, Gmail, and more.`;
