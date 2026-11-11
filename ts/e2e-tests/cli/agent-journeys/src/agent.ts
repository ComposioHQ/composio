/**
 * A minimal agent: one model, one tool (`shell`), a loop that runs each
 * command the model asks for and hands back what it printed.
 *
 * It exists to drive the CLI the way a coding agent does, so it adds nothing
 * of its own: no planning prompt, no retries, no command rewriting. The one
 * other voice is the person the agent works for, who may answer when the model
 * stops to wait for them.
 */

export interface ShellCall {
  /** The provider's id for the tool call. */
  readonly id: string;
  readonly command: string;
}

export interface ShellOutcome {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Why the loop ended. */
export type StopReason =
  /** The model answered without asking for another command. */
  | 'finished'
  /** The turn limit was reached while the model still wanted to run commands. */
  | 'turn-limit'
  /** The model stopped for a reason of its own (`max_tokens`, `refusal`, …). */
  | { readonly provider: string };

export interface ModelTurn {
  readonly text: string;
  readonly calls: ReadonlyArray<ShellCall>;
  /** Set when the provider reports a stop the loop cannot continue from. */
  readonly stopped?: string;
}

/** One provider's wire format. It owns the conversation it sends. */
export interface ModelAdapter {
  readonly provider: 'anthropic' | 'openai';
  readonly model: string;
  /** Asks the model for its next turn, given everything recorded so far. */
  next(): Promise<ModelTurn>;
  /** Records the outcomes of the calls of the turn `next()` just returned. */
  record(results: ReadonlyArray<{ call: ShellCall; payload: string }>): void;
  /** Adds a message from the person, after a turn that asked for no command. */
  say(message: string): void;
}

export interface ExecutedCommand extends ShellOutcome {
  readonly command: string;
  /** The exact text the model received for this command. */
  readonly payload: string;
}

export interface Transcript {
  readonly commands: ReadonlyArray<ExecutedCommand>;
  /** The model's text, per turn, in order. */
  readonly messages: ReadonlyArray<string>;
  /** What the person answered, and after which model turn. */
  readonly replies: ReadonlyArray<{ readonly afterModelTurn: number; readonly text: string }>;
  readonly stop: StopReason;
  readonly modelTurns: number;
}

export const SHELL_TOOL = {
  name: 'shell',
  description:
    "Run a command line with sh in the user's terminal. Returns the exit code, stdout, and stderr.",
  parameters: {
    type: 'object' as const,
    properties: {
      command: { type: 'string', description: 'The command line to run.' },
    },
    required: ['command'],
    additionalProperties: false,
  },
};

/** The tool result as the model reads it. `exit_code` leads so a fixture can gate on it. */
export const toolPayload = (outcome: ShellOutcome): string =>
  JSON.stringify({ exit_code: outcome.exitCode, stdout: outcome.stdout, stderr: outcome.stderr });

export const runAgent = async (options: {
  adapter: ModelAdapter;
  /** Runs a command and returns its output, already scrubbed for the model. */
  execute: (command: string) => Promise<ShellOutcome>;
  /**
   * Hands the person what the model wrote in each turn, which may be nothing.
   * `waiting` is true when the model asked for no command; a returned string
   * is their reply, and the loop goes on with it.
   */
  hear?: (message: string, waiting: boolean) => string | undefined;
  /** Hard cap on model turns, so a looping model cannot run forever. */
  maxTurns: number;
}): Promise<Transcript> => {
  const commands: ExecutedCommand[] = [];
  const messages: string[] = [];
  const replies: Array<{ afterModelTurn: number; text: string }> = [];

  for (let turn = 1; turn <= options.maxTurns; turn += 1) {
    const { text, calls, stopped } = await options.adapter.next();
    if (text !== '') messages.push(text);
    if (stopped !== undefined) {
      return { commands, messages, replies, stop: { provider: stopped }, modelTurns: turn };
    }
    const waiting = calls.length === 0;
    // The person reads the text before the turn's commands run, as they would in a chat.
    const reply = options.hear?.(text, waiting);
    if (waiting) {
      if (reply === undefined) {
        return { commands, messages, replies, stop: 'finished', modelTurns: turn };
      }
      replies.push({ afterModelTurn: turn, text: reply });
      options.adapter.say(reply);
      continue;
    }

    const results: Array<{ call: ShellCall; payload: string }> = [];
    // One at a time: the commands share a home directory and a backend.
    for (const call of calls) {
      const outcome = await options.execute(call.command);
      const payload = toolPayload(outcome);
      commands.push({ command: call.command, ...outcome, payload });
      results.push({ call, payload });
    }
    options.adapter.record(results);
  }

  return { commands, messages, replies, stop: 'turn-limit', modelTurns: options.maxTurns };
};
