param([string]$DesktopDirectory = [Environment]::GetFolderPath('Desktop'))
$ErrorActionPreference = 'Stop'
$appDirectory = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$executable = Join-Path $appDirectory 'EngeeAgent.exe'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw 'Распакуйте весь архив перед созданием ярлыка.' }
if (-not (Test-Path -LiteralPath $DesktopDirectory -PathType Container)) { throw 'Папка рабочего стола не найдена.' }
$shortcutPath = Join-Path $DesktopDirectory 'Engee Agent.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $executable
$shortcut.WorkingDirectory = $appDirectory
$shortcut.Arguments = ''
$shortcut.IconLocation = $executable + ',0'
$shortcut.Description = 'Запустить Engee Agent'
$shortcut.Save()
$saved = $shell.CreateShortcut($shortcutPath)
if ($saved.TargetPath -ne $executable -or $saved.WorkingDirectory -ne $appDirectory -or $saved.IconLocation -ne ($executable + ',0')) { throw 'Не удалось сохранить ярлык.' }
Write-Output ('Ярлык Engee Agent создан: ' + $shortcutPath)
