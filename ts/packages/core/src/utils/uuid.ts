import { v4 as uuidv4 } from 'uuid';

export function getRandomUUID(): string {
  return uuidv4();
}
