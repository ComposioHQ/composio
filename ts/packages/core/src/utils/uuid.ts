import { v4 as uuidv4 } from 'uuid';

export function getRandomUUID(): string {
  return uuidv4();
}

export function getRandomShortId(): string {
  return getRandomUUID().slice(0, 8).replace(/-/g, '');
}
