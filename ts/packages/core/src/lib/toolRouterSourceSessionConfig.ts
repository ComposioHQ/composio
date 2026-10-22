import type { SessionExperimental } from '../types/toolRouter.types';

/**
 * Reads the saved Session config most recently applied to a session from a
 * create, retrieve, attach or patch response. Copies only `id`.
 */
export const getSourceSessionConfig = (response: {
  experimental?: { source_session_config?: { id: string } };
}): SessionExperimental['sourceSessionConfig'] => {
  const source = response.experimental?.source_session_config;
  return source ? { id: source.id } : undefined;
};
