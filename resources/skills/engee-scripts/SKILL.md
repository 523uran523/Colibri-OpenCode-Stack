---
name: engee-scripts
description: "Use this skill when Codex needs to create, edit, inspect, run, or debug Engee interactive scripts (`.ngscript`): generating notebook-like ngscript JSON, preparing Russian documentation/demo examples under the corporate Engee style standard, converting or comparing with Jupyter notebooks, executing scripts through the Engee HTTP API with the `engee-api` skill, and using Engee programmatic script commands such as `engee.script.edit`, `engee.script.run`, and `engee.script.@include`."
---

# Engee Scripts

Use this skill for `.ngscript` work: create script files, validate their notebook structure, run them in Engee, and debug failures.

## First checks

1. Work in the user-specified project folder. If none is specified, use the current workspace.
2. Inspect nearby examples before generating a new script. This skill includes:
   - `examples/engee_notebook_example.ngscript`
   - `examples/jupyter_notebook_example.ipynb`
   - `examples/physical_chemistry_practice.ngscript`
   - `examples/advanced_physical_chemistry_quantum_bonds.ngscript`
3. Treat `.ngscript` as a Jupyter notebook JSON document with Engee conventions, not as a plain `.jl` file.
4. Use `$engee-api` whenever the task requires starting Engee, finding the runtime URL, uploading files, running eval/jobs, or downloading artifacts.
5. Do not print PAT/OAuth tokens. Follow `$engee-api` token handling rules.
6. For documentation, tutorial, practice, or demo examples, read:
   - `instructions/standart.md` for the corporate Engee example structure.
   - `instructions/style_and_language.md` for Russian-language style rules.

## Creation workflow

1. Read [references/ngscript-format.md](references/ngscript-format.md) when creating or editing `.ngscript` JSON.
2. Choose script shape:
   - For a runnable Engee script, create `.ngscript` with Julia/IJulia metadata.
   - For simple automation that does not need notebook UI, create a plain `.jl` runner and use it to create or call `.ngscript`.
3. Keep new `.ngscript` files clean:
   - `nbformat: 4`
   - `nbformat_minor: 5`
   - `metadata.kernelspec.name: "ijulia-1.9"`
   - `metadata.language_info.name: "julia"`
   - `metadata.language_info.file_extension: ".jl"`
   - `metadata.engee: {}`
   - `cells`: markdown and code cells with Engee cell metadata.
4. Set `outputs: []` for new code cells unless the user explicitly wants saved outputs.
5. Set code cell `execution_count` to `0` to match the local Engee example.
6. Use stable, short unique cell ids, usually 8 lowercase hex characters.
7. Store each cell `source` as an array containing one multi-line string. Do not split multi-line Julia blocks into many `source` entries: `engee.script.run` can execute only the first entry and fail with `premature end of input`.
8. For scripts that need external Julia packages, include an early installation cell with `import Pkg`, `Base.find_package`, and `Pkg.add` for missing packages. Package installation persists in the Engee Julia environment even when the script itself is run with `isolate = true`.
9. Make the final code cell return a compact string such as `string("example ok; metric=", value)`. This makes API execution and debugging much easier than relying on notebook UI output.
10. Validate JSON after editing by parsing it with a structured parser such as PowerShell `ConvertFrom-Json` or `jq`, not by visual inspection alone.

## Documentation example workflow

Use this workflow when the `.ngscript` is intended for publication, training, a practice task, or an engineering demo.

