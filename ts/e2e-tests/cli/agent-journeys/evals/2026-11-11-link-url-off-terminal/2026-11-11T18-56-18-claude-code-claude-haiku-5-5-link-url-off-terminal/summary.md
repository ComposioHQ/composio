# Batch 2026-11-11T18-56-18-claude-code-claude-haiku-5-5-link-url-off-terminal

claude-code 2.1.310, claude-haiku-5-5, 5 run(s) per journey and arm.
Revision 0f1477f51; skill 0cc1b6f91c3b; harness 9ff7364caa93.
Spent $0.033 on new runs; 0 run(s) reused.

| split | journey                       | arm   | passed | pass@1 (95% CI) | pass@k | pass^k | wrong tree | mean cost | infra |
| ----- | ----------------------------- | ----- | ------ | --------------- | ------ | ------ | ---------- | --------- | ----- |
| train | consumer-slack-message        | skill | 5/5    | 100% (57%–100%) | 100%   | 100%   | 0%         | $0.003    | 0     |
| train | developer-execute-unconnected | skill | 5/5    | 100% (57%–100%) | 100%   | 100%   | 0%         | $0.003    | 0     |
| train | first-run-login               | skill | 3/5    | 60% (23%–88%)   | 100%   | 0%     | 0%         | $0.001    | 0     |

| split | arm   | mean pass@1 | mean pass^k | mean wrong tree |
| ----- | ----- | ----------- | ----------- | --------------- |
| train | skill | 87%         | 67%         | 0%              |

## Failed checks

- first-run-login (skill):
  - 2/5 the model finished by itself, within the turn limit
  - 2/5 exactly one CLI login session was created, and it was linked
  - 2/5 the login completed: the user API key was fetched for the linked session
  - 2/5 the login was stored: a new `composio whoami` exits 0 as the person, in their org
