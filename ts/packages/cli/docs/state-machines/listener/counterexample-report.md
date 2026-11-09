# CliListener

TLC reached 413 states and 740 steps. The chart draws 10 states and 16 arrows.
The chart does not draw 239 steps that stay in one chart state.

## CleanupAttemptBeforeCompletion breaks

The shortest path has 4 steps: 0. Prepare event files

1. prepare subscription and temporary trigger: Create trigger if needed; subscribe
2. subscription fails: Release subscription and event workers
3. skip trigger cleanup: Report sink failures
4. report sink failures and finish: Stopped without attempting trigger cleanup

## Rules that hold

NoDeadlock
