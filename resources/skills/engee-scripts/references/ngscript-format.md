# Ngscript Format

`.ngscript` files are notebook JSON documents with Engee-specific metadata. Use the bundled `examples/engee_notebook_example.ngscript` as the local canonical sample.

## Minimal document

```json
{
  "nbformat": 4,
  "nbformat_minor": 5,
  "metadata": {
    "kernelspec": {
      "name": "ijulia-1.9",
      "display_name": "IJulia 1.9.3",
      "language": "julia"
    },
    "language_info": {
      "name": "julia",
      "file_extension": ".jl",
      "version": "1.9.3"
    },
    "engee": {}
  },
  "cells": []
}
```

## Markdown cell

```json
{
  "id": "6317b070",
  "cell_type": "markdown",
  "source": [
    "# Section title"
  ],
  "attachments": {},
  "metadata": {
    "name": "Section",
    "engee": {
      "isDisplay": true,
      "isParagraph": true,
      "isClosedParagraph": false,
      "amountHideCellsInside": 0,
      "codeOutputView": "col",
      "codeOutputHidden": false
    }
  }
}
```

## Code cell

```json
{
  "id": "4d674e64",
  "cell_type": "code",
  "source": [
    "x = 1\nx + 1"
  ],
  "execution_count": 0,
  "outputs": [],
  "metadata": {
    "name": "Code",
    "engee": {
      "isDisplay": true,
      "isParagraph": false,
      "isClosedParagraph": false,
      "amountHideCellsInside": 0,
      "codeOutputView": "col",
      "codeOutputHidden": false,
      "outputInfo": {
        "isExpanded": false,
        "scrollTop": 0
      },
      "maskInfo": {
        "isMaskVisible": true,
        "isEditorVisible": true,
        "isAutoplayActive": false
      }
    }
  }
}
```

## Observed example comparison

The local examples show this structure:

| File | Kernel | Language | Cells | Markdown | Code | Output cells |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `engee_notebook_example.ngscript` | `ijulia-1.9` | `julia` | 36 | 29 | 7 | 5 |
| `jupyter_notebook_example.ipynb` | `Python 3` | `python` | 35 | 29 | 6 | 2 |

Important differences:

- `.ngscript` keeps the notebook container format but switches code semantics to Julia/Engee.
- `metadata.engee` exists at document level and on cells.
- In observed Engee files, `source` is safest as an array with one multi-line string per cell. Avoid splitting one code cell into many source-array entries: Engee `script.run` can parse only the first entry and fail on multi-line functions or blocks.
- Code cell outputs can be normal Jupyter outputs: `stream`, `execute_result`, `image/png`, `text/html`, `image/svg+xml`, etc.
- New generated scripts should usually omit stored outputs to avoid stale results.

## Validation checklist

Before handing off a generated `.ngscript`:

1. Parse the file as JSON.
2. Check `metadata.language_info.name == "julia"`.
3. Check every cell has `id`, `cell_type`, `source`, and `metadata.engee`.
4. Check every code cell has `execution_count` and `outputs`.
5. Check the filename ends with `.ngscript`.
6. Check every `source` array has exactly one string entry unless there is a known Engee reason to do otherwise.
7. If the script will be run through Engee, ensure the final cell or final top-level expression returns a useful value.

## Package installation cell

For examples that rely on non-base Julia packages, add an early code cell like this:

```julia
import Pkg

required_packages = ["QuadGK", "DataFrames", "Unitful"]
installed_now = String[]

for pkg in required_packages
    if Base.find_package(pkg) === nothing
        Pkg.add(pkg)
        push!(installed_now, pkg)
    end
end

using QuadGK
using DataFrames
using Unitful

string("packages-ready; installed=", isempty(installed_now) ? "none" : join(installed_now, ","))
```

`engee.script.run(path; isolate = true)` isolates script globals, but package installation updates the Julia environment and can remain available for later runs.