1. Write the script text primarily in Russian. Keep English for product names, API terms, file names, function names, variables, packages, and established abbreviations.
2. Start with a standalone markdown cell containing one H1 Russian title. Do not add punctuation or inline formatting to this title.
3. Add an annotation after the title: explain the engineering task, demonstrated Engee tools, achieved effect, and intended audience.
4. Split the script into semantic paragraphs. Put every H2 or H3 heading in its own markdown cell. Avoid lower heading levels unless the example genuinely needs them.
5. Before every code cell, add a short markdown cell that states what the code does and which engineering procedure it performs.
6. After code output, plots, screenshots, or tables, add a brief interpretation: describe what the reader should notice and what engineering conclusion follows.
7. Keep each code cell focused on one procedure, such as package loading, data import, parameter calculation, visualization, model control, simulation, or result analysis.
8. Format every formula in theory or calculations with KaTeX syntax, both inline and block formulas. Do not leave formulas as plain prose or plain code unless the expression is meant to execute.
9. End the script with a markdown conclusion, not with code, a plot, or a screenshot.
10. Do not use the script to develop or structurally build the model. Use `.ngscript` only to explain theory, calculate and assign parameters, execute an existing model, collect signals, and process results.
11. For model examples, include programmatic model loading/opening, parameterization, simulation, result collection, model closing, screenshots of the model or subsystem, and plots or screenshots of simulation results.
12. Save publication-worthy plots and visual outputs in the notebook outputs when the user expects a documentation artifact; clear stale outputs for ordinary executable scripts.
13. Use file names for images and screenshots without spaces.

### Publication model-script lessons

Use these rules when preparing documentation-style model examples for Engee publication.

1. Keep runnable assets colocated with the `.ngscript` whenever possible. Prefer:

```julia
dir = @__DIR__
model_paths = Dict(
    :main => joinpath(dir, "model_name.engee"),
)
```

Avoid hardcoded remote paths such as `/user/...` in publication examples unless the example is explicitly about a fixed remote workspace. If an output folder is needed, define it explicitly, for example `output_dir = dir`, and use that variable consistently.

2. Engee already provides built-in graphics. Use its graphics functions directly. Never import, install, or explicitly call the Julia Plots package in Engee examples.

3. Keep the annotation descriptive rather than instructional. Good annotation wording is like "В этом примере рассчитывается..." or "В скрипте показано...". Use imperative wording mainly before code cells where the reader performs a concrete procedure.

4. If the example uses several models, name the section in plural, for example `## Описание моделей`. Use precise domain terms consistently: `RC-фильтр` for the filter concept, `RC-цепь` for a physical electrical circuit, and `сеть` only when discussing the connected physical network.

5. For model screenshots in documentation, prefer markdown image attachment cells placed next to the model description or simulation paragraph. This gives stable publication output and avoids making successful script execution depend on screenshot generation.

6. If `engee.screenshot(...)` is used, treat it as an optional documentation helper, not as a blocking simulation step. In some API/script runtimes it can fail inside Engee with `IllegalLogUsageException("Using the error, warning, and info functions is only available in model callbacks.")`. Wrap it in a small `try`/`catch` or replace it with an embedded screenshot attachment. Do not mention `engee.screenshot` in the text or references if the final script no longer calls it.

7. For model-control cells inside `engee.script.run`, `Core.eval(Main, quote ... end)` can be useful when Engee model commands need the main runtime context. Keep this pattern narrow: load/open/run/close models inside the evaluated block, return only simple payloads such as `results`, `result_text`, and status strings, then analyze results in normal notebook cells.

8. Avoid stale globals and soft-scope warnings in saved outputs. Inside loops that load models, use distinct local names or declare `local model` before assignment. Publication outputs should not contain stderr warnings unless the warning is the subject of the example.

9. Publication examples may keep saved outputs while code-cell `execution_count` remains `0`, matching Engee notebook conventions. Prefer storing useful text outputs for calculations and model runs, and embedded `image/png` or `image/svg+xml` outputs for final plots.

10. Literature lists should cite the exact source used for the exercise, including edition, page range when relevant, and formatted titles. Also keep Engee documentation references aligned with functions and blocks actually used in the final script.

### Reference list format for Russian examples

Use this format for `## Список литературы` in Russian publication examples.

