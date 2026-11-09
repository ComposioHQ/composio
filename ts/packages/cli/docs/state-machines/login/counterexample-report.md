# CliLogin

TLC reached 61 states and 80 steps. The chart draws 13 states and 15 arrows.
The chart does not draw 23 steps that stay in one chart state.

## BrowserSessionMustBeLinked breaks

The shortest path has 5 steps: 0. Choose login method

1. request a browser login: Keep browser handoff
2. save the pending login: Open the login URL
3. complete login now or run login --poll: Wait for browser approval
4. receive a poll response: Check login status
5. accept an unlinked browser session: Unlinked browser session incorrectly accepted

## Rules that hold

NoDeadlock
