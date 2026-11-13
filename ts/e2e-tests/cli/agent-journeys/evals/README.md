# Skill decisions

One directory per decision about the `composio-cli` skill or the CLI text agents read: why the change was made, what was measured, and the batches it was measured with. `results/` is git-ignored; this directory is where the evidence behind a kept or dropped change stays.

Each decision has:

- `README.md`: the problem seen in the runs, the change, the commands that measured it, the comparison, and the decision.
- `<batch id>/`: `batch.json`, `runs.jsonl` and `summary.md` of every batch the decision rests on, copied with `bun run eval.ts keep <batch> <decision>`. The full logs are not kept; rerun the batch to get them.

To check a decision again, compare the kept batches, then run the same commands on the current checkout and compare the new batch with the kept baseline:

```sh
bun run eval.ts compare evals/<decision>/<baseline id> evals/<decision>/<candidate id>
bun run eval.ts run --model claude-haiku-5-5 --runs 5 --label recheck
bun run eval.ts compare evals/<decision>/<candidate id> <new batch id>
```

`compare` refuses batches graded by a different harness. When the journeys or the checks changed since, measure a new baseline at the decision's revision instead.