1. Number every source manually with `1.`, `2.`, etc.
2. For books, write authors first, then the title in bold, then publisher, year, and pages when the example is based on a specific fragment:

```md
1. Хейс Т.К., Хоровиц П. **Искусство схемотехники. Теория и практика.** БХВ-Петербург, 2022. с.128-130
2. Хоровиц П., Хилл У. **Искусство схемотехники.** Том 1. Мир, 1993.
```

3. For Engee block documentation, group all used blocks in one `Engee Help Center` item. Use Markdown links for every block name, not plain backticks without links:

```md
5. Engee Help Center. Документация блоков [`Transfer Fcn`](https://engee.com/helpcenter/stable/ru/base-lib-continuous/transfer-fcn.html), [`Sine Wave`](https://engee.com/helpcenter/stable/ru/base-lib-sources/sine-wave.html), [`Resistor`](https://engee.com/helpcenter/stable/ru/fmod-electrical-elements/resistor.html).
```

4. To find block documentation URLs, use `engee-blocks/blocks.json` first. Take the block entry by library `path` or `blockNameEN`, then use its `url` field. If the stored URL points to `/stable/en/` and the Russian page is needed, prefer the equivalent `/stable/ru/` URL when it follows the same slug pattern. Use `engee-blocks/doc/md` or `doc/html` to confirm the block identity and slug if needed.
5. For Engee programmatic model-control methods, group methods in one `Engee Help Center` item and link each method separately:

```md
6. Engee Help Center. Программное управление моделями: [`engee.load`](https://engee.com/helpcenter/stable/ru/modeling/programmatic-modeling-functions.html#engee.load-Tuple{AbstractString}), [`engee.open`](https://engee.com/helpcenter/stable/ru/modeling/programmatic-modeling-functions.html#engee.open-Tuple%7BString%7D), [`engee.run`](https://engee.com/helpcenter/stable/ru/modeling/programmatic-modeling-functions.html#engee.run-Tuple%7BUUID%7D), [`engee.get_results`](https://engee.com/helpcenter/stable/ru/modeling/programmatic-modeling-functions.html#engee.get_results-Tuple%7BCommandControlTypes.Model%7D), [`engee.close`](https://engee.com/helpcenter/stable/ru/modeling/programmatic-modeling-functions.html#engee.close-Tuple%7BCommandControlTypes.Model%7D).
```

6. To find programmatic method documentation URLs, use `engee-model-development/doc/programmatic-modeling-functions.md`. Its first `Source:` line gives the base page URL. The method sections give the method names and signatures used for anchors. Prefer the exact official anchor if it is known from the local docs or prior verified examples; URL-encode braces as `%7B` and `%7D` when that avoids Markdown or renderer issues.
7. Keep the reference list consistent with the final script. If the final code does not call `engee.screenshot`, do not list `engee.screenshot`. If a block was removed from the model or explanation, remove it from the documentation links.

Recommended published-script outline:

```md
# <Название скрипта>

<Аннотация>

## Введение
## <Методы, инструменты или постановка задачи>
### <Расчет параметров или прототипирование>
## <Описание модели или алгоритма>
## <Симуляция или выполнение>
## <Анализ результатов>
## <Заключение>
## Список литературы
```

## Style and language checklist

Apply the detailed rules in `instructions/style_and_language.md` when writing narrative cells.

- Explain abbreviations and new terms at first use.
- Use direct, active wording and address the reader directly when giving instructions.
- Prefer short sentences and short paragraphs. Keep one complete thought per paragraph.
- Use bold for important UI labels, parameters, sections, variables, classes, and terms in prose.
- Use backticks for functions, methods, code fragments, file names, and commands.
- Use KaTeX for formulas: inline formulas as `$...$` and display formulas as `$$...$$`.
- Use screenshots to clarify UI actions or show operation results, but not as a substitute for code or parameter tables.
- Use numbered lists for ordered procedures and bullet lists for unordered related items.
- Use a dot as the decimal separator.

