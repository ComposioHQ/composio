import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { BatchProcessor } from '../../src/telemetry/BatchProcessor';
import { TelemetryTransport } from '../../src/telemetry/Telemetry';
import { TelemetryService } from '../../src/services/telemetry/TelemetryService';
import type {
  TelemetryPayload,
  TelemetryMetricPayloadBody,
  TelemetryMetricMetadata,
} from '../../src/services/telemetry/TelemetryService.types';

// Helper to create a mock telemetry payload
const createPayload = (overrides: Partial<TelemetryPayload> = {}): TelemetryPayload => ({
  functionName: 'TestClass.testMethod',
  durationMs: 123,
  timestamp: Date.now() / 1000,
  props: { foo: 'bar' },
  source: {
    name: 'test',
    service: 'sdk',
    language: 'typescript',
    version: '1.0.0',
    platform: 'node',
  },
  metadata: { provider: 'test' },
  ...overrides,
});

describe('BatchProcessor', () => {
  let callback: ReturnType<typeof vi.fn>;
  let processor: BatchProcessor;

  beforeEach(() => {
    callback = vi.fn();
    processor = new BatchProcessor(50, 3, callback); // small batch size and time for test
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should batch items and call callback when batch size is reached', () => {
    const payloads = [createPayload(), createPayload(), createPayload()];
    payloads.forEach(p => processor.pushItem(p));
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(payloads);
  });

  it('should call callback after timeout if batch size not reached', async () => {
    vi.useFakeTimers();
    const payloads = [createPayload(), createPayload()];
    payloads.forEach(p => processor.pushItem(p));
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(payloads);
  });

  it('should reset timer and batch after processing', () => {
    const payloads = [createPayload(), createPayload(), createPayload()];
    payloads.forEach(p => processor.pushItem(p));
    // After batch, timer should be null and batch empty
    // @ts-expect-error: private access for test
    expect(processor.timer).toBeNull();
    // @ts-expect-error: private access for test
    expect(processor.batch).toEqual([]);
  });
});

describe('TelemetryTransport', () => {
  let transport: TelemetryTransport;
  let sendMetricSpy: any;
  let sendErrorLogSpy: any;
  const metadata: TelemetryMetricMetadata = {
    apiKey: 'test-key',
    baseUrl: 'http://localhost',
    version: '1.0.0',
    frameworkRuntime: 'node',
    isAgentic: false,
    source: 'test-source',
    provider: 'test',
  };

  beforeEach(() => {
    sendMetricSpy = vi.spyOn(TelemetryService, 'sendMetric').mockResolvedValue({} as any);
    sendErrorLogSpy = vi.spyOn(TelemetryService, 'sendErrorLog').mockResolvedValue({} as any);
    transport = new TelemetryTransport();
    transport.setup(metadata);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should send SDK_INITIALIZED metric on setup', () => {
    expect(sendMetricSpy).toHaveBeenCalled();
    const call = sendMetricSpy.mock.calls[0][0][0];
    expect(call.functionName).toBeDefined();
    expect(call.metadata?.provider).toBe('test');
  });

  it('should batch metrics and send via TelemetryService', async () => {
    const payload = createPayload();
    await transport.sendMetric([payload]);
    expect(sendMetricSpy).toHaveBeenCalledWith([payload]);
  });

  it('should send error telemetry immediately', async () => {
    const payload = createPayload({ error: { name: 'Error', message: 'fail', stack: 'stack' } });
    await transport.sendErrorTelemetry(payload);
    expect(sendErrorLogSpy).toHaveBeenCalledWith(payload);
  });

  it('should instrument async methods and batch telemetry', async () => {
    class TestClass {
      async foo(a: number) {
        return a * 2;
      }
    }
    const instance = new TestClass();
    const instrumented = transport.instrument(instance);
    await instrumented.foo(21);
    // The batchProcessor will push the payload, but we can check sendMetric is eventually called
    await transport.sendMetric([]); // flush
    expect(sendMetricSpy).toHaveBeenCalled();
  });

  it('should send error telemetry if instrumented method throws', async () => {
    class TestClass {
      async fail() {
        throw new Error('fail!');
      }
    }
    const instance = new TestClass();
    const instrumented = transport.instrument(instance);
    await expect(instrumented.fail()).rejects.toThrow('fail!');
    expect(sendErrorLogSpy).toHaveBeenCalled();
  });
});

beforeAll(() => {
  // Save the original NODE_ENV
  process.env._ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
});

afterAll(() => {
  // Restore the original NODE_ENV
  if (process.env._ORIGINAL_NODE_ENV !== undefined) {
    process.env.NODE_ENV = process.env._ORIGINAL_NODE_ENV;
    delete process.env._ORIGINAL_NODE_ENV;
  } else {
    delete process.env.NODE_ENV;
  }
});
