# CliLink

TLC reached 50 states and 60 steps. The chart draws 10 states and 10 arrows.
The chart does not draw 16 steps that stay in one chart state.

## ActiveOutputRequiresActiveAccount breaks

The shortest path has 6 steps: 0. Resolve project and acting user

1. resolve project and user; load alias hints: Check alias against visible accounts
2. request a Tool Router or legacy link: Link request returned
3. the returned new or reused account is allowed: Show the authorization URL
4. show the URL and open it when allowed: Wait for account authorization
5. retrieve the connected account: Check account status
6. incorrectly announce a non-ACTIVE account: Reports ACTIVE before account authorization

## Rules that hold

NoDeadlock