## Programmatic Engee commands

Read [references/run-debug.md](references/run-debug.md) for the API/run/debug checklist.

Core commands from Engee docs:

```julia
engee.script.edit(path::String)
engee.script.run(path::String; isolate::Bool = false)
engee.script.@include(path::String)
```

Use them this way:

- `engee.script.edit("file.ngscript")` creates or opens a `.ngscript` in the Engee script editor. It errors if the path does not end with `.ngscript`.
- `engee.script.run("file.ngscript")` runs the script and returns the last top-level expression.
- `engee.script.run("file.ngscript"; isolate = true)` runs in a temporary isolated environment so globals created during execution are not kept.
- `engee.script.@include("file.ngscript")` lexically inserts the script content at the call site; use it when scope matters or when a script must behave like included Julia code.

## Execution workflow through Engee API

1. Activate `$engee-api`.
2. Check `GET /account/api/engee/info`; start the instance if needed.
3. Resolve `runtimeBase` from `info.url`.
4. Run a smoke check through `POST {runtimeBase}/external/command/eval`, for example:

```julia
string("engee-ready")
```

5. Deliver the `.ngscript` to the runtime:
   - Prefer `external/file/upload` for normal file upload.
   - For `.ngscript` files, the most robust fallback is often base64 reconstruction: send base64 text through `eval`/`jobs/create`, write the decoded text to a remote temp directory, then run it.
6. Execute with `engee.script.run(remote_path; isolate = true)` for repeatable test runs, or `isolate = false` only when the script intentionally shares global state.
7. For long scripts, use job-based execution (`jobs/create` and `jobs/{id}/result`) instead of one large `eval`.
8. Always inspect the returned `result.type` and a meaningful returned value, not only HTTP status.

## Debugging workflow

1. Reproduce with the smallest failing command through `eval`.
2. If the failure is inside `.ngscript`, split the script into cells/sections and run the suspect expression directly as Julia code.
3. Use `isolate = true` first to avoid stale globals. Retry with `isolate = false` only if the script depends on shared state.
4. Make the script return explicit status strings or simple data structures. Do not rely on notebook UI output being captured by HTTP calls.
5. For model scripts, run creation, configuration, simulation, and result extraction as separate API steps.
6. If model simulation succeeds but result parsing fails, add a follow-up eval that serializes the exact fields needed to CSV, JSON text, or a plain string.
7. Preserve useful Engee outputs in `.ngscript` only when the user wants a notebook-like artifact; otherwise clear stale outputs before saving.
8. If `engee.script.run` reports `premature end of input` on a function/block, inspect `cell.source`; the cell is probably split into many source entries instead of one multi-line string.

## Comparing with Jupyter

Use the bundled examples as the reference comparison:

- Both files are notebook JSON (`nbformat` 4.5) with `metadata`, `cells`, markdown cells, code cells, and Jupyter-style `outputs`.
- The Engee `.ngscript` example uses Julia/IJulia metadata and `.jl` language info.
- The Jupyter `.ipynb` example uses Python metadata.
- Engee cells include `metadata.engee` UI state such as display flags, paragraph state, output layout, and code mask/editor state.
- Engee script code cells contain Julia code and may include Engee package/model commands.

## Quality bar

- Prefer small, executable scripts with one clear final expression.
- Keep generated JSON deterministic and readable with two-space indentation.
- Avoid hand-assembled JSON strings when a structured JSON writer is available.
- Never hardcode runtime URLs or tokens; let `$engee-api` discover them.
- Do not turn documentation scripts into model-development scripts. Keep model construction and structural edits outside `.ngscript` unless the user explicitly asks for a technical automation script rather than a documentation example.
- When package installation is part of the example, include it in the `.ngscript` itself and report whether packages were already present or installed.
- In final responses, report the local script path, the remote path if executed, the command used to run it, and the observed result or error summary.
