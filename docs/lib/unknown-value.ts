export type UnknownRecord = Record<string, unknown>;

export function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toUnknownRecord(value: unknown): UnknownRecord {
  return isUnknownRecord(value) ? value : {};
}

export function toUnknownRecordArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isUnknownRecord) : [];
}

export function toString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function toNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

export function toBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
