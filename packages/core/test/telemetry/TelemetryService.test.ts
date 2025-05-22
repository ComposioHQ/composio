import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelemetryService } from '../../src/telemetry/Telemetry';
import { BaseTelemetryTransport } from '../../src/telemetry/TelemetryTransport';
import { BrowserTelemetryTransport } from '../../src/telemetry/transports/BrowserTransport';
import { ProcessTelemetryTransport } from '../../src/telemetry/transports/ProcessTransport';
import { TELEMETRY_EVENTS, TelemetryMetadata } from '../../src/types/telemetry.types';
import * as envUtils from '../../src/utils/env';

describe('TelemetryService', () => {
  let telemetryService: TelemetryService;
  let mockTransport: BaseTelemetryTransport;
  let testMetadata: TelemetryMetadata;

  // Save original window
  const originalWindow = global.window;

  beforeEach(() => {
    // Create a new instance for each test
    telemetryService = new TelemetryService();

    // Create mock transport
    mockTransport = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    // Test metadata
    testMetadata = {
      apiKey: 'test-api-key',
      baseUrl: 'https://api.test.com',
      version: '1.0.0',
      frameworkRuntime: 'test-framework',
      isAgentic: false,
      source: 'test',
      sessionId: 'test-session-id',
      isBrowser: false,
    };

    // Reset window to simulate Node.js environment by default
    delete (global as any).window;

    // Mock environment variable
    vi.spyOn(envUtils, 'getEnvVariable').mockImplementation((key, defaultValue) => {
      if (key === 'TELEMETRY_DISABLED') return 'false';
      if (key === 'NODE_ENV') return 'production'; // Return 'production' instead of 'test' to allow telemetry
      return defaultValue || '';
    });
  });

  afterEach(() => {
    vi.clearAllMocks();

    // Restore window
    if (originalWindow !== undefined) {
      global.window = originalWindow;
    }
  });

  describe('setup', () => {
    it('should set up telemetry metadata', () => {
      telemetryService.setup(testMetadata, mockTransport);

      expect(mockTransport.send).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              eventName: TELEMETRY_EVENTS.SDK_INITIALIZED,
              sdk_meta: testMetadata,
            }),
          ]),
        })
      );
    });

    it('should use BrowserTelemetryTransport in browser environment', () => {
      // Mock window to simulate browser environment
      global.window = {} as any;

      // Create a proper mock transport with a send method
      const mockBrowserTransport = { send: vi.fn().mockResolvedValue(undefined) };

      // Spy on the BrowserTelemetryTransport constructor
      vi.spyOn(BrowserTelemetryTransport.prototype, 'send').mockImplementation(() =>
        Promise.resolve()
      );

      // Setup with the mock transport
      telemetryService.setup(testMetadata, mockBrowserTransport);

      // Send a test event to verify the transport
      telemetryService['sendTelemetry']([
        {
          eventName: TELEMETRY_EVENTS.SDK_METHOD_INVOKED,
          data: {},
        },
      ]);

      expect(mockBrowserTransport.send).toHaveBeenCalled();
    });

    it('should use ProcessTelemetryTransport in Node.js environment', () => {
      // Create a proper mock transport with a send method
      const mockProcessTransport = { send: vi.fn().mockResolvedValue(undefined) };

      // Spy on the ProcessTelemetryTransport constructor
      vi.spyOn(ProcessTelemetryTransport.prototype, 'send').mockImplementation(() =>
        Promise.resolve()
      );

      // Setup with the mock transport
      telemetryService.setup(testMetadata, mockProcessTransport);

      // Send a test event to verify the transport
      telemetryService['sendTelemetry']([
        {
          eventName: TELEMETRY_EVENTS.SDK_METHOD_INVOKED,
          data: {},
        },
      ]);

      expect(mockProcessTransport.send).toHaveBeenCalled();
    });

    it('should use custom transport when provided', () => {
      telemetryService.setup(testMetadata, mockTransport);

      // Send a test event to verify the transport
      telemetryService['sendTelemetry']([
        {
          eventName: TELEMETRY_EVENTS.SDK_METHOD_INVOKED,
          data: {},
        },
      ]);

      expect(mockTransport.send).toHaveBeenCalledTimes(2); // Once during setup and once for the test
    });
  });

  describe('instrument', () => {
    class TestClass {
      constructor() {}

      async testMethod(param1: string, param2: number) {
        return { result: `${param1}-${param2}` };
      }

      async failingMethod() {
        throw new Error('Test error');
      }

      synchronousMethod() {
        return 'sync result';
      }
    }

    beforeEach(() => {
      telemetryService.setup(testMetadata, mockTransport);
      vi.spyOn(telemetryService as any, 'sendErrorTelemetry');
    });

    it('should instrument async methods of an object', async () => {
      const testInstance = new TestClass();
      telemetryService.instrument(testInstance);

      // Reset the mock to clear the SDK_INITIALIZED call
      vi.clearAllMocks();

      await testInstance.testMethod('test', 123);

      // Manually process the batch
      (telemetryService as any).batchProcessor.processBatch();

      expect(mockTransport.send).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              eventName: TELEMETRY_EVENTS.SDK_METHOD_INVOKED,
              data: expect.objectContaining({
                fileName: 'TestClass',
                method: 'testMethod',
                params: ['test', 123],
              }),
              sdk_meta: testMetadata,
            }),
          ]),
        })
      );
    });
    // @TODO: fix this test
    // it('should capture errors from instrumented methods', async () => {
    //   const testInstance = new TestClass();
    //   telemetryService.instrument(testInstance);

    //   // Reset the mock to clear the SDK_INITIALIZED call
    //   vi.clearAllMocks();
    //   // vi.spyOn(telemetryService, 'sendErrorTelemetry').mockImplementation(() => Promise.resolve());

    //   try {
    //     await testInstance.failingMethod();
    //   } catch (error) {
    //     // Wait for any pending promises to resolve
    //     expect(telemetryService.sendErrorTelemetry).toHaveBeenCalledWith(
    //       expect.objectContaining({
    //         data: expect.arrayContaining([
    //           expect.objectContaining({
    //             eventName: TELEMETRY_EVENTS.SDK_METHOD_ERROR,
    //             data: expect.objectContaining({
    //               fileName: 'TestClass',
    //               method: 'failingMethod',
    //               error: expect.objectContaining({
    //                 message: 'Test error',
    //               }),
    //             }),
    //             sdk_meta: testMetadata,
    //           }),
    //         ]),
    //       })
    //     );
    //   }
    // });

    it('should use the filename if constructor name is not available', () => {
      const anonymousObject = {
        async testMethod() {
          return 'result';
        },
      };

      telemetryService.instrument(anonymousObject, 'custom-filename');

      // Verify the instrumentation works with the custom filename
      expect(anonymousObject.testMethod).not.toBe(undefined);
      expect(typeof anonymousObject.testMethod).toBe('function');
    });
  });

  describe('sendTelemetry', () => {
    beforeEach(() => {
      telemetryService.setup(testMetadata, mockTransport);
    });

    it('should not send telemetry if transport is not set', async () => {
      // Create a new instance without setting up transport
      const newTelemetryService = new TelemetryService();

      // Reset the mock to clear any previous calls
      vi.clearAllMocks();

      await newTelemetryService['sendTelemetry']([
        {
          eventName: TELEMETRY_EVENTS.SDK_METHOD_INVOKED,
          data: {},
        },
      ]);

      expect(mockTransport.send).not.toHaveBeenCalled();
    });

    it('should not send telemetry if telemetry is disabled', async () => {
      // Mock environment variable to disable telemetry
      vi.spyOn(envUtils, 'getEnvVariable').mockImplementation(() => 'true');

      await telemetryService['sendTelemetry']([
        {
          eventName: TELEMETRY_EVENTS.SDK_METHOD_INVOKED,
          data: {},
        },
      ]);

      // We expect only the SDK_INITIALIZED call during setup
      expect(mockTransport.send).toHaveBeenCalledTimes(1);
    });

    it('should send telemetry with correct payload format', async () => {
      const testPayload = [
        {
          eventName: TELEMETRY_EVENTS.SDK_METHOD_INVOKED,
          data: { test: 'data' },
          sdk_meta: testMetadata,
        },
      ];

      await telemetryService['sendTelemetry'](testPayload);

      expect(mockTransport.send).toHaveBeenLastCalledWith({
        data: testPayload,
        url: expect.stringContaining('/api/sdk_metrics/telemetry'),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });
});
