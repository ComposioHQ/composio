import type { ReconciliationPlan } from './reconcile';
import { RegistryTransientError } from './registry/npm';

export class RegistryConsistencyTimeoutError extends Error {
  constructor(
    readonly attempts: number,
    readonly last_plan?: ReconciliationPlan,
    options?: ErrorOptions
  ) {
    super(`Registry consistency was not reached after ${attempts} attempts`, options);
    this.name = 'RegistryConsistencyTimeoutError';
  }
}

export interface VerifyRegistryOptions {
  reconcile: () => Promise<ReconciliationPlan>;
  max_attempts?: number;
  initial_delay_ms?: number;
  maximum_delay_ms?: number;
  sleep?: (delayMs: number) => Promise<void>;
}

export async function verifyRegistryConsistency(
  options: VerifyRegistryOptions
): Promise<ReconciliationPlan> {
  const maximumAttempts = options.max_attempts ?? 6;
  const initialDelay = options.initial_delay_ms ?? 1_000;
  const maximumDelay = options.maximum_delay_ms ?? 15_000;
  const sleep =
    options.sleep ??
    ((delayMs: number) => new Promise<void>(resolve => setTimeout(resolve, delayMs)));
  if (!Number.isInteger(maximumAttempts) || maximumAttempts < 1) {
    throw new Error('max_attempts must be a positive integer');
  }
  if (initialDelay < 0 || maximumDelay < initialDelay) {
    throw new Error('polling delays must be non-negative and bounded');
  }

  let lastPlan: ReconciliationPlan | undefined;
  let lastError: RegistryTransientError | undefined;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      const plan = await options.reconcile();
      lastPlan = plan;
      lastError = undefined;
      if (
        plan.observations.some(observation => observation.state === 'conflict') ||
        plan.observations.every(observation => observation.state === 'exact')
      ) {
        return plan;
      }
    } catch (error) {
      if (!(error instanceof RegistryTransientError)) throw error;
      lastError = error;
    }
    if (attempt < maximumAttempts) {
      await sleep(Math.min(initialDelay * 2 ** (attempt - 1), maximumDelay));
    }
  }
  throw new RegistryConsistencyTimeoutError(maximumAttempts, lastPlan, {
    cause: lastError,
  });
}
