import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod/v3';

const mockLogger = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../src/utils/logger', () => ({
  default: mockLogger,
}));

vi.mock('../../src/index', () => ({
  logger: mockLogger,
}));

import { transform } from '../../src/utils/transform';

describe('transform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return validated data when schema matches', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const result = transform({ raw_name: 'Alice', raw_age: 30 })
      .with(schema)
      .using(raw => ({ name: raw.raw_name, age: raw.raw_age }));

    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('should strip extra fields via Zod parsing on valid data', () => {
    const schema = z.object({
      name: z.string(),
    });

    const result = transform({ name: 'Alice', extra: 'field' })
      .with(schema)
      .using(raw => raw as any);

    expect(result).toEqual({ name: 'Alice' });
    expect(result).not.toHaveProperty('extra');
  });

  it('should return untransformed data and log a warning on validation failure', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const result = transform({ name: 123, age: 'not a number' })
      .with(schema)
      .using(raw => raw as any);

    expect(result).toEqual({ name: 123, age: 'not a number' });

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).not.toHaveBeenCalled();

    const warnMessage = mockLogger.warn.mock.calls[0][0] as string;
    expect(warnMessage).toContain('Transform validation failed');
    expect(warnMessage).toContain('name');
    expect(warnMessage).toContain('age');
  });

  it('should include label in the warning message when provided', () => {
    const schema = z.object({ id: z.string() });

    transform({ id: 42 })
      .with(schema)
      .using(raw => raw as any, { label: 'ConnectedAccount' });

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const warnMessage = mockLogger.warn.mock.calls[0][0] as string;
    expect(warnMessage).toContain('ConnectedAccount');
  });

  it('should not log anything when validation succeeds', () => {
    const schema = z.object({ id: z.string() });

    const result = transform({ id: 'abc' })
      .with(schema)
      .using(raw => raw as any);

    expect(result).toEqual({ id: 'abc' });
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should handle nested schema validation failures', () => {
    const schema = z.object({
      user: z.object({
        email: z.string().email(),
      }),
    });

    const result = transform({ user: { email: 'not-an-email' } })
      .with(schema)
      .using(raw => raw as any);

    expect(result).toEqual({ user: { email: 'not-an-email' } });
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);

    const warnMessage = mockLogger.warn.mock.calls[0][0] as string;
    expect(warnMessage).toContain('user.email');
  });
});
