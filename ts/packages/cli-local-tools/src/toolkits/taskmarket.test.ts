import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeLocalToolBySlug, getLocalToolInputDefinition } from '../registry';
import { taskmarketToolkit } from './taskmarket';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
  execSync: vi.fn(() => 'C:\\mock\\npm\\node_modules'),
}));

import { execFile } from 'node:child_process';

const mockExecFile = vi.mocked(execFile);

const sampleTask = {
  id: `0x${'ab'.repeat(32)}`,
  requester: '0xc0566E4F2760cD01D53727cB16D3a829C5787a63',
  description: 'Build a landing page',
  reward: '64000000',
  mode: 'bounty',
  status: 'open',
  submissionCount: 3,
  expiryTime: '2026-08-21T02:38:21.801Z',
  tags: ['web', 'base'],
};

const mockFetch = vi.fn();

function mockFetchResponse(body: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('@composio/cli-local-tools Taskmarket toolkit', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockExecFile.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('declares the toolkit as a CLI source with the five documented tools', () => {
    expect(taskmarketToolkit.source?.type).toBe('cli');
    expect(taskmarketToolkit.source?.package).toBe('@lucid-agents/taskmarket');
    expect(taskmarketToolkit.tools.map(tool => tool.slug)).toEqual(
      expect.arrayContaining([
        'LIST_OPEN_TASKS',
        'GET_TASK',
        'CREATE_TASK',
        'TRACK_TASK',
        'LIST_SUBMISSIONS',
      ])
    );
  });

  it('exposes a create-task schema with the authorization and spending gates', () => {
    const createSchema = getLocalToolInputDefinition('LOCAL_TASKMARKET_CREATE_TASK');
    expect(createSchema?.schema.properties).toHaveProperty('confirmation');
    expect(createSchema?.schema.properties).toHaveProperty('rewardUsdc');
    expect(createSchema?.schema.properties).toHaveProperty('durationHours');
    expect(createSchema?.schema.properties).toHaveProperty('maxSpendUsdc');
    expect((createSchema?.schema.properties?.network as { default?: string })?.default).toBe('base');
  });

  it('lists open tasks from the public API and maps rewards to USDC', async () => {
    mockFetchResponse({
      tasks: [
        sampleTask,
        { ...sampleTask, id: `0x${'01'.repeat(32)}`, reward: '5000000' },
        { ...sampleTask, id: `0x${'02'.repeat(32)}`, reward: '100000000' },
      ],
      hasMore: false,
    });

    const result = await executeLocalToolBySlug('LOCAL_TASKMARKET_LIST_OPEN_TASKS', {
      minRewardUsdc: 10,
    });

    expect(result?.network).toBe('base');
    const tasks = result?.tasks as Array<{ id: string; rewardUsdc: number }>;
    expect(tasks).toHaveLength(2);
    expect(tasks[0].rewardUsdc).toBe(64);
    expect(tasks[1].rewardUsdc).toBe(100);
  });

  it('refuses to create a task without explicit confirmation', async () => {
    const result = await executeLocalToolBySlug('LOCAL_TASKMARKET_CREATE_TASK', {
      description: 'Write a research brief',
      rewardUsdc: 5,
      durationHours: 24,
    });

    expect(result?.status).toBe('requires_confirmation');
    expect(result?.plan).toEqual(
      expect.objectContaining({
        description: 'Write a research brief',
        rewardUsdc: 5,
        network: 'base',
        maxSpendUsdc: 10,
      })
    );
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('creates a task through the first-party CLI once confirmed', async () => {
    mockExecFile.mockImplementation((_cmd, args, _opts, callback) => {
      const nodeArgs = args as string[];
      expect(nodeArgs).toContain('task');
      expect(nodeArgs).toContain('create');
      const callbackFn = callback as (err: null, stdout: string) => void;
      callbackFn(null, JSON.stringify({ ok: true, data: { taskId: `0x${'cd'.repeat(32)}` } }));
      return {} as never;
    });

    const result = await executeLocalToolBySlug('LOCAL_TASKMARKET_CREATE_TASK', {
      description: 'Write a research brief',
      rewardUsdc: 5,
      durationHours: 24,
      confirmation: true,
    });

    expect(result?.status).toBe('submitted');
    expect(result?.taskId).toBe(`0x${'cd'.repeat(32)}`);
    expect(result?.network).toBe('base');
  });

  it('refuses rewards above the spending limit', async () => {
    await expect(
      executeLocalToolBySlug('LOCAL_TASKMARKET_CREATE_TASK', {
        description: 'Write a research brief',
        rewardUsdc: 50,
        durationHours: 24,
        confirmation: true,
      })
    ).rejects.toThrow(/exceeds the spending limit of 10 USDC/);
  });

  it('throws a settlement-unknown error when the CLI reports an in-flight write', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const callbackFn = callback as (err: { code: string; stderr: string } | null, stdout: string) => void;
      callbackFn(
        {
          code: 'EINVAL',
          stderr: JSON.stringify({ ok: false, error: 'intent in flight', pending: true }),
        },
        ''
      );
      return {} as never;
    });

    await expect(
      executeLocalToolBySlug('LOCAL_TASKMARKET_CREATE_TASK', {
        description: 'Write a research brief',
        rewardUsdc: 5,
        durationHours: 24,
        confirmation: true,
      })
    ).rejects.toThrow(/unknown settlement/i);
  });

  it('lists submissions for human review without auto-accepting', async () => {
    mockFetchResponse({
      submissions: [
        {
          id: 'sub_1',
          workerAddress: '0x1111111111111111111111111111111111111111',
          fileUrl: 'https://files.example/deliverable.pdf',
          submittedAt: '2026-08-15T10:00:00.000Z',
        },
      ],
    });

    const result = await executeLocalToolBySlug('LOCAL_TASKMARKET_LIST_SUBMISSIONS', {
      taskId: `0x${'ab'.repeat(32)}`,
    });

    expect(result?.count).toBe(1);
    expect(result?.reviewNote).toMatch(/human/i);
    expect(result?.submissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workerAddress: '0x1111111111111111111111111111111111111111',
          deliverableUrl: 'https://files.example/deliverable.pdf',
        }),
      ])
    );
  });
});
