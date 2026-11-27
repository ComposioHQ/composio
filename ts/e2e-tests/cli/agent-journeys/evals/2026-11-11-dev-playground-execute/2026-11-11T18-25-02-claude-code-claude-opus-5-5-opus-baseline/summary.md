# Batch 2026-11-11T18-25-02-claude-code-claude-opus-5-5-opus-baseline

claude-code 2.1.310, claude-opus-5-5, 3 run(s) per journey and arm.
Revision e4e5d922e with uncommitted changes; skill 72d9d691700d; harness 9ff7364caa93.
Spent $0.604 on new runs; 0 run(s) reused.

| split   | journey                            | arm   | passed | pass@1 (95% CI) | pass@k | pass^k | wrong tree | mean cost | infra |
| ------- | ---------------------------------- | ----- | ------ | --------------- | ------ | ------ | ---------- | --------- | ----- |
| train   | developer-execute-unconnected      | skill | 0/3    | 0% (0%–56%)     | 0%     | 0%     | 0%         | $0.084    | 0     |
| holdout | developer-auth-configs-and-execute | skill | 3/3    | 100% (44%–100%) | 100%   | 100%   | 0%         | $0.117    | 0     |

| split   | arm   | mean pass@1 | mean pass^k | mean wrong tree |
| ------- | ----- | ----------- | ----------- | --------------- |
| train   | skill | 0%          | 0%          | 0%              |
| holdout | skill | 100%        | 100%        | 0%              |

## Failed checks

- developer-execute-unconnected (skill):
  - 3/3 SLACK_SEND_MESSAGE completed once in the whole run
  - 3/3 it ran on the developer project, as pg-test-00000000-0000-4000-8000-00000000a001
  - 3/3 it went to #general
  - 3/3 its text was exactly "hello from dev"
  - 3/3 the account was linked on the developer project for the test user
  - 1/3 the last `composio dev playground-execute` exited 0
