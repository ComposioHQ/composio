import { expect, test } from 'bun:test';
import { safetyIdentifier } from './agent';

test('derives a stable, non-identifying OpenAI safety identifier', () => {
  expect(safetyIdentifier('example-user')).toBe(
    '2938354af5a9f3e52aac0e865ea7017ae6a330702a4cccdbea0df2b7bd6dccc8'
  );
  expect(safetyIdentifier('another-user')).not.toBe(safetyIdentifier('example-user'));
});
