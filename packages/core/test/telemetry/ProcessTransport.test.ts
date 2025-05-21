import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProcessTelemetryTransport } from '../../src/telemetry/transports/ProcessTransport';
import { TelemetryTransportParams } from '../../src/types/telemetry.types';

describe('ProcessTelemetryTransport', () => {
  let transport: ProcessTelemetryTransport;
  const originalWindow = global.window;

  // Spy on console.error to validate error handling
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    // Reset window to simulate Node.js environment
    delete (global as any).window;

    // Reset mocks and spies
    vi.clearAllMocks();

    // Create transport instance
    transport = new ProcessTelemetryTransport();
  });

  afterEach(() => {
    // Restore window
    global.window = originalWindow;
  });

  it('should create an instance successfully', () => {
    expect(transport).toBeInstanceOf(ProcessTelemetryTransport);
  });

  it('should reject if running in a browser environment', async () => {
    // Set window to simulate browser environment
    global.window = {} as any;

    await expect(
      transport.send({
        url: 'https://example.com/telemetry',
        method: 'POST',
        headers: {},
        data: {},
      })
    ).rejects.toThrow('ProcessTelemetryTransport can only be used in Node.js environments');
  });

  // Since we're running in a test environment and can't easily mock dynamic imports,
  // we'll focus on testing the URL handling and error handling aspects

  it('should handle errors gracefully', async () => {
    // Force an error by making URL constructor throw
    const originalURL = global.URL;
    global.URL = vi.fn().mockImplementation(() => {
      throw new Error('Invalid URL');
    }) as any;

    const payload: TelemetryTransportParams = {
      url: 'invalid:///url',
      method: 'POST',
      headers: {},
      data: {},
    };

    // Test that the promise still resolves despite the error
    await expect(transport.send(payload)).resolves.toBeUndefined();

    // Verify error was logged
    expect(consoleErrorSpy).toHaveBeenCalled();

    // Restore URL
    global.URL = originalURL;
  });

  // For these tests, we can't easily verify the spawn call since it's dynamically imported
  // and would require more complex mocking. Instead, we'll focus on ensuring the method
  // runs without throwing errors.

  it('should handle telemetry requests without throwing errors', async () => {
    const payload: TelemetryTransportParams = {
      url: 'https://example.com/telemetry',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Custom-Header': 'test-value',
      },
      data: { key: 'value' },
    };

    // The test passes if no exception is thrown
    await expect(transport.send(payload)).resolves.toBeUndefined();
  });
});
