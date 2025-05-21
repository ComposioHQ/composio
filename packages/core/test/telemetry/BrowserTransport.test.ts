import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserTelemetryTransport } from '../../src/telemetry/transports/BrowserTransport';
import { TelemetryTransportParams } from '../../src/types/telemetry.types';

describe('BrowserTelemetryTransport', () => {
  let transport: BrowserTelemetryTransport;

  // Define the mock XHR class
  const mockXHR = {
    open: vi.fn(),
    send: vi.fn(),
    setRequestHeader: vi.fn(),
    onload: null as Function | null,
  };

  // Save original globals
  const originalWindow = global.window;
  const originalXMLHttpRequest = global.XMLHttpRequest;

  beforeEach(() => {
    // Setup mock window and XMLHttpRequest
    global.window = global.window || ({} as any);
    global.XMLHttpRequest = vi.fn(() => mockXHR) as any;

    // Reset mock functions and state
    mockXHR.open.mockReset();
    mockXHR.send.mockReset();
    mockXHR.setRequestHeader.mockReset();
    mockXHR.onload = null;

    // Create new transport instance
    transport = new BrowserTelemetryTransport();
  });

  afterEach(() => {
    // Restore globals
    global.window = originalWindow;
    global.XMLHttpRequest = originalXMLHttpRequest;
  });

  it('should create an instance successfully', () => {
    expect(transport).toBeInstanceOf(BrowserTelemetryTransport);
  });

  it('should send telemetry data via XMLHttpRequest', async () => {
    const payload: TelemetryTransportParams = {
      url: 'https://example.com/telemetry',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Custom-Header': 'test-value',
      },
      data: { key: 'value' },
    };

    // Start sending the data
    const promise = transport.send(payload);

    // Verify XHR was configured correctly
    expect(mockXHR.open).toHaveBeenCalledWith('POST', 'https://example.com/telemetry', true);
    expect(mockXHR.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(mockXHR.setRequestHeader).toHaveBeenCalledWith('X-Custom-Header', 'test-value');
    expect(mockXHR.send).toHaveBeenCalledWith(JSON.stringify({ key: 'value' }));

    // Trigger the onload callback if it was set
    if (mockXHR.onload) {
      (mockXHR.onload as Function)();
    }

    // Verify promise resolves
    await expect(promise).resolves.toBeUndefined();
  });

  it('should reject if not running in a browser environment', async () => {
    // Temporarily remove window to simulate non-browser environment
    const tempWindow = global.window;
    global.window = undefined as any;

    // Expect rejection when sending in non-browser env
    await expect(
      transport.send({
        url: 'https://example.com/telemetry',
        method: 'POST',
        headers: {},
        data: {},
      })
    ).rejects.toThrow('BrowserTelemetryTransport can only be used in browser environments');

    // Restore window for other tests
    global.window = tempWindow;
  });

  it('should handle errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const payload: TelemetryTransportParams = {
      url: 'https://example.com/telemetry',
      method: 'POST',
      headers: {},
      data: {},
    };

    // Make the send method throw an error
    mockXHR.send.mockImplementation(() => {
      throw new Error('Network error');
    });

    // Should resolve despite the error
    const promise = transport.send(payload);
    await expect(promise).resolves.toBeUndefined();

    // Should log the error
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
