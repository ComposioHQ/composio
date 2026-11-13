# Batch 2026-11-11T18-26-04-claude-code-claude-opus-5-5-opus-dev-playground-execute

claude-code 2.1.310, claude-opus-5-5, 3 run(s) per journey and arm.
Revision e4e5d922e with uncommitted changes; skill f6f4d7820d90; harness 9ff7364caa93.
Spent $0.382 on new runs; 0 run(s) reused.

| split   | journey                            | arm   | passed | pass@1 (95% CI) | pass@k | pass^k | wrong tree | mean cost | infra |
| ------- | ---------------------------------- | ----- | ------ | --------------- | ------ | ------ | ---------- | --------- | ----- |
| train   | developer-execute-unconnected      | skill | 3/3    | 100% (44%–100%) | 100%   | 100%   | 0%         | $0.079    | 0     |
| holdout | developer-auth-configs-and-execute | skill | 3/3    | 100% (44%–100%) | 100%   | 100%   | 0%         | $0.049    | 0     |

| split   | arm   | mean pass@1 | mean pass^k | mean wrong tree |
| ------- | ----- | ----------- | ----------- | --------------- |
| train   | skill | 100%        | 100%        | 0%              |
| holdout | skill | 100%        | 100%        | 0%              |
