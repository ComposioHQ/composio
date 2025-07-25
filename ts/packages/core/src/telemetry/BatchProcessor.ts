import {
  TelemetryMetricPayloadBody,
  TelemetryPayload,
} from '../services/telemetry/TelemetryService.types';

export class BatchProcessor {
  private batch: TelemetryMetricPayloadBody = [];
  private time: number;
  private batchSize: number;
  private processBatchCallback: (data: TelemetryMetricPayloadBody) => void;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    time: number = 2000,
    batchSize: number = 100,
    processBatchCallback: (data: TelemetryMetricPayloadBody) => void
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
      this.processBatchCallback(this.batch);
      this.batch = [];
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
