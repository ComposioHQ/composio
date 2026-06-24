import type { AppConfig } from './config.js';
import { createE2bSandbox } from './sandbox/e2b.js';
import { createComposioClient, createLocalWorkbench, requireGithubConnection } from './workbench.js';
import { executeReviewerAgent, installReviewerRuntime, uploadReviewerAgent } from './reviewer/runner.js';
import type { ReviewEventSink } from './reviewer/events.js';

export interface ReviewTarget {
  repo: string;
  pr: number;
}

export interface RunReviewOptions {
  config: AppConfig;
  target: ReviewTarget;
  onEvent?: ReviewEventSink;
}

export function buildReviewTask(target: ReviewTarget): string {
  return `Review PR #${target.pr} on ${target.repo}. Run the repository's real checks in this sandbox and post one grounded GitHub PR comment only if checks actually run.`;
}

export async function runReview(options: RunReviewOptions): Promise<string> {
  const onEvent = options.onEvent ?? (() => {});
  const composio = createComposioClient(options.config);

  onEvent({ type: 'info', detail: 'checking GitHub connection' });
  await requireGithubConnection(composio, options.config.userId);

  onEvent({ type: 'info', detail: 'creating local workbench session' });
  const workbench = await createLocalWorkbench(composio, options.config.userId);

  onEvent({ type: 'sandbox', detail: 'booting E2B sandbox' });
  const sandbox = await createE2bSandbox({
    apiKey: options.config.e2bApiKey ?? '',
    timeoutMs: options.config.e2bTimeoutMs,
    remoteDir: options.config.sandboxRemoteDir,
    helperSource: workbench.helperSource,
    env: workbench.env,
  });

  try {
    await uploadReviewerAgent(sandbox);
    await installReviewerRuntime(sandbox, onEvent);
    return executeReviewerAgent(
      sandbox,
      buildReviewTask(options.target),
      {
        OPENAI_API_KEY: options.config.openaiApiKey ?? '',
        COMPOSIO_USER_ID: options.config.userId,
      },
      onEvent
    );
  } finally {
    onEvent({ type: 'sandbox', detail: 'tearing down sandbox' });
    await sandbox.teardown();
  }
}
