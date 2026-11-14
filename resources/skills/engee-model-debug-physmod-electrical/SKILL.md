---
name: engee-model-debug-physmod-electrical
description: "Layered debugging of Engee acausal electrical and electromechanical physical models, with checkpointing, hypothesis tracking, block/control polarity probes, and short-to-long simulation ladders. Use when an Engee physical electrical model does not run reliably, has stiff switching behavior, or must be debugged against a Simulink/reference model. For small debug experiments, prefer direct command control through `engee-api` `/external/command/eval`; switch to `engee-model-development` only for larger structural rebuilds where generating/uploading/running a `.jl` script is more efficient."
---

# Engee Model Debug Physmod Electrical

Use this draft skill when an electrical or electromechanical physical model exists but does not yet run reliably or match its reference.

Use `engee-api` together with this skill as the default execution path for small model-debugging changes: add/delete blocks, reconnect lines, change parameters, run simulations, inspect logs/results, and save checkpoints through short commands sent to `/external/command/eval`.

Use `engee-model-development` only when the debugging step becomes a significant structural change or repeatable rebuild where a generated `.jl` script is more efficient than issuing several direct API commands.

## Goals

- Debug by layers, not by changing many subsystems at once.
- Keep a stable checkpoint at every verified layer.
- Track hypotheses and results explicitly.
- Avoid full model rebuilds after the baseline model is created.
- Build, run, and debug Engee models on the Engee version that is default inside the pod version `DEMO54365636`; do not pin debugging work to some other specific pod/runtime version.

## Runtime Version Policy

When using Engee API or generated Julia scripts for model build/debug work, use the default Engee runtime available in the pod version `DEMO54365636`. Do not switch to a separately selected pod version unless the user explicitly asks for a comparison or migration check.

## Primary Execution Pipeline

For routine debug iterations, keep the model loaded in Engee and modify it through `engee-api` command evaluation:

1. Use this skill to choose the layer, hypothesis, expected metric, run duration, pass criteria, and checkpoint name.
2. Use `engee-api` `POST /external/command/eval` for small, inspectable commands: `engee.add_block`, `engee.delete_block`, `engee.add_line`, `engee.delete_line`, `engee.set_param!`, `engee.set_log`, `engee.run`, `engee.get_logs`, `engee.get_results`, `engee.save`.
3. Prefer several short commands over uploading a script when each command has a clear diagnostic purpose and the state can be inspected between steps.
4. After each run, interpret logs/results with this skill and decide whether to accept the checkpoint, rollback, simplify, or advance to the next layer.

This direct API loop is the default for minor changes because it keeps the debug state visible, avoids script upload overhead, and makes failed experiments easier to isolate.

## Switch Point to `engee-model-development`

Switch from direct `engee-api` commands to `engee-model-development` when the change is large enough that a generated `.jl` script is clearer or cheaper than many eval calls.

Use `engee-model-development` for:

- creating a new baseline model or rebuilding a major subsystem from scratch
- adding or rewiring many blocks at once, especially across multiple subsystems
- applying the same transformation repeatedly to several variants
- generating a reusable patch or reproducible artifact that should be reviewed, saved, and rerun
- changes where rollback is easier by reloading a generated checkpoint than by undoing many individual commands
- scripts that need helper functions, loops, structured data tables, or long multi-line logic

Practical threshold: stay with direct `engee-api` commands for roughly one focused debug hypothesis, one subsystem, and up to about 5-10 simple model edits. Switch to `engee-model-development` when the experiment would require more than about 10-15 state-changing commands, touches several subsystems, needs nontrivial loops/helpers, or must be rerun as a stable artifact. This threshold is a guideline: if API latency or command coordination becomes the bottleneck, switch earlier.

Avoid switching to `.jl` upload just because the command uses `engee.*`; direct command control is the normal path for small debug experiments.

## Coordination with `engee-api` and `engee-model-development`

This skill decides the **debugging strategy** for acausal electrical/electromechanical physical models. `engee-api` is the default execution mechanism for small command-level changes. `engee-model-development` is the structural-code path for larger rebuilds and reusable scripts.

Keep this skill as the lead playbook when:

- the problem is physical-model reliability, initialization, stiffness, topology, references, solver configuration, switching behavior, feedback loops, or mismatch against a reference model
- the work needs layer-by-layer checkpoints, hypothesis tracking, short-to-long simulation ladders, or controlled rollback to a last known-good model
- the model already exists but must be made to run reliably before further feature work

Use `engee-api` as the normal implementation path when:

- a debug hypothesis can be tested by a few direct commands
- the model is already loaded and only needs local edits, parameter changes, logging, run duration changes, or checkpoint saves
- the next command result should influence the following command
- fast inspection of `engee.get_logs()` or `engee.get_results()` matters more than having a standalone script

Switch to or pair with `engee-model-development` when:

- a debug hypothesis must be turned into a reusable `.jl` patch
- blocks, lines, parameters, logging, simulation settings, or checkpoint saves must be edited in bulk
- a minimal smoke-test model needs to be generated from scratch to isolate a physical subsystem
- API execution needs a script that can be uploaded, included, run, and used to download artifacts

Normal handoff loop:

1. This skill selects the layer, hypothesis, expected metric, run duration, pass criteria, and checkpoint name.
2. `engee-api` executes short direct commands for the normal minor-change debug loop.
3. If the command sequence becomes too large or repetitive, `engee-model-development` writes or edits the Julia script for that exact experiment.
4. `engee-api` runs either the direct commands or the generated script when execution in Engee is required.
5. This skill interprets logs/results and chooses whether to accept the checkpoint, rollback, simplify, or advance to the next layer.

## Layer Order

1. Physical network sanity
   - exactly one solver per connected physical network
   - required electrical/mechanical references
   - no floating essential nodes

2. Passive topology
   - sources
   - references
   - loads
   - sensors
   - no switching yet

3. Electromechanical core
   - machine parameters
   - inertia
   - constant load torque
   - basic measurement outputs

4. Switching devices
   - one phase or one switch first
   - then full three-phase bridge
   - verify control polarity

5. Control signals
   - open-loop command
   - gate pulses
   - delays/memory to break direct loops

6. Load and feedback
   - measured-speed feedback
   - torque laws
   - bypass/contactor logic

7. Fidelity upgrades
   - detailed gate driver
   - thermal ports
   - snubbers and parasitics
   - reference monitoring outputs

## Simulation Ladder

Run each layer through increasing durations:

- `0.02 s`: compile/init smoke
- `0.2 s`: first switching behavior
- `1.0 s`: early dynamics
- event time plus margin
- full target duration

## Checkpoint Policy

Save after every passed layer:

- `model_base_ok.engee`
- `model_machine_ok.engee`
- `model_thyristors_ok.engee`
- `model_load_ok.engee`
- `model_bypass_ok.engee`

Never overwrite the last known-good checkpoint with an unverified experiment.

## Hypothesis Template

```text
Hypothesis:
Patch:
Expected metric:
Run duration:
Pass criteria:
Result:
Decision:
Next:
```

## Common Debug Moves

- Add `Unit Delay` or `Memory` to measured feedback paths.
- Replace a feedback law with a constant, then restore it through a delay.
- Verify switch/breaker polarity with a tiny isolated test.
- Log only a few signals during long stiff switching runs.
- Run short tests around known event times before a full simulation.
- Keep failed patches as evidence but reload the last stable checkpoint.

## Outputs

Recommended per-project files:

- `debug_state.json`
- `debug_graph.md`
- `debug_runs.csv`
- `commands/*.txt`
- `patches/*.jl`
- `reports/*.txt`
