---
name: engee-fixed-point-conversion
description: Propose and verify fixed-point data types for Engee block models from measured signal ranges. Use when converting Float64 or Float32 models, reporting per-signal ranges and types, and comparing baseline and converted simulations. Do not use for a single manual fi expression without a model.
---

# Engee Fixed-Point Conversion

## Deliverables

Provide separate baseline and converted `.engee` models, a signal table with original type, observed minimum and maximum, proposed `fixdt(S,W,F)`, and quantum `2^-F`, plus an output comparison. Preserve the baseline model. A type calculation or a successful converted-model run alone does not establish correctness: both simulations must run and their samples must be aligned and compared.

## Workflow

1. Select the system under design and the outputs that determine success. Use the local `engee-model-development` and `engee-blocks` skills for programmatic model editing and block capabilities, and `engee-api` for remote execution when available. Confirm the actual parameters and fixed-point support of each block before modifying it.
2. Simulate the baseline with inputs that cover the intended operating range. Log the input and the output of every block being converted. Merge ranges across scenarios. Reject empty, nonfinite, missing, or misaligned traces. Include known design limits even when simulation does not reach them.
3. For floating-point signals, start with word length `W=16` and choose the largest fractional length `F` whose representable range covers the measured or design range with a 2% outward margin. Choose `S=1` when the range contains negative values; otherwise choose `S=0`. Report the resulting representable limits. Negative `F` can accommodate large values; `F>W` can represent small values. The 16-bit setting is a Fixed-Point Tool proposal default when proposing fraction lengths, not a property of Float64.
4. In Engee, use `fi(x,S,W,F)` or `fi(x,fixdt(S,W,F))` for typed values and parameters. For a block's fixed-point output, set supported parameters such as `OutDataTypeStr="Fixed-point"` and `OutDataTypeStrFixed="fixdt(S,W,F)"`. Record the chosen rounding and overflow behavior. The verified example used `RndMeth="Convergent"` and `SaturateOnIntegerOverflow=true`. If a block cannot accept fixed-point data, retain floating point there and show the conversion boundary. Quantizing only the final output does not verify fixed-point arithmetic inside the model.
5. Run the converted model with the same inputs and time settings. Align timestamps and compare `max_abs`, MAE, RMSE, and maximum full-scale relative error: `max(abs(y_fixed-y_baseline))/max(abs(y_baseline))`. If the baseline output is identically zero, assign zero error only when the converted output is also zero; otherwise assign infinite relative error. The requested acceptance limit is 50%, but always report the measured error. Check baseline values against the proposed type limits, count converted samples exactly on those limits, and inspect model overflow instrumentation when available. No boundary hits does not prove there were no internal overflows.
6. If the result fails, increase word length or adjust the fractional allocation where saturation or accumulated error occurs. Rerun the converted simulation and comparison after each change. Keep the original model intact. If coverage or alignment is inadequate, report the limitation and do not mark the conversion as passed.

## References

- [MathWorks Fixed-Point Tool](https://www.mathworks.com/help/fixedpoint/ref/fixedpointtool.html): range collection, the default 16-bit proposal word length and 2% safety margin, conversion, and verification.
- [MathWorks type proposal rules](https://www.mathworks.com/help/fixedpoint/ug/how-the-fixed-point-tool-proposes-word-lengths.html): precedence of design ranges and combination of collected ranges.
- [Engee fixed-point arithmetic](https://engee.com/helpcenter/stable/en/guide/fixed-point.html): `fi`, `fixdt`, fractional length, and arithmetic.
