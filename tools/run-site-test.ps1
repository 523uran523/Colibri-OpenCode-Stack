$proj = Split-Path $PSScriptRoot -Parent
$exe = "C:\Users\523ur\AppData\Roaming\npm\node_modules\@opencode\cli\bin\opencode.exe"
$out = Join-Path $proj "logs\site-test.out.log"
$err = Join-Path $proj "logs\site-test.err.log"
$prompt = 'Create a folder named site. Inside it create index.html with a minimal HTML page (title Demo Site, h1 heading, a paragraph, a link to style.css, and an img tag pointing to assets/img.png). Create style.css with basic styling (background #f0f0f0, font-family sans-serif). Create folder site/assets and inside it create img.png as a tiny transparent 1x1 PNG. Create config.json with JSON content: {"title": "Demo Site", "version": "1.0"}. Use only the write, read and list tools.'
"start: $(Get-Date -Format 'HH:mm:ss')"
& $exe run --standalone --agent qwen --model colibri-local/qwen3-coder-30b-a3b-colibri --auto $prompt *>> $out 2>> $err
"exit=$LASTEXITCODE end: $(Get-Date -Format 'HH:mm:ss')"
