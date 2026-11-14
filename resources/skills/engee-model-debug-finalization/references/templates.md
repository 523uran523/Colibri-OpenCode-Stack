# Templates

## PROJECT_STATUS_YYYY-MM-DD.md

```markdown
# Project Status YYYY-MM-DD

## Selected Checkpoint

- Local model:
- Remote model:
- Report:
- Runtime/version:
- Confirmed run:
- Why this checkpoint was chosen:

## Stable Contents

- 

## Experimental State

- Current script/model:
- Unverified changes:
- Interrupted or timed-out runs:

## Key Metrics

- 

## Open Issues

1. 

## Resume Plan

1. Load checkpoint:
2. Run smoke test:
3. Apply next patch:
```

## debug_state.json

```json
{
  "project": "",
  "date": "YYYY-MM-DD",
  "runtime_version": "",
  "selected_checkpoint": {
    "kind": "stable_artifact",
    "iteration": null,
    "local_model": "",
    "local_report": "",
    "remote_model": "",
    "run_id": null,
    "stop_time": null,
    "fixed_step": null,
    "run_ok": true
  },
  "current_script_state": {
    "file": "",
    "status": "stable|experimental_after_checkpoint",
    "notes": []
  },
  "key_findings": [],
  "next_actions": []
}
```

## debug_runs.csv

```csv
iteration,date,runtime,change,test_duration_s,result,key_metric,decision
```

## DEBUG_WORKFLOW_YYYY-MM-DD.md

```markdown
# Debug Workflow YYYY-MM-DD

## Goal

## Source Analysis Completed

## Iteration Log

## Chosen Save Point

## Recommended Resume Plan

## Hypothesis Graph

## Debug Principle For Next Session
```

