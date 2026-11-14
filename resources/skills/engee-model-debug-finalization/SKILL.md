---
name: engee-model-debug-finalization
description: "Safely finalize an active Engee model debugging or model-development session. Use when the user asks to stop for today, pause debugging, checkpoint current Engee/Simulink/physical-model work, preserve a resume point, summarize debug iterations, or capture recommendations for improving future model-debugging workflows, scripts, block usage, API usage, files, and environment interaction."
---

# Engee Model Debug Finalization

## Overview

Use this skill to end a debugging session without losing state. The goal is to choose a safe resume point, record what is stable versus experimental, and extract workflow improvements from the low-level R&D that happened during the session.

## Core Rule

Do not treat the latest edit as the checkpoint automatically. Choose the most convenient safe point: the last artifact or model state that was actually verified by a passing run and useful metrics.

If the latest experiment was interrupted, timed out, or produced ambiguous results, mark it as experimental and point the next restart to the last known-good checkpoint.

## Session Close Workflow

1. Stop active work.
   - Do not start new long simulations.
   - If a run is still active and the environment exposes a safe stop command, try to stop it.
   - If stopping is unavailable or risky, record that the run may still be active and avoid relying on its result.

2. Inspect local state.
   - List relevant project files and artifacts.
   - Read the latest report, run table, state file, or logs if present.
   - Identify which source file is stable and which is experimental.

3. Choose the checkpoint.
   - Prefer a saved model artifact over transient runtime state.
   - Prefer a checkpoint with `RUN_OK=true` and extracted metrics.
   - Record runtime version, remote path, local path, run id, stop time, fixed step, and pass criteria when available.

4. Write project state files.
   - Update or create a dated status file such as `PROJECT_STATUS_YYYY-MM-DD.md`.
   - Update or create `debug_state.json`.
   - Update or create `debug_runs.csv`.
   - Update or create a dated workflow handoff such as `DEBUG_WORKFLOW_YYYY-MM-DD.md`.

5. Capture skill-improvement insights.
   - Create or update project-local `.skill_drafts/`.
   - Add recommendations for improving installed scripts and designing new skills.
   - Focus on inefficiencies that forced low-level R&D: repeated rebuilds, token-heavy logs, brittle API calls, block discovery friction, file layout mistakes, or environment-specific surprises.

6. Mark experimental files clearly.
   - If the active script is ahead of the safe checkpoint, add a short top comment or state-file note saying it is experimental.
   - Do not revert user work unless explicitly asked.

7. Final response.
   - Say which checkpoint was selected.
   - List the files created or updated.
   - Name the first action for the next session.

## Required Files

Create or update these when relevant:

- `PROJECT_STATUS_YYYY-MM-DD.md`: concise human-readable checkpoint and open issues.
- `DEBUG_WORKFLOW_YYYY-MM-DD.md`: session narrative, iteration decisions, and resume plan.
- `debug_state.json`: machine-readable current state.
- `debug_runs.csv`: compact iteration table.
- `.skill_drafts/debug-skill-recommendations-YYYY-MM-DD.md`: workflow and skill improvement recommendations.

Use the templates in `references/templates.md` when useful.

## Checkpoint Selection Heuristics

Accept a checkpoint when:

- the model was saved locally or remotely;
- a simulation passed;
- the result has at least one meaningful metric;
- the run configuration is recorded;
- known limitations are explicit.

Reject or mark experimental when:

- the run was interrupted;
- the run timed out;
- the model compiled but key metrics were wrong;
- the runtime state is not reproducible;
- the latest script contains unverified patches.

## Recommendations Capture

Read `references/recommendation-prompts.md` when creating `.skill_drafts` recommendations.

Always capture:

- what repeated work wasted time;
- what low-level discoveries should become a reusable workflow;
- what API or environment behavior was surprising;
- what should be automated by scripts;
- what should become a new skill;
- what should stay as a lightweight project convention rather than a skill.

## Debugging-Specific Guidance

For model debugging, prefer this resume architecture:

- Baseline builder creates the first complete model.
- Patch debugger modifies an already-open checkpoint.
- Reports record hypothesis, patch, test duration, metric, and decision.
- New model checkpoints are saved only after a pass.

Do not keep rebuilding 90 percent of a model after the baseline is established unless the underlying structure changed enough to justify a rebuild.

## Minimal Final Answer Shape

Keep the final answer short:

```text
Stopped at checkpoint: <name/path>.
Created/updated: <files>.
Current active script/model status: <stable or experimental>.
Next session should start by: <one action>.
```
