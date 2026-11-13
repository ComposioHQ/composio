# Batch 2026-11-11T17-53-36-claude-code-claude-haiku-5-5-baseline

claude-code 2.1.310, claude-haiku-5-5, 5 run(s) per journey and arm.
Revision e4e5d922e; skill 72d9d691700d; harness 9ff7364caa93.
Spent $0.118 on new runs; 0 run(s) reused.

| split   | journey                            | arm      | passed | pass@1 (95% CI) | pass@k | pass^k | wrong tree | mean cost | infra |
| ------- | ---------------------------------- | -------- | ------ | --------------- | ------ | ------ | ---------- | --------- | ----- |
| train   | consumer-slack-message             | no-skill | 0/5    | 0% (0%–43%)     | 0%     | 0%     | 0%         | $0.002    | 0     |
| train   | consumer-slack-message             | skill    | 2/5    | 40% (12%–77%)   | 100%   | 0%     | 0%         | $0.003    | 0     |
| train   | developer-execute-unconnected      | no-skill | 1/5    | 20% (4%–62%)    | 100%   | 0%     | 20%        | $0.004    | 0     |
| train   | developer-execute-unconnected      | skill    | 0/5    | 0% (0%–43%)     | 0%     | 0%     | 100%       | $0.003    | 0     |
| train   | first-run-login                    | no-skill | 3/5    | 60% (23%–88%)   | 100%   | 0%     | 0%         | $0.001    | 0     |
| train   | first-run-login                    | skill    | 2/5    | 40% (12%–77%)   | 100%   | 0%     | 0%         | $0.001    | 0     |
| holdout | developer-auth-configs-and-execute | no-skill | 5/5    | 100% (57%–100%) | 100%   | 100%   | 40%        | $0.004    | 0     |
| holdout | developer-auth-configs-and-execute | skill    | 3/5    | 60% (23%–88%)   | 100%   | 0%     | 100%       | $0.004    | 0     |
| holdout | run-inline-script                  | no-skill | 5/5    | 100% (57%–100%) | 100%   | 100%   | 0%         | $0.002    | 0     |
| holdout | run-inline-script                  | skill    | 5/5    | 100% (57%–100%) | 100%   | 100%   | 0%         | $0.002    | 0     |

| split   | arm      | mean pass@1 | mean pass^k | mean wrong tree |
| ------- | -------- | ----------- | ----------- | --------------- |
| train   | skill    | 27%         | 0%          | 33%             |
| train   | no-skill | 27%         | 0%          | 7%              |
| holdout | skill    | 80%         | 50%         | 50%             |
| holdout | no-skill | 100%        | 100%        | 20%             |

## Failed checks

- consumer-slack-message (no-skill):
  - 4/5 the last `composio execute` exited 0
  - 5/5 SLACK_SEND_MESSAGE completed once in the whole run
  - 5/5 it ran on the consumer project, as consumer-user-e2e-acme-0001
  - 5/5 it went to #general
  - 5/5 its text was exactly "deploy finished"
  - 5/5 the account was linked on the consumer project
- consumer-slack-message (skill):
  - 3/5 the last `composio execute` exited 0
  - 3/5 SLACK_SEND_MESSAGE completed once in the whole run
  - 3/5 it ran on the consumer project, as consumer-user-e2e-acme-0001
  - 3/5 it went to #general
  - 3/5 its text was exactly "deploy finished"
  - 3/5 the account was linked on the consumer project
- developer-execute-unconnected (no-skill):
  - 4/5 SLACK_SEND_MESSAGE completed once in the whole run
  - 4/5 it ran on the developer project, as pg-test-00000000-0000-4000-8000-00000000a001
  - 4/5 it went to #general
  - 4/5 its text was exactly "hello from dev"
  - 4/5 the account was linked on the developer project for the test user
  - 4/5 the last `composio dev playground-execute` exited 0
- developer-execute-unconnected (skill):
  - 5/5 SLACK_SEND_MESSAGE completed once in the whole run
  - 5/5 it ran on the developer project, as pg-test-00000000-0000-4000-8000-00000000a001
  - 5/5 it went to #general
  - 5/5 its text was exactly "hello from dev"
  - 5/5 the account was linked on the developer project for the test user
  - 5/5 the last `composio dev playground-execute` exited 0
- first-run-login (no-skill):
  - 2/5 the model finished by itself, within the turn limit
  - 2/5 exactly one CLI login session was created, and it was linked
  - 2/5 the login completed: the user API key was fetched for the linked session
  - 2/5 the login was stored: a new `composio whoami` exits 0 as the person, in their org
- first-run-login (skill):
  - 3/5 the model finished by itself, within the turn limit
  - 3/5 exactly one CLI login session was created, and it was linked
  - 3/5 the login completed: the user API key was fetched for the linked session
  - 3/5 the login was stored: a new `composio whoami` exits 0 as the person, in their org
- developer-auth-configs-and-execute (skill):
  - 2/5 SLACK_SEND_MESSAGE completed once in the whole run
  - 2/5 it ran on the developer project, as pg-test-00000000-0000-4000-8000-00000000a001
  - 2/5 it went to #general
  - 2/5 its text was exactly "hello from dev"
  - 2/5 it ran through `composio dev playground-execute`
