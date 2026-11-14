# Running And Debugging

Use this reference when a `.ngscript` must be executed or diagnosed in Engee.

## Official script commands

Engee documents these script commands:

```julia
engee.script.edit(path::String)
engee.script.run(path::String; isolate::Bool = false)
engee.script.@include(path::String)
```

Behavior to rely on:

- `edit(path)` opens an existing script or creates an empty script in the editor. `path` must end with `.ngscript`.
- `run(path; isolate = false)` runs the script and returns the last top-level expression.
- With `isolate = false`, global/top-level variables remain in `Main` after execution.
- With `isolate = true`, the script runs in a temporary isolated environment and variables created during execution do not remain after completion.
- `@include(path)` inserts script contents lexically at the call site, unlike `run`, which executes the script separately.

## API execution pattern

Use `$engee-api` for account and runtime API details. The high-level sequence is:

1. Check/start Engee.
2. Resolve runtime URL from `engee/info`.
3. Smoke-check runtime:

```julia
string("ready=", true)
```

4. Upload or reconstruct the `.ngscript` in a remote temp directory.
5. Run:

```julia
engee.script.run("/user/codex_tmp/run_001/script.ngscript"; isolate = true)
```

6. For long scripts, submit a job:

```julia
result = engee.script.run("/user/codex_tmp/run_001/script.ngscript"; isolate = true)
string("result=", result)
```

7. Poll until the job is done and check `result.type`.

For `.ngscript` delivery, prefer base64 reconstruction when multipart upload is flaky:

```julia
using Base64
mkpath("/user/codex_tmp/run_001")
write("/user/codex_tmp/run_001/script.ngscript", String(base64decode("<base64-ngscript>")))
engee.script.run("/user/codex_tmp/run_001/script.ngscript"; isolate = true)
```

## Debug patterns

Prefer explicit return values:

```julia
model_path = "/user/codex_tmp/demo.engee"
string("saved=", isfile(model_path), "; path=", model_path)
```

Probe runtime state:

```julia
string("pwd=", pwd(), "; files=", join(readdir("/user/codex_tmp"), ","))
```

Catch and serialize an error:

```julia
try
    engee.script.run("/user/codex_tmp/run_001/script.ngscript"; isolate = true)
    "ok"
catch err
    sprint(showerror, err, catch_backtrace())
end
```

For model workflows:

1. Create/open model in one command.
2. Add/configure blocks in a second command.
3. Save and assert the file exists.
4. Run simulation.
5. Extract logs/results with a follow-up eval that serializes a small value.

## Common failure modes

- `path should end with '.ngscript' extension`: wrong path or extension.
- `premature end of input` near the first line of a function/block: the cell may have `source` split into many array entries. Rewrite it as one multi-line string in the `source` array.
- HTTP success but Engee code failed: inspect runtime `result.type` and returned text.
- Empty or `nothing` result: the script's last expression does not return useful data.
- Different behavior between runs: stale globals in `Main`; retry with `isolate = true`.
- Variables missing after run: script was run with `isolate = true`; use `isolate = false` only when persistent globals are intentional.
- Upload failures or redirects: use `$engee-api` base64 reconstruction fallback instead of spending time on multipart.
- Package imports fail in a clean runtime: add an early `Pkg.add`/`Base.find_package` installation cell to the `.ngscript`; package installation can persist even when script globals are isolated.

## Script result convention

Make the final cell return one concise status string:

```julia
string("example ok; metric_a=", round(metric_a; digits=3), "; metric_b=", metric_b)
```

This gives `/external/command/eval` and `jobs/create` a deterministic value to inspect after `engee.script.run(...)`.
