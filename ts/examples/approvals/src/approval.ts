import {
  ComposioToolInputRequiredError,
  type ToolRouterInputRequest,
  type ToolRouterInputResponse,
  type ToolRouterSessionExecuteOptions,
} from '@composio/core';
import { z } from 'zod';

export type AskUser = (question: ToolRouterInputRequest) => Promise<ToolRouterInputResponse>;

// This terminal example supports the decision forms used for tool approvals.
// A general elicitation UI should render and validate the whole JSON Schema.
const approvalSchema = z.object({
  type: z.literal('object'),
  properties: z.object({
    decision: z.object({
      type: z.literal('string'),
      oneOf: z.array(z.object({ const: z.string(), title: z.string().optional() })).optional(),
      enum: z.array(z.string()).optional(),
    }),
  }),
});

export async function askForApproval(
  question: ToolRouterInputRequest,
  read: (prompt: string) => Promise<string>,
  show: (message: string) => void = console.log
): Promise<ToolRouterInputResponse> {
  if (question.mode !== 'form') throw new Error('This example supports form elicitation only');
  const schema = approvalSchema.parse(question.requestedSchema);
  const field = schema.properties.decision;
  const choices = field.oneOf?.map(choice => choice.const) ?? field.enum ?? [];
  if (choices.length === 0) throw new Error('Approval form has no decision choices');
  show(question.message);
  while (true) {
    const answer = (await read(`Decision (${choices.join('/')}; decline/cancel): `)).trim();
    if (answer === 'decline' || answer === 'cancel') return { action: answer };
    if (choices.includes(answer)) return { action: 'accept', content: { decision: answer } };
    show('Choose one of the displayed answers.');
  }
}

export async function runWithApprovals<T>(
  execute: (options: ToolRouterSessionExecuteOptions) => Promise<T>,
  askUser: AskUser
): Promise<T> {
  let answers: ToolRouterSessionExecuteOptions = {};
  while (true) {
    try {
      return await execute(answers);
    } catch (error) {
      // Only input-required responses may resume. Other errors must reach the caller.
      if (!(error instanceof ComposioToolInputRequiredError)) throw error;
      const inputResponses: NonNullable<ToolRouterSessionExecuteOptions['inputResponses']> = {};
      for (const [id, question] of Object.entries(error.inputRequests)) {
        inputResponses[id] = await askUser(question);
      }
      answers = { inputResponses, requestState: error.requestState };
    }
  }
}
