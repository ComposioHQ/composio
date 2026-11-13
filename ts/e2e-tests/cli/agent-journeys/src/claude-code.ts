/**
 * Claude Code as the agent of a journey.
 *
 * The minimal loop in `agent.ts` puts the skill in its system prompt, so it
 * measures whether the skill's text steers a model that has already read it.
 * A user's agent finds the skill on its own, among others, from its
 * description. This driver runs the real harness inside the journey container,
 * headless, with the skill installed where Claude Code looks for it, so a run
 * also measures whether the skill is found and used.
 *
 * The binary is the Linux build Anthropic publishes to npm, fetched once per
 * version and mounted read-only. The container reaches the model only through
 * `model-proxy.ts`: it holds a one-off token, never the API key.
 */

import type { JournalEntry } from '@e2e-tests/cli-fake-backend';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { ExecutedCommand, StopReason } from './agent';
import type { ModelProxy } from './model-proxy';
import type { Driver } from './run-journey';
import { addTokens, ZERO_USAGE, type Usage } from './usage';

/** Pinned so two runs of the same skill measure the same harness. */
export const CLAUDE_CODE_VERSION = '2.1.310';

const CONTAINER_BINARY = '/opt/claude-code/claude';

/** How long Claude Code may take to exit once the run is over. */
const END_GRACE_MS = 10_000;

/** The tools the agent gets: a shell, reading files, and skills. No web, no subagents. */
const TOOLS = 'Bash,Read,Glob,Grep,Skill';

/** The Linux architecture of the Docker engine, in npm's naming. */
const dockerArchitecture = (): 'arm64' | 'x64' => {
  const reported = execFileSync('docker', ['info', '--format', '{{.Architecture}}'], {
    encoding: 'utf8',
  }).trim();
  if (reported === 'aarch64' || reported === 'arm64') return 'arm64';
  if (reported === 'x86_64' || reported === 'amd64') return 'x64';
  throw new Error(`Unsupported Docker architecture: ${reported}`);
};

/**
 * The host path of the Linux `claude` binary, downloaded on first use into
 * `~/.cache/composio-e2e/claude-code/`. `npm pack` checks the package against
 * the registry's integrity hash.
 */
export const ensureClaudeCodeBinary = (): string => {
  const architecture = dockerArchitecture();
  const directory = join(
    homedir(),
    '.cache',
    'composio-e2e',
    'claude-code',
    `${CLAUDE_CODE_VERSION}-linux-${architecture}`
  );
  const binary = join(directory, 'claude');
  if (existsSync(binary)) return binary;

  const scratch = mkdtempSync(join(tmpdir(), 'composio-e2e-claude-code-'));
  try {
    const packageName = `@anthropic-ai/claude-code-linux-${architecture}@${CLAUDE_CODE_VERSION}`;
    const tarball = execFileSync(
      'npm',
      ['pack', packageName, '--pack-destination', scratch, '--silent'],
      { encoding: 'utf8' }
    )
      .trim()
      .split('\n')
      .at(-1);
    if (!tarball) throw new Error(`npm pack ${packageName} printed no file name`);
    execFileSync('tar', ['xzf', join(scratch, tarball), '-C', scratch]);
    mkdirSync(directory, { recursive: true });
    renameSync(join(scratch, 'package', 'claude'), binary);
    chmodSync(binary, 0o755);
    return binary;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
};

const ContentBlock = z.looseObject({
  type: z.string(),
  id: z.string().optional(),
  name: z.string().optional(),
  text: z.string().optional(),
  input: z.unknown().optional(),
  tool_use_id: z.string().optional(),
  content: z.unknown().optional(),
  is_error: z.boolean().optional(),
});

const StreamEvent = z.looseObject({
  type: z.string(),
  subtype: z.string().optional(),
  message: z.looseObject({ content: z.union([z.string(), z.array(ContentBlock)]) }).optional(),
  tool_use_result: z.unknown().optional(),
  result: z.string().optional(),
  is_error: z.boolean().optional(),
  num_turns: z.number().optional(),
  total_cost_usd: z.number().optional(),
  usage: z
    .looseObject({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
      cache_read_input_tokens: z.number().optional(),
      cache_creation_input_tokens: z.number().optional(),
    })
    .optional(),
});

const BashInput = z.looseObject({ command: z.string() });
const BashResult = z.looseObject({ stdout: z.string(), stderr: z.string() });
const TextPart = z.looseObject({ type: z.literal('text'), text: z.string() });

/** A tool result's text, whether Claude Code sent a string or text blocks. */
const resultText = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .flatMap(part => {
      const parsed = TextPart.safeParse(part);
      return parsed.success ? [parsed.data.text] : [];
    })
    .join('\n');
};

