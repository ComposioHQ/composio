# CliInvocation

TLC reached 46 states and 48 steps. The chart draws 14 states and 13 arrows.
The chart does not draw 6 steps that stay in one chart state.

## HooksRequireParsedAction breaks

The shortest path has 2 steps: 0. Parse argv and identify registration

1. effect/cli selects a registration: Start the selected command
2. run enabled hooks for parsed input: Record command invoked (hooks ran without a parsed action)

## Rules that hold

NoDeadlock
