import { Effect } from 'effect';

/**
 * The generation pipeline, evaluated on first use: `composio generate` needs it,
 * no other command does. The import is bundled into the executable; only its
 * evaluation waits.
 */
export const loadGeneration = Effect.promise(() => import('../generation/pipeline'));
