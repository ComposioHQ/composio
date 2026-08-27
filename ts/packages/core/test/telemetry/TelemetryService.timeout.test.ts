import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelemetryService } from '../../src/services/telemetry/TelemetryService';
import type { TelemetryPayload } from '../../src/services/telemetry/TelemetryService.types';

const createPayload = (): TelemetryPayload => ({
  functionName: 'TestClass.testMethod',
  durationMs: 123,
  timestamp: Date.now() / 1000,
  props: { foo: 'bar' },
  source: {
    host: 'test-host',
    service: 'sdk',
    language: 'typescript',
    version: '1.0.0',
    platform: 'node',
  },
  metadata: { provider: 'test' },
});

const neverRespondingFetch = vi.fn<typeof fetch>(
  (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    })
);

describe('TelemetryService request timeout', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    neverRespondingFetch.mockClear();
  });

  it('passes an AbortSignal and clears the metric timer after success', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await TelemetryService.sendMetric([createPayload()]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://telemetry.composio.dev/v1/metrics/invocations',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) })
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('swallows a metric timeout from a stalled endpoint', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', neverRespondingFetch);

    const send = TelemetryService.sendMetric([createPayload()]);
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(send).resolves.toBeUndefined();
  });

  it('passes an AbortSignal and clears the error-log timer after success', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await TelemetryService.sendErrorLog(createPayload());

    expect(fetchMock).toHaveBeenCalledWith(
      'https://telemetry.composio.dev/v1/errors',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) })
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('swallows an error-log timeout from a stalled endpoint', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', neverRespondingFetch);

    const send = TelemetryService.sendErrorLog(createPayload());
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(send).resolves.toBeUndefined();
  });
});
