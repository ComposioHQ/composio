# Composio skill evals

`cases.json` is the source of truth. Dry cases run automatically when the skill, runner, or workflow changes. Critical cases must run at least three times.

```bash
node ts/scripts/run-skill-evals.mjs validate
node ts/scripts/run-skill-evals.mjs matrix
node ts/scripts/run-skill-evals.mjs grade composio/<case-id> <output-file>
```

Keep assertions deterministic and tied to user-visible behavior. Put volatile facts in a case-specific source fixture so the agent is evaluated against an explicit snapshot rather than its memory.

Live cases are excluded from pull-request jobs because they require trusted credentials. Execute their external steps through Composio, retain the Composio log ID, and pass the captured answer to the same `grade` command. Promote a live case to scheduled CI only after its Composio test account and cleanup behavior are defined.
