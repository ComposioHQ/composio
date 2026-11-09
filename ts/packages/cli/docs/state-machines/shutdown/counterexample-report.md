# CliShutdown

TLC reached 184 states and 303 steps. The chart draws 9 states and 13 arrows.
The chart does not draw 164 steps that stay in one chart state.

## CooperativeSignalIsNotInterruption breaks

The shortest path has 2 steps: 0. Starting; signal would interrupt

1. subscription is acknowledged or child supervision starts: Ready to stop cooperatively
2. receive Ctrl+C, SIGTERM, or SIGHUP: Signal interrupts the invocation (accepted stop incorrectly interrupted)

## Rules that hold

NoDeadlock
