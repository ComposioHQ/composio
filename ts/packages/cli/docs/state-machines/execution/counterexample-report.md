# CliExecution

TLC reached 80 states and 116 steps. The chart draws 16 states and 21 arrows.
The chart does not draw 32 steps that stay in one chart state.

## DryRunDoesNotExecute breaks

The shortest path has 4 steps: 0. Resolve project, user, and account

1. resolve execution context: Check arguments and connection hints
2. arguments accepted [normal execution]: Check tool permission
3. permission allows or skips approval: Prepare files and selected transport
4. send once to the selected transport: Tool request sent (tool sent during a dry run)

## Rules that hold

NoDeadlock
