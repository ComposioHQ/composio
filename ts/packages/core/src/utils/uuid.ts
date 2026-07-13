import { nanoid } from 'uniku/nanoid';
import { uuidv4 } from 'uniku/uuid/v4';

export function getRandomUUID(): string {
  return uuidv4();
}

export function getRandomShortId(): string {
  return nanoid(8);
}
