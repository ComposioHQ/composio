/**
 * LLM guardrails — appended to .md responses by getLLMText().
 *
 * Pages opt into a guardrail set via frontmatter:
 *   llmGuardrails: "direct-execution" | "none"
 *
 * No frontmatter (default) → session guardrails.
 */

import { SESSION_GUARDRAILS } from './session';
import { DIRECT_EXECUTION_GUARDRAILS } from './direct-execution';

type GuardrailType = 'direct-execution' | 'none' | undefined;

export function getGuardrails(type: GuardrailType): string {
  switch (type) {
    case 'direct-execution':
      return DIRECT_EXECUTION_GUARDRAILS;
    case 'none':
      return '';
    default:
      return SESSION_GUARDRAILS;
  }
}

export { SESSION_GUARDRAILS, DIRECT_EXECUTION_GUARDRAILS };
