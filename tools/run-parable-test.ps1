$proj = "C:\Users\523ur\OneDrive\Документы\calibri"
$exe = "C:\Users\523ur\AppData\Roaming\npm\node_modules\@opencode\cli\bin\opencode.exe"
$out = Join-Path $proj "logs\parable-test-ru.out.log"
$err = Join-Path $proj "logs\parable-test-ru.err.log"
"start: $(Get-Date -Format 'HH:mm:ss')"
& $exe run --standalone --agent parable --model colibri-local/parable-qwen3-4b --auto "Напиши функцию на Python для сортировки списка пузырьком" *>> $out 2>> $err
"exit=$LASTEXITCODE end: $(Get-Date -Format 'HH:mm:ss')"
