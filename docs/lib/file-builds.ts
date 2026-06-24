/**
 * Registry that merges every example's FileBuildup stages into one map, so the
 * <FileBuildup> component isn't hardwired to a single example. Each example
 * contributes its own keys; they must not collide.
 *
 * - slack-bot-build: `bot`, `install`  (general-agent-with-pi)
 * - local-workbench-build: `reviewer`  (local-workbench-pr-reviewer)
 */
import { FILE_BUILDS as slackBot } from './slack-bot-build';
import { FILE_BUILDS as localWorkbench } from './local-workbench-build';

export const FILE_BUILDS = { ...slackBot, ...localWorkbench };
