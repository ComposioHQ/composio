/**
 * The bare-`composio` nudge.
 *
 * Zero args with an unfinished onboarding prints a short pointer at `composio onboard` instead of
 * the root command list. `--help` / `-h` / `--help <level>` keep their current behavior, and a user
 * who has finished onboarding still gets root help.
 *
 * Two constraints shaped this into a pure function in its own module:
 *
 * - It is **purely local**. Routing zero args into `onboard` itself would make `composio` — the
 *   thing a person types when they want the command list — perform a `connectedAccounts.list` and a
 *   host-wiring probe, inheriting onboard's latency, network failure modes, and exit-code surface.
 *   Both inputs here are already in hand before routing, so the branch performs no I/O at all.
 * - It is **decoration**, so it goes to stderr. Emitting it on stdout would put prose on the data
 *   stream of the one command most likely to be piped.
 *
 * `undefined` means "nothing to say" and falls through to root help unchanged.
 */
export const getLocalOnboardNudge = (facts: {
  readonly loggedIn: boolean;
  readonly hasExecuted: boolean;
}): string | undefined => {
  if (facts.hasExecuted) {
    return undefined;
  }

  return facts.loggedIn
    ? 'You are logged in but have not run a tool yet. Run `composio onboard` to connect an account and run your first tool.'
    : 'New here? Run `composio onboard` to log in, connect an account, and run your first tool.';
};