const userMessage = (text: string): string =>
  `${JSON.stringify({ type: 'user', message: { role: 'user', content: text } })}\n`;

export interface ClaudeCodeOptions {
  readonly model: string;
  readonly proxy: ModelProxy;
  readonly binary: string;
  /** Install the skill (`true`), or run without it. */
  readonly withSkill: boolean;
  /** Claude Code stops itself once a run has cost this much. */
  readonly budgetUsd: number;
  /** Wall-clock limit for the agent; the run is cut off after it. */
  readonly deadlineMs: number;
  /** Cut-off for shell commands, so a looping agent cannot run forever. */
  readonly maxCommands: number;
  /** Every stream event, for the run's log. */
  readonly onEvent?: (event: unknown) => void;
}

export const claudeCodeDriver = (options: ClaudeCodeOptions): Driver => ({
  skill: options.withSkill ? 'claude-code-skills' : 'none',
  scrubbed: false,
  readOnlyMounts: [{ source: options.binary, target: CONTAINER_BINARY }],
  drive: async ({ rig, journey, person }) => {
    const environment: Record<string, string> = {
      ANTHROPIC_BASE_URL: options.proxy.dockerUrl,
      ANTHROPIC_API_KEY: options.proxy.token,
      // Lets permissions be skipped as root; the container is the sandbox.
      IS_SANDBOX: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      DISABLE_AUTOUPDATER: '1',
      // Every model Claude Code might pick for a side task is the run's model,
      // or Haiku, so the proxy's allow-list holds.
      ANTHROPIC_SMALL_FAST_MODEL: 'claude-haiku-5-5',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-5-5',
      ANTHROPIC_DEFAULT_SONNET_MODEL: options.model,
      ANTHROPIC_DEFAULT_OPUS_MODEL: options.model,
      CLAUDE_CODE_SUBAGENT_MODEL: options.model,
    };
    const child = Bun.spawn(
      [
        'docker',
        'exec',
        '-i',
        '--workdir',
        journey.cwd ?? rig.journey.home,
        ...Object.entries(environment).flatMap(([name, value]) => ['-e', `${name}=${value}`]),
        rig.journey.name,
        CONTAINER_BINARY,
        '-p',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--verbose',
        '--model',
        options.model,
        '--permission-mode',
        'bypassPermissions',
        '--tools',
        TOOLS,
        '--no-session-persistence',
        '--max-budget-usd',
        String(options.budgetUsd),
      ],
      { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' }
    );
    const send = (text: string) => {
      child.stdin.write(userMessage(text));
      void child.stdin.flush();
    };

    const commands: ExecutedCommand[] = [];
    const commandRequests: Array<ReadonlyArray<JournalEntry>> = [];
    const messages: string[] = [];
    const replies: Array<{ afterModelTurn: number; text: string }> = [];
    /** Bash calls that have started, by tool-use id, with the journal position at their start. */
    const running = new Map<string, { command: string; mark: number }>();
    let usage: Usage = ZERO_USAGE;
    let modelTurns = 0;
    let stop: StopReason | undefined;
    let finished = false;

    const cutOff = (reason: string) => {
      if (stop === undefined) stop = { provider: reason };
      child.kill();
    };
    const deadline = setTimeout(() => cutOff('deadline'), options.deadlineMs);
    let ending: ReturnType<typeof setTimeout> | undefined;
    /**
     * Closing stdin ends the session, but a command the agent left running in
     * the background keeps Claude Code alive. The run is over once the agent
     * stopped and the person had nothing to say, so it gets a moment, then goes.
     */
    const end = () => {
      child.stdin.end();
      ending ??= setTimeout(() => child.kill(), END_GRACE_MS);
    };

    const handle = (event: z.infer<typeof StreamEvent>) => {
      const content = event.message?.content;
      const blocks = Array.isArray(content) ? content : [];
      if (event.type === 'assistant') {
        const text = blocks
          .filter(block => block.type === 'text' && block.text !== undefined)
          .map(block => block.text)
          .join('\n');
        if (text !== '') {
          messages.push(text);
          // The person reads what the agent writes as it writes it.
          person.hear(text, false);
        }
        for (const block of blocks) {
          if (block.type !== 'tool_use' || block.name !== 'Bash' || block.id === undefined)
            continue;
          const input = BashInput.safeParse(block.input);
          if (!input.success) continue;
          running.set(block.id, { command: input.data.command, mark: rig.fake.journal.mark() });
          if (running.size + commands.length > options.maxCommands) cutOff('command-limit');
        }
      }
      if (event.type === 'user') {
        for (const block of blocks) {
          if (block.type !== 'tool_result' || block.tool_use_id === undefined) continue;
          const started = running.get(block.tool_use_id);
          if (!started) continue;
          running.delete(block.tool_use_id);
          const payload = resultText(block.content);
          const exitCode = block.is_error ? Number(/^Exit code (\d+)/.exec(payload)?.[1] ?? 1) : 0;
          const output = BashResult.safeParse(event.tool_use_result);
          commands.push({
            command: started.command,
            exitCode,
            stdout: output.success ? output.data.stdout : payload.replace(/^Exit code \d+\n?/, ''),
            stderr: output.success ? output.data.stderr : '',
            payload,
          });
          // Requests between the call and its result. Calls that overlap share requests.
          commandRequests.push(rig.fake.journal.since(started.mark));
        }
      }
      if (event.type === 'result') {
        modelTurns += event.num_turns ?? 0;
        usage = {
          ...addTokens(usage, '', {
            input: event.usage?.input_tokens ?? 0,
            output: event.usage?.output_tokens ?? 0,
            cacheRead: event.usage?.cache_read_input_tokens ?? 0,
            cacheWrite: event.usage?.cache_creation_input_tokens ?? 0,
          }),
          // Claude Code reports the session's running total.
          costUsd: event.total_cost_usd ?? usage.costUsd,
        };
        if (event.subtype !== 'success') {
          stop = { provider: event.subtype ?? 'error' };
          end();
          return;
        }
        const reply = person.hear(event.result ?? '', true);
        if (reply === undefined) {
          finished = true;
          end();
          return;
        }
        replies.push({ afterModelTurn: modelTurns, text: reply });
        send(reply);
      }
    };

    send(journey.prompt);
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of child.stdout) {
      buffer += decoder.decode(chunk, { stream: true });
      for (let newline = buffer.indexOf('\n'); newline >= 0; newline = buffer.indexOf('\n')) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line === '') continue;
        const raw: unknown = JSON.parse(line);
        options.onEvent?.(raw);
        const event = StreamEvent.safeParse(raw);
        if (event.success) handle(event.data);
      }
    }
    const stderr = await new Response(child.stderr).text();
    await child.exited;
    clearTimeout(deadline);
    clearTimeout(ending);
    if (stop === undefined && !finished) {
      stop = { provider: `exited ${child.exitCode}: ${stderr.trim().slice(-300)}` };
    }

    return {
      transcript: {
        commands,
        messages,
        replies,
        stop: stop ?? 'finished',
        modelTurns,
      },
      commandRequests,
      usage,
    };
  },
});
