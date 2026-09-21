import { isDeepStrictEqual } from 'node:util';
import { jsonSchemaToZodSchema, type Tool, type beforeExecuteModifier } from '@composio/core';
import { TypesafeGateVetoError } from '@composio/typesafe';
import { z } from 'zod/v3';

// Illustrative conservative cutoff, not a universally calibrated probability.
export const EXAMPLE_INTENT_THRESHOLD = 0.9;
export const MAX_ARGUMENT_BYTES = 16_384;

const APPROVAL_TOOLS = new Set([
  'GMAIL_CREATE_EMAIL_DRAFT',
  'GMAIL_UPDATE_DRAFT',
  'GMAIL_SEND_DRAFT',
  'GMAIL_SEND_EMAIL',
  'GMAIL_REPLY_TO_THREAD',
  'GMAIL_FORWARD_MESSAGE',
  'GMAIL_ADD_LABEL_TO_EMAIL',
  'GMAIL_CREATE_LABEL',
  'GMAIL_MODIFY_THREAD_LABELS',
  'GMAIL_MOVE_TO_TRASH',
  'GMAIL_MOVE_THREAD_TO_TRASH',
  'GMAIL_UNTRASH_MESSAGE',
  'GMAIL_UNTRASH_THREAD',
]);

// These categories stay prohibited even if metadata incorrectly says read-only.
const PROHIBITED =
  /(?:^|_)(?:DELETE|BATCH|FILTERS?|FORWARDING|SEND_AS|LANGUAGE|POP|IMAP|SETTINGS?|VACATION|DELEGATES?|WATCH|STOP|SMIME|CSE)(?:_|$)/;
const ProposalSchema = z.object({
  name: z.string().regex(/^GMAIL_[A-Z0-9_]+$/),
  arguments: z.string(),
});
const ArgumentsSchema = z.record(z.string(), z.unknown());

export class Blocked extends Error {}

export function executionPolicy(tool: Tool): 'read' | 'confirm' {
  if (
    !tool.slug.startsWith('GMAIL_') ||
    PROHIBITED.test(tool.slug) ||
    tool.slug === 'GMAIL_REMOVE_LABEL'
  ) {
    throw new Blocked('Policy: prohibited tool. No action ran.');
  }
  // Explicit writes require approval even if their metadata says read-only.
  if (APPROVAL_TOOLS.has(tool.slug)) return 'confirm';
  if (tool.tags?.includes('readOnlyHint') && !tool.tags.includes('destructiveHint')) return 'read';
  throw new Blocked('Policy: mutation is not allowlisted. No action ran.');
}

/** Validate the entire proposal before entering the provider execution path. */
export function validateProposal(calls: unknown[], shortlist: Tool[]) {
  if (calls.length !== 1) throw new Blocked('Policy: expected one call. No action ran.');
  const parsed = ProposalSchema.safeParse(calls[0]);
  if (!parsed.success) throw new Blocked('Policy: malformed call. No action ran.');
  const call = parsed.data;
  const tool = shortlist.find(candidate => candidate.slug === call.name);
  if (!tool) throw new Blocked('Policy: tool is unknown or outside the shortlist. No action ran.');
  if (Buffer.byteLength(call.arguments, 'utf8') > MAX_ARGUMENT_BYTES) {
    throw new Blocked('Policy: oversized call. No action ran.');
  }
  let args: Record<string, unknown>;
  try {
    const original: unknown = JSON.parse(call.arguments);
    args = ArgumentsSchema.parse(original);
    if (!isDeepStrictEqual(original, args)) throw new Error();
    // JSON.parse accepts overflowing numbers such as 1e999. Reject those too.
    if (!isDeepStrictEqual(args, JSON.parse(JSON.stringify(args)))) throw new Error();
    if (
      !tool.inputParameters ||
      !jsonSchemaToZodSchema(tool.inputParameters).safeParse(args).success
    ) {
      throw new Error();
    }
  } catch {
    throw new Blocked('Policy: malformed arguments or unavailable schema. No action ran.');
  }
  // Keep the originals. Schema parsing may insert defaults or strip fields.
  return { tool, args, mode: executionPolicy(tool) };
}

export type Proposal = ReturnType<typeof validateProposal>;

/** Jev checks intent; this application alone authorizes execution. */
export function policyHook(
  proposal: Proposal,
  gate: beforeExecuteModifier,
  confirm: (proposal: Proposal) => Promise<string | undefined>,
  trace: (message: string) => void = console.log
): beforeExecuteModifier {
  let used = false;
  return async context => {
    if (used) throw new Blocked('Policy: one call per process. No additional action ran.');
    used = true;
    if (
      context.toolSlug !== proposal.tool.slug ||
      !isDeepStrictEqual(context.params.arguments, proposal.args)
    ) {
      throw new Blocked('Policy: call changed before execution. No action ran.');
    }
    const mode = executionPolicy(proposal.tool);
    trace(`Policy: ${mode === 'read' ? 'read-only' : 'confirmation required'}`);
    try {
      await gate(context);
    } catch (error) {
      if (error instanceof TypesafeGateVetoError) {
        throw new Blocked('Jev: veto. No action ran.');
      }
      throw new Blocked('Jev: unavailable or invalid check. No action ran.');
    }
    trace('Jev: allow');
    if (mode === 'confirm') {
      let answer: string | undefined;
      try {
        answer = await confirm(proposal);
      } catch {
        // Empty input, EOF, cancellation, and errors all deny the call.
      }
      if (answer !== 'yes') throw new Blocked('Confirmation: denied. No action ran.');
      trace('Confirmation: yes');
    }
    return context.params;
  };
}
