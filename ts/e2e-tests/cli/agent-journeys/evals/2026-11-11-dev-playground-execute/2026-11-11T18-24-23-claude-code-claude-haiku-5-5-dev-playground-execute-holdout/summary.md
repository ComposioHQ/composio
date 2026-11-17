# Batch 2026-11-11T18-24-23-claude-code-claude-haiku-5-5-dev-playground-execute-holdout

claude-code 2.1.310, claude-haiku-5-5, 5 run(s) per journey and arm.
Revision e4e5d922e with uncommitted changes; skill f6f4d7820d90; harness 9ff7364caa93.
Spent $0.020 on new runs; 0 run(s) reused.

| split   | journey                            | arm   | passed | pass@1 (95% CI) | pass@k | pass^k | wrong tree | mean cost | infra |
| ------- | ---------------------------------- | ----- | ------ | --------------- | ------ | ------ | ---------- | --------- | ----- |
| holdout | developer-auth-configs-and-execute | skill | 5/5    | 100% (57%–100%) | 100%   | 100%   | 0%         | $0.002    | 0     |
| holdout | run-inline-script                  | skill | 5/5    | 100% (57%–100%) | 100%   | 100%   | 0%         | $0.002    | 0     |

| split   | arm   | mean pass@1 | mean pass^k | mean wrong tree |
| ------- | ----- | ----------- | ----------- | --------------- |
| holdout | skill | 100%        | 100%        | 0%              |
