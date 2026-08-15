import { execFile, execSync } from 'node:child_process';
import path from 'node:path';
import { z } from 'zod/v3';
import type {
  LocalExecutionContext,
  LocalExecutionResult,
  LocalToolkitDeclaration,
} from '../types';

const execFileAsync = (
  file: string,
  args: ReadonlyArray<string>,
  options: { timeout: number; encoding: 'utf8'; windowsHide: boolean }
): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    execFile(file, [...args], options, (error, stdout, stderr) => {
      if (error) {
        reject(
          Object.assign(error, {
            ...(stdout ? { stdout } : {}),
            ...(stderr ? { stderr } : {}),
          })
        );
        return;
      }
      resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });

const TASKMARKET_API = 'https://api.taskmarket.dev/api';
const TASKMARKET_NETWORK = 'base';
const USDC_DECIMALS = 1_000_000;
const DEFAULT_MAX_SPEND_USDC = 10;
const CREATE_TASK_TIMEOUT_MS = 120_000;
const READ_TIMEOUT_MS = 30_000;

let cachedCliEntry: string | undefined;

/**
 * Resolve the first-party taskmarket CLI entry point. The CLI owns the wallet,
 * x402 payments, and EIP-191 signatures; integrations must wrap it via
 * subprocess instead of reimplementing the protocol or handling keys.
 */
