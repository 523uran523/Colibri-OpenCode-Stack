$proj = "C:\Users\523ur\OneDrive\Документы\calibri"
$exe = "C:\Users\523ur\AppData\Roaming\npm\node_modules\@opencode\cli\bin\opencode.exe"
$out = Join-Path $proj "logs\qwen-test-ru.out.log"
$err = Join-Path $proj "logs\qwen-test-ru.err.log"
"start: $(Get-Date -Format 'HH:mm:ss')"
& $exe run --standalone --agent qwen --model colibri-local/qwen3-coder-30b-a3b-colibri --auto "Создай файл test_qwen.py в текущей папке и напиши в нём функцию сложения двух чисел" *>> $out 2>> $err
"exit=$LASTEXITCODE end: $(Get-Date -Format 'HH:mm:ss')"
