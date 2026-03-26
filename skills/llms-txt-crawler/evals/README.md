# llms-txt-crawler Evaluation

## evals.json

Contains 5 test cases, each with:
- `id` — unique integer
- `prompt` — the user request to test
- `expected_output` — what a correct response looks like
- `files` — input files (empty for web-only tests)
- `assertions` — concrete checks that must pass with evidence

## Running Evals

1. Spawn a **clean subagent** per test case (no shared context)
2. Run once **with** the skill loaded, once **without**
3. Capture `timing.json` from the task notification (`total_tokens`, `duration_ms`)
4. Grade each assertion against the output — require concrete evidence for PASS

## Workspace Structure

```
llms-txt-crawler-workspace/
  iteration-1/
    parse-sections/
      with_skill/
        outputs/      # files produced by the run
        timing.json   # {total_tokens, duration_ms}
        grading.json  # assertion results
      without_skill/
        outputs/
        timing.json
        grading.json
    benchmark.json    # aggregated {pass_rate, tokens} with delta
    feedback.json     # human review notes
```

## Iteration

1. Run all evals and collect grading results
2. Identify failing assertions — these are signals for improvement
3. Update SKILL.md based on signals
4. Rerun evals, compare benchmark deltas
5. Stop when feedback is consistently empty or improvement plateaus

Use the `skill-creator` skill to automate evaluation runs.
See [agentskills.io](https://agentskills.io/skill-creation/evaluating-skills) for full methodology.
