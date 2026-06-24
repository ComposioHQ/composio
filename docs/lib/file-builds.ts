/**
 * Registry that merges every example's FileBuildup stages into one map, so the
 * <FileBuildup> component isn't hardwired to a single example. Each example
 * contributes its own keys; they must not collide.
 *
 * - slack-bot-build: `bot`, `install`  (general-agent-with-pi)
 * - local-workbench-build: `reviewer`  (local-sandbox-pr-reviewer)
 * - standup-bot-build: `setup`, `proxy`, `buttons`, `draft`  (daily standup bot)
 */
import { FILE_BUILDS as slackBot } from './slack-bot-build';
import { FILE_BUILDS as localWorkbench } from './local-workbench-build';
import { FILE_BUILDS as standup } from './standup-bot-build';

export const FILE_BUILDS = { ...slackBot, ...localWorkbench, ...standup };
