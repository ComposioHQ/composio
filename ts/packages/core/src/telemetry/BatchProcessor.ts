import {
  TelemetryMetricPayloadBody,
  TelemetryPayload,
} from '../services/telemetry/TelemetryService.types';

export class BatchProcessor {
  private batch: TelemetryMetricPayloadBody = [];
  private time: number;
  private batchSize: number;
  private processBatchCallback: (data: TelemetryMetricPayloadBody) => Promise<void>;
  private timer: NodeJS.Timeout | null = null;
  private pendingFlush: Promise<void> | null = null;

  constructor(
    time: number = 2000,
    batchSize: number = 100,
    processBatchCallback: (data: TelemetryMetricPayloadBody) => Promise<void>
  ) {
    this.batch = [];
    this.time = time;
    this.batchSize = batchSize;
    this.processBatchCallback = processBatchCallback;
  }

  pushItem(item: TelemetryPayload) {
    this.batch.push(item);
    if (this.batch.length >= this.batchSize) {
      this.processBatch();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.processBatch(), this.time);
    }
  }

  processBatch() {
    if (this.batch.length > 0) {
      const batchToProcess = this.batch;
      this.batch = [];
      const pending = this.processBatchCallback(batchToProcess)
        .catch(() => {
          // Silently ignore errors - they should be handled by the callback
        })
        .finally(() => {
          if (this.pendingFlush === pending) {
            this.pendingFlush = null;
          }
        });

      this.pendingFlush = pending;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Flush any pending batch and wait for it to complete.
   * Useful for ensuring telemetry is sent before process exit.
   */
  async flush(): Promise<void> {
    this.processBatch();
    if (this.pendingFlush) {
      await this.pendingFlush;
    }
  }
}
