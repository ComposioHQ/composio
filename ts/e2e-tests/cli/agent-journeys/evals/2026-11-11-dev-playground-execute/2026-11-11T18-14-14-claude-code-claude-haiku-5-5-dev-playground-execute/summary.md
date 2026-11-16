# Batch 2026-11-11T18-14-14-claude-code-claude-haiku-5-5-dev-playground-execute

claude-code 2.1.310, claude-haiku-5-5, 5 run(s) per journey and arm.
Revision e4e5d922e with uncommitted changes; skill f6f4d7820d90; harness 9ff7364caa93.
Spent $0.039 on new runs; 0 run(s) reused.

| split | journey                       | arm   | passed | pass@1 (95% CI) | pass@k | pass^k | wrong tree | mean cost | infra |
| ----- | ----------------------------- | ----- | ------ | --------------- | ------ | ------ | ---------- | --------- | ----- |
| train | consumer-slack-message        | skill | 4/5    | 80% (38%–96%)   | 100%   | 0%     | 0%         | $0.003    | 0     |
| train | developer-execute-unconnected | skill | 0/5    | 0% (0%–43%)     | 0%     | 0%     | 0%         | $0.003    | 0     |
| train | first-run-login               | skill | 4/5    | 80% (38%–96%)   | 100%   | 0%     | 0%         | $0.001    | 0     |

| split | arm   | mean pass@1 | mean pass^k | mean wrong tree |
| ----- | ----- | ----------- | ----------- | --------------- |
| train | skill | 53%         | 0%          | 0%              |

## Failed checks

- consumer-slack-message (skill):
  - 1/5 SLACK_SEND_MESSAGE completed once in the whole run
  - 1/5 it ran on the consumer project, as consumer-user-e2e-acme-0001
  - 1/5 it went to #general
  - 1/5 its text was exactly "deploy finished"
  - 1/5 the account was linked on the consumer project
- developer-execute-unconnected (skill):
  - 5/5 SLACK_SEND_MESSAGE completed once in the whole run
  - 5/5 it ran on the developer project, as pg-test-00000000-0000-4000-8000-00000000a001
  - 5/5 it went to #general
  - 5/5 its text was exactly "hello from dev"
  - 5/5 the account was linked on the developer project for the test user
  - 5/5 the last `composio dev playground-execute` exited 0
- first-run-login (skill):
  - 1/5 the model finished by itself, within the turn limit
  - 1/5 exactly one CLI login session was created, and it was linked
  - 1/5 the login completed: the user API key was fetched for the linked session
  - 1/5 the login was stored: a new `composio whoami` exits 0 as the person, in their org
