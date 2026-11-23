import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  languages,
  prepareStableReference,
  promoteSnapshot,
  reviseSnapshot,
  snapshotDirectory,
} from '../lib/sdk-reference-snapshot';

const root = fileURLToPath(new URL('..', import.meta.url));
const argumentsSchema = z.union([
  z.tuple([z.literal('prepare'), z.string()]),
  z.tuple([z.literal('revise'), z.enum(languages)]),
  z.tuple([z.literal('promote'), z.enum(languages), z.string(), z.string(), z.string()]),
]);
const args = argumentsSchema.parse(process.argv.slice(2));
switch (args[0]) {
  case 'prepare':
    prepareStableReference(root, args[1]);
    break;
  case 'revise':
    reviseSnapshot(snapshotDirectory(root, args[1]));
    break;
  case 'promote':
    promoteSnapshot(snapshotDirectory(root, args[1]), args[2], args[3], args[4]);
    break;
}
