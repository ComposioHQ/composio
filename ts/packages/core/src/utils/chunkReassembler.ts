export const DEFAULT_MAX_CHUNK_INDEX = 1_000;
export const DEFAULT_CHUNK_TTL_MS = 60_000;
export const DEFAULT_MAX_PENDING_CHUNKED_EVENTS = 100;

export type ChunkReassemblyResult =
  | { status: 'pending' }
  | { status: 'complete'; payload: string }
  | { status: 'invalid'; reason: string };

type PendingChunkedEvent = {
  chunks: Map<number, string>;
  finalIndex?: number;
  createdAt: number;
};

export type ChunkReassemblerOptions = {
  maxChunkIndex?: number;
  ttlMs?: number;
  maxPendingEvents?: number;
  now?: () => number;
};

/**
 * Reassembles bounded, out-of-order realtime event chunks.
 *
 * A payload is complete only after a chunk declares its final index and every
 * index from zero through that final index has arrived. Invalid or conflicting
 * frames never produce a partial payload.
 *
 * @internal
 */
export class ChunkReassembler {
  private readonly events = new Map<string, PendingChunkedEvent>();
  private readonly maxChunkIndex: number;
  private readonly ttlMs: number;
  private readonly maxPendingEvents: number;
  private readonly now: () => number;

  constructor(options: ChunkReassemblerOptions = {}) {
    this.maxChunkIndex = options.maxChunkIndex ?? DEFAULT_MAX_CHUNK_INDEX;
    this.ttlMs = options.ttlMs ?? DEFAULT_CHUNK_TTL_MS;
    this.maxPendingEvents = options.maxPendingEvents ?? DEFAULT_MAX_PENDING_CHUNKED_EVENTS;
    this.now = options.now ?? Date.now;

    if (
      !Number.isInteger(this.maxChunkIndex) ||
      this.maxChunkIndex < 0 ||
      !Number.isFinite(this.ttlMs) ||
      this.ttlMs <= 0 ||
      !Number.isInteger(this.maxPendingEvents) ||
      this.maxPendingEvents <= 0
    ) {
      throw new Error('Invalid chunk reassembler limits');
    }
  }

  get pendingCount(): number {
    return this.events.size;
  }

  clear(): void {
    this.events.clear();
  }

  add(data: unknown): ChunkReassemblyResult {
    const now = this.now();
    this.discardExpired(now);

    if (!data || typeof data !== 'object') {
      return { status: 'invalid', reason: 'chunk must be an object' };
    }

    const chunk = data as Record<string, unknown>;
    if (typeof chunk.id !== 'string' || chunk.id.length === 0) {
      return { status: 'invalid', reason: 'chunk id must be a non-empty string' };
    }
    if (
      typeof chunk.index !== 'number' ||
      !Number.isInteger(chunk.index) ||
      chunk.index < 0 ||
      chunk.index > this.maxChunkIndex
    ) {
      return {
        status: 'invalid',
        reason: `chunk index must be an integer between 0 and ${this.maxChunkIndex}`,
      };
    }
    if (typeof chunk.chunk !== 'string') {
      return { status: 'invalid', reason: 'chunk payload must be a string' };
    }
    if (typeof chunk.final !== 'boolean') {
      return { status: 'invalid', reason: 'chunk final flag must be a boolean' };
    }

    const chunkId = chunk.id;
    const chunkIndex = chunk.index;
    const chunkPayload = chunk.chunk;
    const isFinal = chunk.final;

    let pending = this.events.get(chunkId);
    if (!pending) {
      this.evictOldestIfFull();
      pending = { chunks: new Map(), createdAt: now };
      this.events.set(chunkId, pending);
    }

    if (pending.finalIndex !== undefined && chunkIndex > pending.finalIndex) {
      this.events.delete(chunkId);
      return { status: 'invalid', reason: 'chunk index exceeds the declared final index' };
    }

    if (isFinal) {
      if (pending.finalIndex !== undefined && pending.finalIndex !== chunkIndex) {
        this.events.delete(chunkId);
        return { status: 'invalid', reason: 'conflicting final chunk indices' };
      }
      if ([...pending.chunks.keys()].some(index => index > chunkIndex)) {
        this.events.delete(chunkId);
        return { status: 'invalid', reason: 'received chunks beyond the final index' };
      }
      pending.finalIndex = chunkIndex;
    }

    const existing = pending.chunks.get(chunkIndex);
    if (existing !== undefined && existing !== chunkPayload) {
      this.events.delete(chunkId);
      return { status: 'invalid', reason: 'conflicting duplicate chunk' };
    }
    pending.chunks.set(chunkIndex, chunkPayload);

    if (pending.finalIndex === undefined || pending.chunks.size !== pending.finalIndex + 1) {
      return { status: 'pending' };
    }

    const chunks: string[] = [];
    for (let index = 0; index <= pending.finalIndex; index += 1) {
      const value = pending.chunks.get(index);
      if (value === undefined) {
        return { status: 'pending' };
      }
      chunks.push(value);
    }

    this.events.delete(chunkId);
    return { status: 'complete', payload: chunks.join('') };
  }

  private discardExpired(now: number): void {
    for (const [id, event] of this.events) {
      if (now - event.createdAt >= this.ttlMs) {
        this.events.delete(id);
      }
    }
  }

  private evictOldestIfFull(): void {
    if (this.events.size < this.maxPendingEvents) {
      return;
    }
    const oldestId = this.events.keys().next().value;
    if (oldestId !== undefined) {
      this.events.delete(oldestId);
    }
  }
}
