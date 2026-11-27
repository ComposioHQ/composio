# Batch 2026-11-16T17-52-05-claude-code-claude-haiku-5-5-baseline

claude-code 2.1.310, claude-haiku-5-5, 3 run(s) per journey and arm.
Revision 39f30ca19; skill 25e724edfae2; harness edbcd56c3084.
Spent $0.069 on new runs; 0 run(s) reused.

| split   | journey                            | arm      | passed | pass@1 (95% CI) | pass@k | pass^k | wrong tree | mean cost | infra |
| ------- | ---------------------------------- | -------- | ------ | --------------- | ------ | ------ | ---------- | --------- | ----- |
| train   | consumer-slack-message             | no-skill | 3/3    | 100% (44%–100%) | 100%   | 100%   | 0%         | $0.003    | 0     |
| train   | consumer-slack-message             | skill    | 2/3    | 67% (21%–94%)   | 100%   | 0%     | 0%         | $0.003    | 0     |
| train   | developer-execute-unconnected      | no-skill | 0/3    | 0% (0%–56%)     | 0%     | 0%     | 0%         | $0.004    | 0     |
| train   | developer-execute-unconnected      | skill    | 3/3    | 100% (44%–100%) | 100%   | 100%   | 0%         | $0.003    | 0     |
| train   | first-run-login                    | no-skill | 3/3    | 100% (44%–100%) | 100%   | 100%   | 0%         | $0.001    | 0     |
| train   | first-run-login                    | skill    | 2/3    | 67% (21%–94%)   | 100%   | 0%     | 0%         | $0.001    | 0     |
| holdout | developer-auth-configs-and-execute | no-skill | 2/3    | 67% (21%–94%)   | 100%   | 0%     | 33%        | $0.003    | 0     |
| holdout | developer-auth-configs-and-execute | skill    | 3/3    | 100% (44%–100%) | 100%   | 100%   | 0%         | $0.002    | 0     |
| holdout | run-inline-script                  | no-skill | 3/3    | 100% (44%–100%) | 100%   | 100%   | 0%         | $0.001    | 0     |
| holdout | run-inline-script                  | skill    | 3/3    | 100% (44%–100%) | 100%   | 100%   | 0%         | $0.001    | 0     |

| split   | arm      | mean pass@1 | mean pass^k | mean wrong tree |
| ------- | -------- | ----------- | ----------- | --------------- |
| train   | skill    | 78%         | 33%         | 0%              |
| train   | no-skill | 67%         | 67%         | 0%              |
| holdout | skill    | 100%        | 100%        | 0%              |
| holdout | no-skill | 83%         | 50%         | 17%             |

## Failed checks

- consumer-slack-message (skill):
  - 1/3 SLACK_SEND_MESSAGE completed once in the whole run
  - 1/3 it ran on the consumer project, as consumer-user-e2e-acme-0001
  - 1/3 it went to #general
  - 1/3 its text was exactly "deploy finished"
  - 1/3 the account was linked on the consumer project
- developer-execute-unconnected (no-skill):
  - 3/3 SLACK_SEND_MESSAGE completed once in the whole run
  - 3/3 it ran on the developer project, as pg-test-00000000-0000-4000-8000-00000000a001
  - 3/3 it went to #general
  - 3/3 its text was exactly "hello from dev"
  - 3/3 the account was linked on the developer project for the test user
  - 2/3 the last `composio dev playground-execute` exited 0
- first-run-login (skill):
  - 1/3 the model finished by itself, within the turn limit
  - 1/3 exactly one CLI login session was created, and it was linked
  - 1/3 the login completed: the user API key was fetched for the linked session
  - 1/3 the login was stored: a new `composio whoami` exits 0 as the person, in their org
- developer-auth-configs-and-execute (no-skill):
  - 1/3 SLACK_SEND_MESSAGE completed once in the whole run
  - 1/3 it ran on the developer project, as pg-test-00000000-0000-4000-8000-00000000a001
  - 1/3 it went to #general
  - 1/3 its text was exactly "hello from dev"
  - 1/3 it ran through `composio dev playground-execute`
