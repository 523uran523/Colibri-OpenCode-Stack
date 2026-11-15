# Сторонние компоненты

Пакет содержит неизменённые исполняемые файлы и модель из указанных источников. Лицензии поставщиков включены рядом с компонентами. Все компоненты собраны локально; их наличие в этой папке не означает публикацию проекта.

| Компонент | Версия и источник | Лицензия в пакете |
| --- | --- | --- |
| Node.js Windows x64 | 24.19.0; скопирован из bundled runtime; SHA256 совпадает с официальным [SHASUMS256.txt](https://nodejs.org/dist/v24.19.0/SHASUMS256.txt) | `resources/runtime/NODE-LICENSE.txt`; полный текст включает уведомления зависимостей. |
| llama.cpp CPU Windows x64 | [b11493](https://github.com/ggml-org/llama.cpp/releases/tag/b11493), commit 847f447c3; 0.6.0-dev | `resources/runtime/llama/LICENSE.txt` — MIT. |
| LLVM OpenMP | libomp.dll из того же официального llama.cpp архива | `resources/runtime/llama/LICENSE-LLVM-OpenMP`. |
| Microsoft Visual C++ V14 Runtime x64 | 14.51.36247.0; [официальный redistributable](https://aka.ms/vc14/vc_redist.x64.exe), подпись Microsoft проверена | `resources/runtime/MICROSOFT-VC-LICENSE.docx`; [лицензия Microsoft](https://aka.ms/VCRedistLicense). |
| Qwen2.5-0.5B-Instruct-GGUF Q4_K_M | [официальный репозиторий Qwen](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF); revision 9217f5db79a29953eb74d5343926648285ec7e67 | `resources/LLM/QWEN-LICENSE.txt` — Apache 2.0; `QWEN-MODEL-CARD.md`. |
| node-pty | 1.1.0; [Microsoft node-pty](https://github.com/microsoft/node-pty), официальный npm, Windows x64 N-API prebuild | `resources/runtime/node-pty/LICENSE`, `deps/winpty/LICENSE`, `MICROSOFT-TERMINAL-LICENSE.txt`. |
| xterm.js / addon-fit | 6.0.0 / 0.11.0; официальный npm `@xterm/xterm` и `@xterm/addon-fit` | MIT, `resources/web/public/vendor/xterm/`. |

Microsoft DLL размещены **локально** рядом с `node.exe` и `llama-server.exe`; установка компонентов в Windows не выполняется. Они нужны на чистом Windows ПК, где VC Runtime ещё не установлен. Universal CRT и системные Windows DLL использует ОС Windows 10/11. При обновлении пакета обновляйте DLL из официального runtime целиком, сохраняя лицензии.

Контрольные суммы исходных загрузок:

- Node `win-x64/node.exe`: `3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237`.
- llama.cpp ZIP: `2c003ae981c762acc50aea9a0f3b97b308e702ecb2f79132adc308bf8b57e64f` — совпадает с digest GitHub release asset.
- Microsoft VC redistributable: `843068991daaa1f73ad9f6239bce4d0f6a07a51f18c37ea2a867e9beca71295c`; цифровая подпись Microsoft Corporation действительна.
- Qwen GGUF: `74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db` — совпадает с LFS SHA256 официального Hugging Face репозитория.

Полные адреса и сведения сохранены в `resources/runtime/SOURCES.json`. Исходный C# запускателя — `resources/runtime/launcher/EngeeAgentLauncher.cs`. Пересобрать его можно штатным Windows .NET Framework compiler `csc.exe` с параметрами `/target:winexe /platform:anycpu /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll`. Конечному пользователю компиляция не нужна.

Для терминала используется системный Windows ConPTY. Native-файлы node-pty сохранены без изменений; в `lib/windowsPtyAgent.js` добавлено освобождение output-worker после выхода оболочки. Происхождение, контрольные суммы и эта локальная правка описаны в `resources/runtime/node-pty/BUNDLED-SOURCE.json`. Дополнительные компиляторы и пакетный менеджер для запуска терминала не нужны.
# Puter.js

Локальная копия SDK: `resources/web/public/vendor/puter.js`, получена 2026-10-08 с https://js.puter.com/v2/ . SHA256: `d7ab2d0dfc0ad6782b0b00be8d1d2297581b03d698b821903d45ef8c66c7651c`.

SDK README указывает Apache-2.0; исходный README, текст лицензии и NOTICE включены в ту же папку. Облачные запросы и авторизация требуют интернет-соединения с Puter.
