import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BatchProcessor } from '../../src/telemetry/BatchProcessor';

describe('BatchProcessor', () => {
  // Mock timer functions
  vi.useFakeTimers();

  let batchProcessor: BatchProcessor;
  let processBatchCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    processBatchCallback = vi.fn().mockResolvedValue(undefined);
    batchProcessor = new BatchProcessor(1000, 3, processBatchCallback);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.clearAllMocks();
  });

  it('should create an instance with default parameters', () => {
    const defaultProcessor = new BatchProcessor(undefined, undefined, processBatchCallback);
    expect(defaultProcessor).toBeInstanceOf(BatchProcessor);
  });

  it('should batch items and not process until batch size is reached', () => {
    batchProcessor.pushItem('item1');
    batchProcessor.pushItem('item2');

    expect(processBatchCallback).not.toHaveBeenCalled();
  });

  it('should process batch when the batch size is reached', () => {
    batchProcessor.pushItem('item1');
    batchProcessor.pushItem('item2');
    batchProcessor.pushItem('item3');

    expect(processBatchCallback).toHaveBeenCalledWith(['item1', 'item2', 'item3']);
    expect(processBatchCallback).toHaveBeenCalledTimes(1);
  });

  it('should process batch after the specified time', () => {
    batchProcessor.pushItem('item1');
    batchProcessor.pushItem('item2');

    expect(processBatchCallback).not.toHaveBeenCalled();

    // Fast-forward time by 1 second
    vi.advanceTimersByTime(1000);

    expect(processBatchCallback).toHaveBeenCalledWith(['item1', 'item2']);
    expect(processBatchCallback).toHaveBeenCalledTimes(1);
  });

  it('should reset the timer after processing batch due to size limit', () => {
    batchProcessor.pushItem('item1');
    batchProcessor.pushItem('item2');
    batchProcessor.pushItem('item3');

    expect(processBatchCallback).toHaveBeenCalledTimes(1);
    processBatchCallback.mockClear();

    // Add a new item, which should start a new timer
    batchProcessor.pushItem('item4');

    // Fast-forward time by 1 second
    vi.advanceTimersByTime(1000);

    expect(processBatchCallback).toHaveBeenCalledWith(['item4']);
    expect(processBatchCallback).toHaveBeenCalledTimes(1);
  });

  it('should not process an empty batch', () => {
    // No items added
    batchProcessor.processBatch();

    expect(processBatchCallback).not.toHaveBeenCalled();
  });

  it('should clear timer after manual processBatch call', () => {
    // Spy on setTimeout
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    batchProcessor.pushItem('item1');

    // A timer should be set
    expect(setTimeoutSpy).toHaveBeenCalled();

    // Clear the spy call history
    setTimeoutSpy.mockClear();

    // Process the batch manually
    batchProcessor.processBatch();

    // Add a new item, which should start a new timer
    batchProcessor.pushItem('item2');

    // setTimeout should be called again
    expect(setTimeoutSpy).toHaveBeenCalled();
  });

  it('should handle batches efficiently', () => {
    // Create a batch processor with a moderate batch size
    const processor = new BatchProcessor(1000, 20, processBatchCallback);

    // Add 19 items
    for (let i = 0; i < 19; i++) {
      processor.pushItem(`item${i}`);
    }

    expect(processBatchCallback).not.toHaveBeenCalled();

    // Add the 20th item to trigger batch processing
    processor.pushItem('item-last');

    expect(processBatchCallback).toHaveBeenCalledTimes(1);
    expect(processBatchCallback.mock.calls[0][0].length).toBe(20);
  });
});