function taskmarketCliEntry(): string {
  if (cachedCliEntry) return cachedCliEntry;
  const globalRoot = execSync('npm root -g', {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  cachedCliEntry = path.join(
    globalRoot,
    '@lucid-agents',
    'taskmarket',
    'dist',
    'index.js'
  );
  return cachedCliEntry;
}

async function runTaskmarketCli(
  args: ReadonlyArray<string>,
  timeoutMs: number
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  try {
    const { stdout, stderr = '' } = await execFileAsync(
      process.execPath,
      [taskmarketCliEntry(), ...args],
      { timeout: timeoutMs, encoding: 'utf8', windowsHide: true }
    );
    return { stdout, stderr };
  } catch (error) {
    const err = error as {
      code?: string;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    if (err.code === 'ENOENT') {
      throw new Error(
        'The taskmarket CLI is not installed. Install it with: npm install -g @lucid-agents/taskmarket'
      );
    }
    if (err.code === 'ETIMEDOUT') {
      throw new Error(
        `The taskmarket CLI timed out after ${Math.round(timeoutMs / 1000)} seconds. ` +
          'The settlement status is unknown. Do NOT retry the payment; verify on Taskmarket whether the task was created before taking any further action.'
      );
    }
    const stderrText = String(err.stderr ?? '').trim();
    if (stderrText) {
      let pending = false;
      try {
        const envelope = JSON.parse(stderrText) as unknown;
        if (isRecord(envelope) && envelope.pending === true) {
          pending = true;
        }
      } catch {
        // not a JSON envelope; report stderr as-is
      }
      if (pending) {
        throw new Error(
          'The taskmarket CLI reported an in-flight write with unknown settlement. Do NOT retry the payment; verify the task on Taskmarket before taking any further action.'
        );
      }
      throw new Error(`The taskmarket CLI failed: ${stderrText}`);
    }
    throw new Error(`The taskmarket CLI failed: ${err.message ?? 'unknown error'}`);
  }
}

async function fetchJson(
  url: string,
  timeoutMs = READ_TIMEOUT_MS
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Taskmarket API responded with HTTP ${response.status}`);
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toRecordArray = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value) && Array.isArray(value.tasks)) return value.tasks.filter(isRecord);
  if (isRecord(value) && Array.isArray(value.submissions)) return value.submissions.filter(isRecord);
  return [];
};

const optionalString = (value: unknown): string | undefined => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : undefined;
};

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(item => String(item)) : [];

const rewardUsdcOf = (task: Record<string, unknown>): number =>
  Number(task.reward ?? 0) / USDC_DECIMALS;

const compactTask = (task: Record<string, unknown>): Record<string, unknown> => ({
  id: optionalString(task.id) ?? '',
  description: optionalString(task.description) ?? '',
  rewardUsdc: rewardUsdcOf(task),
  mode: optionalString(task.mode) ?? 'bounty',
  status: optionalString(task.status) ?? 'open',
  submissionCount: Number(task.submissionCount ?? 0),
  expiryTime: optionalString(task.expiryTime),
  tags: stringList(task.tags),
  requester: optionalString(task.requester),
  requesterAgentId: optionalString(task.requesterAgentId),
  pendingActions: task.pendingActions ?? undefined,
});

const compactSubmission = (submission: Record<string, unknown>): Record<string, unknown> => ({
  id: optionalString(submission.id) ?? '',
  workerAddress: optionalString(submission.workerAddress),
  submittedAt: optionalString(submission.submittedAt),
  deliverableUrl: optionalString(submission.fileUrl),
  deliverableHash: optionalString(submission.deliverableHash),
});

const taskListSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe('Maximum number of open tasks to return.'),
  minRewardUsdc: z
    .number()
    .nonnegative()
    .optional()
    .describe('Only return tasks with a reward of at least this many USDC.'),
  maxRewardUsdc: z
    .number()
    .nonnegative()
    .optional()
    .describe('Only return tasks with a reward of at most this many USDC.'),
  mode: z
    .enum(['bounty', 'claim', 'pitch', 'benchmark', 'auction'])
    .optional()
    .describe('Only return tasks of this mode.'),
});

const taskIdSchema = z.object({
  taskId: z
    .string()
    .min(1)
    .describe('Taskmarket task ID (0x-prefixed 32-byte hex string).'),
});

const createTaskSchema = z.object({
  description: z
    .string()
    .min(1)
    .describe('Exact task description the requester wants done.'),
  rewardUsdc: z
    .number()
    .positive()
    .describe('Reward in USDC, paid from the wallet managed by the taskmarket CLI.'),
  durationHours: z
    .number()
    .positive()
    .describe('Task duration in hours before it expires.'),
  network: z
    .enum(['base'])
    .default('base')
    .describe('Payment network. Taskmarket pays USDC on Base.'),
  maxSpendUsdc: z
    .number()
    .positive()
    .optional()
    .describe(
      'Hard cap on the reward for this call. Cannot exceed the TASKMARKET_MAX_SPEND_USDC environment variable (default 10 USDC); the configured ceiling always wins.'
    ),
  confirmation: z
    .boolean()
    .default(false)
    .describe(
      'Must be true to create the task. Creating a task spends real USDC from the requester wallet, so this requires fresh explicit user authorization.'
    ),
});

const executionResult = (value: Record<string, unknown>): LocalExecutionResult => value;

export const taskmarketToolkit: LocalToolkitDeclaration = {
  slug: 'taskmarket',
  name: 'Taskmarket',
  description:
    'Browse, create, and manage tasks on Taskmarket, an onchain agent task marketplace on Base that pays USDC. Writes go through the first-party taskmarket CLI.',
  platforms: ['all'],
  source: {
    type: 'cli',
    package: '@lucid-agents/taskmarket',
    repository: 'https://taskmarket.dev',
    command: 'taskmarket',
  },
  setup: {
    install: 'npm install -g @lucid-agents/taskmarket && taskmarket init',
    notes: [
      'The taskmarket CLI owns the wallet, x402 payments, and signatures; this toolkit never handles private keys.',
      'Creating a task requires explicit confirmation and enforces the TASKMARKET_MAX_SPEND_USDC spending limit (default 10 USDC).',
      'Submissions are presented for human review; this toolkit never accepts or rejects work automatically.',
      'Never retry a create whose settlement status is unknown; verify the task first.',
    ],
  },
  tools: [
    {
      slug: 'LIST_OPEN_TASKS',
      name: 'List open Taskmarket tasks',
      description:
        'List open tasks on Taskmarket (Base network, USDC rewards). Optionally filter by minimum or maximum reward and by task mode.',
      inputParams: taskListSchema,
      platforms: ['all'],
      execution: {
        kind: 'native',
        execute: async (input: Record<string, unknown>): Promise<LocalExecutionResult> => {
          const parsed = taskListSchema.parse(input);
          // Push supported filters to the API (minReward in micro-USDC, mode)
          // and fetch a superset when any filter is active so the client-side
          // post-filter never starves the results.
          const filtering =
            parsed.mode !== undefined ||
            parsed.minRewardUsdc !== undefined ||
            parsed.maxRewardUsdc !== undefined;
          const params = new URLSearchParams({ status: 'open', sort: 'newest' });
          params.set('limit', String(filtering ? 100 : Math.min(parsed.limit, 100)));
          if (parsed.mode) params.set('mode', parsed.mode);
          if (parsed.minRewardUsdc !== undefined) {
            // Round to whole base units: fractional USDC (e.g. 0.3) multiplied
            // by 1e6 loses integer precision in float and would not match the
            // API's integer base-unit string format.
            params.set('minReward', String(Math.round(parsed.minRewardUsdc * USDC_DECIMALS)));
          }
          const payload = await fetchJson(`${TASKMARKET_API}/tasks?${params.toString()}`);
          const tasks = toRecordArray(payload)
            .map(compactTask)
            .filter(task => {
              if (parsed.mode && task.mode !== parsed.mode) return false;
              const reward = Number(task.rewardUsdc);
              if (parsed.minRewardUsdc !== undefined && reward < parsed.minRewardUsdc) return false;
              if (parsed.maxRewardUsdc !== undefined && reward > parsed.maxRewardUsdc) return false;
              return true;
            })
            .slice(0, parsed.limit);
          return executionResult({
            network: TASKMARKET_NETWORK,
            count: tasks.length,
            tasks,
          });
        },
      },
    },
    {
      slug: 'GET_TASK',
      name: 'Get Taskmarket task details',
      description: 'Fetch the full details of a single Taskmarket task on Base by its task ID.',
      inputParams: taskIdSchema,
      platforms: ['all'],
      execution: {
        kind: 'native',
        execute: async (input: Record<string, unknown>): Promise<LocalExecutionResult> => {
          const parsed = taskIdSchema.parse(input);
          const payload = await fetchJson(`${TASKMARKET_API}/tasks/${encodeURIComponent(parsed.taskId)}`);
          if (!isRecord(payload)) {
            throw new Error('Taskmarket returned an unexpected response for this task.');
          }
          return executionResult({
            network: TASKMARKET_NETWORK,
            task: compactTask(payload),
          });
        },
      },
    },
    {
      slug: 'CREATE_TASK',
      name: 'Create a Taskmarket task',
      description:
        'Create a funded task on Taskmarket (Base, USDC) as a requester through the first-party taskmarket CLI. Requires explicit confirmation, shows the exact plan, and enforces a spending limit. Never retries a payment whose settlement status is unknown.',
      inputParams: createTaskSchema,
      platforms: ['all'],
      execution: {
        kind: 'native',
        execute: async (input: Record<string, unknown>): Promise<LocalExecutionResult> => {
          const parsed = createTaskSchema.parse(input);
          const envMax = Number(process.env.TASKMARKET_MAX_SPEND_USDC ?? '');
          const envCeiling =
            Number.isFinite(envMax) && envMax > 0 ? envMax : DEFAULT_MAX_SPEND_USDC;
          // The configured ceiling always wins: the tool-call cap can only
          // lower it, never raise it (hard spending gate).
          const maxSpendUsdc = Math.min(parsed.maxSpendUsdc ?? envCeiling, envCeiling);

          const plan: Record<string, unknown> = {
            description: parsed.description,
            rewardUsdc: parsed.rewardUsdc,
            durationHours: parsed.durationHours,
            network: TASKMARKET_NETWORK,
            maxSpendUsdc,
          };

          if (!parsed.confirmation) {
            return executionResult({
              status: 'requires_confirmation',
              plan,
              message:
                'Creating this task spends real USDC on the Base network from the wallet managed by the taskmarket CLI. Call this tool again with confirmation: true to proceed.',
            });
          }

          if (parsed.rewardUsdc > maxSpendUsdc) {
            throw new Error(
              `Reward of ${parsed.rewardUsdc} USDC exceeds the spending limit of ${maxSpendUsdc} USDC (TASKMARKET_MAX_SPEND_USDC). Refusing to create the task.`
            );
          }

          const args = [
            'task',
            'create',
            '--description',
            parsed.description,
            '--reward',
            String(parsed.rewardUsdc),
            '--duration',
            String(parsed.durationHours),
          ];
          const { stdout, stderr } = await runTaskmarketCli(args, CREATE_TASK_TIMEOUT_MS);
          let taskId: string | undefined;
          try {
            const envelope = JSON.parse(stdout) as unknown;
            if (isRecord(envelope) && envelope.ok === true && isRecord(envelope.data)) {
              taskId = optionalString(envelope.data.taskId ?? envelope.data.id);
            }
          } catch {
            // fall through to the pending/error path below
          }
          if (!taskId) {
            let pending = false;
            try {
              const errorEnvelope = JSON.parse(stderr) as unknown;
              if (isRecord(errorEnvelope) && errorEnvelope.pending === true) {
                pending = true;
              }
            } catch {
              // not a JSON envelope; report stderr as-is
            }
            if (pending) {
              throw new Error(
                'The taskmarket CLI reported an in-flight write with unknown settlement. Do NOT retry the payment; verify the task on Taskmarket before taking any further action.'
              );
            }
            throw new Error(
              `The taskmarket CLI did not return a created task ID. stderr: ${stderr.trim() || '(empty)'}`
            );
          }
          return executionResult({
            status: 'submitted',
            taskId,
            network: TASKMARKET_NETWORK,
            plan,
          });
        },
      },
    },
    {
      slug: 'TRACK_TASK',
      name: 'Track a Taskmarket task status',
      description:
        'Re-fetch a Taskmarket task by ID and return its live status, reward, expiry, and submission count. Use this to check a task you created.',
      inputParams: taskIdSchema,
      platforms: ['all'],
      execution: {
        kind: 'native',
        execute: async (input: Record<string, unknown>): Promise<LocalExecutionResult> => {
          const parsed = taskIdSchema.parse(input);
          const payload = await fetchJson(`${TASKMARKET_API}/tasks/${encodeURIComponent(parsed.taskId)}`);
          if (!isRecord(payload)) {
            throw new Error('Taskmarket returned an unexpected response for this task.');
          }
          const task = compactTask(payload);
          return executionResult({
            taskId: task.id,
            status: task.status,
            rewardUsdc: task.rewardUsdc,
            expiryTime: task.expiryTime,
            submissionCount: task.submissionCount,
            mode: task.mode,
          });
        },
      },
    },
    {
      slug: 'LIST_SUBMISSIONS',
      name: 'List Taskmarket task submissions',
      description:
        'List the submissions on a Taskmarket task and present them for human review. Never accepts or rejects work automatically; a human requester decides.',
      inputParams: taskIdSchema,
      platforms: ['all'],
      execution: {
        kind: 'native',
        execute: async (input: Record<string, unknown>): Promise<LocalExecutionResult> => {
          const parsed = taskIdSchema.parse(input);
          const payload = await fetchJson(
            `${TASKMARKET_API}/tasks/${encodeURIComponent(parsed.taskId)}/submissions`
          );
          const submissions = toRecordArray(payload).map(compactSubmission);
          return executionResult({
            taskId: parsed.taskId,
            count: submissions.length,
            submissions,
            reviewNote:
              'Present these submissions to a human requester for review. Do not accept or reject any submission automatically.',
          });
        },
      },
    },
  ],
};
