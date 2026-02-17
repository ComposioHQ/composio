export function getRandomUUID(): string {
  return globalThis.crypto.randomUUID();
}

export function getRandomShortId(): string {
  return getRandomUUID().slice(0, 8).replace(/-/g, '');
}
