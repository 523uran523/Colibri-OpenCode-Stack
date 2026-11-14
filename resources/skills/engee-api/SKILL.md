---
name: engee-api
description: "Используй этот skill, когда нужно работать с HTTP API Engee: проверить статус инстанса, запустить или остановить его, получить рабочий URL сервера, переключить текущую лицензию, получить версии/лимиты, а также выполнять команды через внешний программный интерфейс Engee (`/external/command/eval`) с использованием PAT или OAuth/JWT-токена."
---

# Engee API

> В переносимом Engee Agent подключение задаётся в разделе «Подключения». Проверяйте его инструментом engee_status. Токены из data/settings.json и .env не читаются моделью. Следующие примеры account API служат справкой; запуск кода выполняется только через подтверждённый engee_eval_file.

Когда skill активирован:

1. Считай, что основа интеграции описана в документации Engee:
   `https://engee.com/helpcenter/stable/ru/external-software/external-software-interface-for-engee.html`
2. Сначала прочитай `.env` в папке skill и используй `ENGEE_API_KEY` как PAT для обычных account/runtime запросов, если пользователь не дал другой токен.
3. Никогда не печатай токен целиком в ответе пользователю.
4. Если в `.env` есть `ENGEE_ACCOUNT_BASE_URL`, используй его вместо захардкоженного `https://engee.com`.
5. Если в `.env` есть `ENGEE_DEFAULT_REMOTE_DIR`, используй его как базовую папку для временных файлов в runtime Engee.
6. Если пользователь не указал версию Engee явно, и в `.env` есть `ENGEE_DEFAULT_VERSION`, используй её как версию по умолчанию при `engee/start`.
7. Если пользователь не указал timeout простоя явно, и в `.env` есть `ENGEE_DEFAULT_TIMEOUT`, используй его как timeout по умолчанию в минутах при `engee/start`.
8. Если выбранная версия недоступна для текущей лицензии или `engee/start` возвращает ошибку доступа к версии, попробуй один fallback на snapshot-версию по маске из `.env` `ENGEE_DEFAULT_VERSION_ERROR`.
9. Для переключения лицензии используй OAuth/JWT пользовательский токен, а не PAT: PAT может читать часть account API, но обычно получает `403` на `/account/api/profile/set-current-license`.

## Базовый workflow

1. Получи информацию об инстансе Engee через account API.
2. Если инстанс не запущен, запусти его через account API.
3. Возьми `url` из ответа `engee/info` и используй его как базовый адрес для дальнейших запросов.
4. Для выполнения кода в Engee используй `POST {url}/external/command/eval`.
5. Если задача связана с моделью, предпочитай маленькие проверяемые команды вместо одного длинного скрипта.

Если этот skill используется вместе с `engee-model-debug-physmod-electrical`, прямые команды через `/external/command/eval` являются основным pipeline для небольших отладочных изменений физической модели: добавление/удаление блоков, параметрирование, связывание линий, логирование, короткие прогоны, чтение логов и сохранение checkpoint. Переходи к `engee-model-development` и `.jl`-скрипту только когда изменение становится структурным или серия команд становится неэффективной: много блоков/линий, несколько подсистем, повторяемый rebuild, helper-функции, loops, таблицы параметров или необходимость хранить reusable patch.

Статус инстанса проверяй по полю `serverStatus` из ответа `engee/info`.

## Важный нюанс по `url`

`engee/info` может вернуть `url` в относительном виде, например:

```text
/prod/user/<server-name>/
```

В этом случае преврати его в абсолютный URL через account base URL, обычно:

```text
https://engee.com + <relative-url>
```

## Аутентификация

Используй заголовок:

```text
Authorization: Bearer <TOKEN>
```

Где `<TOKEN>` это либо PAT из `.env`, либо OAuth/JWT access token.

### PAT vs OAuth/JWT

- PAT (`ENGEE_API_KEY`) подходит для `engee/info`, `engee/version`, `engee/limits`, `engee/start`, `engee/stop` и runtime API, если текущая лицензия уже выбрана.
- OAuth/JWT пользовательский токен нужен для переключения лицензии через `/account/api/profile/set-current-license`.
- Access token живёт около 10 минут. Refresh token живёт около 30 дней.
- Для обновления UI/OAuth токенов используй `POST /account/api/keep-alive` с телом `{"refreshToken":"..."}`; в ответе ожидай `accessToken` и обычно `refreshToken`.
- Если доступны `ENGEE_USERNAME` и `ENGEE_PASSWORD`, можно получить пользовательские токены через `POST /account/api/login` с JSON `{"username":"...","password":"..."}`.
- Если выдан OAuth client, используй authorization-code flow: открыть `/account/authorize?...response_type=code...`, затем обменять `code` на токены через `POST /account/api/oauth2/token` с `application/x-www-form-urlencoded`.
- Не сохраняй и не копируй токены в дополнительные файлы без явной необходимости; если обновляешь `.env`, не печатай новые значения.

### Переключение лицензий

1. Получи пользовательский OAuth/JWT access token через login, keep-alive или OAuth authorization-code flow.
2. Получи список лицензий: `GET /account/api/profile/organisation?page=1&pageSize=100&expand=licenses`.
3. Найди нужный `masterLicense.id` и `organisationId` по номеру лицензии.
4. Выполни:

```http
POST /account/api/profile/set-current-license
Authorization: Bearer <OAUTH_OR_UI_ACCESS_TOKEN>
Content-Type: application/json

{"organisationId":"...","masterLicenseId":"..."}
```

5. Endpoint возвращает новый `accessToken`; используй его для дальнейших account API запросов в выбранном контексте лицензии.
6. Проверь переключение через `GET /account/api/engee/info`: номер активной лицензии находится в `profileOrganisationLicense.masterLicense.number`.

Не передавай `profileOrganisationLicenseId` вместо `masterLicenseId`: API вернёт ошибку вроде `profile_master_license_not_exists_error`.

## Bundled helper module

В skill вложен Python helper: `scripts/engee_oauth`.

Используй его, когда нужно надёжно обновлять токены, переключать лицензии, получать версии/лимиты, запускать и останавливать Engee. Чтобы импортировать helper из текущего проекта или из папки skill, добавь `scripts` в `PYTHONPATH`:

```python
import sys
from pathlib import Path

skill_dir = Path(".agents/skills/engee-api")
sys.path.insert(0, str(skill_dir / "scripts"))

from engee_oauth.account_client import EngeeAccountClient

client = EngeeAccountClient()
client.set_current_license("<LICENSE_NUMBER>")
info = client.get_engee_info()
print(info["profileOrganisationLicense"]["masterLicense"]["number"])
```

`EngeeAccountClient` читает `.env`, умеет логиниться по `ENGEE_USERNAME`/`ENGEE_PASSWORD`, использовать `ENGEE_UI_ACCESS_TOKEN`/`ENGEE_UI_REFRESH_TOKEN`, обновлять токены через `/account/api/keep-alive`, переключать лицензии и вызывать `engee/start`/`engee/stop`.

## Default-значения из `.env`

Используй следующие переменные, если они заданы:

- `ENGEE_DEFAULT_VERSION` — версия Engee по умолчанию, если пользователь не указал её явно.
- `ENGEE_DEFAULT_TIMEOUT` — timeout простоя по умолчанию в минутах, если пользователь не указал его явно.
- `ENGEE_DEFAULT_VERSION_ERROR` — маска fallback-версии, если целевая версия недоступна для текущей лицензии.
- `ENGEE_DEFAULT_VERSION_EROOR` — legacy-алиас для той же fallback-маски; поддерживай его для обратной совместимости.
- `ENGEE_USERNAME` и `ENGEE_PASSWORD` — пользовательский login flow для получения OAuth/JWT токенов, если они доступны.
- `ENGEE_UI_ACCESS_TOKEN` и `ENGEE_UI_REFRESH_TOKEN` — токены пользовательской UI/OAuth-сессии; используй для переключения лицензий и обновляй access token через `keep-alive`.

Если указаны и `ENGEE_DEFAULT_VERSION_ERROR`, и `ENGEE_DEFAULT_VERSION_EROOR`, предпочитай `ENGEE_DEFAULT_VERSION_ERROR`.

## Основные endpoint'ы

Используй account API на домене `https://engee.com`:

- `GET /account/api/engee/info` — получить статус из `serverStatus` и `url` инстанса
- `POST /account/api/engee/start` — запустить инстанс
- `DELETE /account/api/engee/stop` — остановить инстанс
- `GET /account/api/engee/version` — получить список доступных версий для текущей лицензии
- `GET /account/api/engee/limits` — получить список лимитов и их ID для текущей лицензии
- `GET /account/api/profile/organisation?expand=licenses&page=1&pageSize=100` — получить организации и доступные лицензии пользователя
- `POST /account/api/profile/set-current-license` — переключить текущую лицензию; требует OAuth/JWT пользовательский токен
- `POST /account/api/login` — получить пользовательские `accessToken`/`refreshToken` по username/password, если такой flow разрешён
- `POST /account/api/keep-alive` — обновить пользовательские токены по `refreshToken`
- `POST /account/api/oauth2/token` — обменять OAuth authorization code на `access_token`/`refresh_token`

Используй runtime API на `url`, возвращённом `engee/info`:

- `POST /external/command/eval` — выполнить команду Engee-кода
- `POST /external/command/jobs/create` — создать job на выполнение кода
- `GET /external/command/jobs/{job_id}/result` — получить результат job
- `POST /external/file/upload` — загрузить файл в runtime-файловую систему Engee
- `POST /external/file/download` — скачать файл из runtime-файловой системы Engee

## Предпочтительный workflow для выполнения кода

Если код короткий и одноразовый, можно использовать `eval`.

Если нужно:

- выполнить многострочный код;
- загрузить `.jl` и потом сделать `include(...)`;
- передать в Engee длинный скрипт без надёжного multipart upload;
- дождаться статуса завершения;
- потом скачать артефакт вроде `.engee`;

предпочитай job-based workflow:

1. `POST /external/command/jobs/create`
2. периодический `GET /external/command/jobs/{job_id}/result`
3. ждать `status == "DONE"`
4. проверять `result.type`

## Рекомендуемый способ вызова

Если работа идёт из PowerShell, предпочитай `Invoke-RestMethod`.

Шаблон для account API:

```powershell
$accountBase = if ($env:ENGEE_ACCOUNT_BASE_URL) { $env:ENGEE_ACCOUNT_BASE_URL.TrimEnd("/") } else { "https://engee.com" }
$headers = @{
  Authorization = "Bearer $token"
}

$info = Invoke-RestMethod `
  -Method Get `
  -Uri "$accountBase/account/api/engee/info" `
  -Headers $headers
```

Надёжный способ собрать `runtimeBase`:

```powershell
$runtimeBase = if ($info.url -match '^https?://') {
  $info.url.TrimEnd("/")
} else {
  [System.Uri]::new([System.Uri]$accountBase, $info.url).AbsoluteUri.TrimEnd("/")
}
```

Шаблон запуска:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "$accountBase/account/api/engee/start" `
  -Headers $headers
```

Шаблон запуска с версией и timeout:

```powershell
$versions = Invoke-RestMethod `
  -Method Get `
  -Uri "$accountBase/account/api/engee/version" `
  -Headers $headers

$limits = Invoke-RestMethod `
  -Method Get `
  -Uri "$accountBase/account/api/engee/limits" `
  -Headers $headers

$defaultVersionName = $env:ENGEE_DEFAULT_VERSION
$defaultTimeoutMinutes = if ($env:ENGEE_DEFAULT_TIMEOUT) { [int]$env:ENGEE_DEFAULT_TIMEOUT } else { $null }
$fallbackMask = if ($env:ENGEE_DEFAULT_VERSION_ERROR) { $env:ENGEE_DEFAULT_VERSION_ERROR } else { $env:ENGEE_DEFAULT_VERSION_EROOR }
$version = $versions.results | Where-Object { $_.name -eq $defaultVersionName } | Select-Object -First 1
if (-not $version -and $fallbackMask) {
  $version = $versions.results | Where-Object { $_.name -like $fallbackMask } | Select-Object -First 1
}
if (-not $version) {
  throw "Не удалось подобрать доступную версию Engee"
}

$payloadLimits = foreach ($item in $limits.results) {
  $use = $item.use
  if ($item.baseProduct.systemName -eq "timeout" -and $null -ne $defaultTimeoutMinutes) {
    $use = $defaultTimeoutMinutes
  }
  @{
    profileOrganisationLicenseLimitId = $item.id
    use = $use
  }
}

$body = @{
  versionId = $version.id
  limits = $payloadLimits
} | ConvertTo-Json -Depth 6

Invoke-RestMethod `
  -Method Post `
  -Uri "$accountBase/account/api/engee/start" `
  -Headers ($headers + @{ "Content-Type" = "application/json" }) `
  -Body $body
```

Шаблон остановки:

```powershell
Invoke-RestMethod `
  -Method Delete `
  -Uri "$accountBase/account/api/engee/stop" `
  -Headers $headers
```

Шаблон выполнения команды:

```powershell
$body = @{
  command = 'println("hello")'
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "$runtimeBase/external/command/eval" `
  -Headers ($headers + @{ "Content-Type" = "application/json" }) `
  -Body $body
```

Шаблон создания job:

```powershell
$jobId = [guid]::NewGuid().ToString()
$body = @{
  job_id = $jobId
  job_type = "EVAL"
  code = 'println("hello")'
  name = "Codex eval job"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "$runtimeBase/external/command/jobs/create" `
  -Headers ($headers + @{ "Content-Type" = "application/json" }) `
  -Body $body
```

Шаблон получения результата job:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "$runtimeBase/external/command/jobs/$jobId/result" `
  -Headers $headers
```

Шаблон загрузки файла:

```powershell
$uploadForm = @{
  paths = '{"sources":["/user/codex_tmp"]}'
  upload_files = Get-Item ".\\script.jl"
}

Invoke-RestMethod `
  -Method Post `
  -Uri "$runtimeBase/external/file/upload" `
  -Headers $headers `
  -Form $uploadForm
```

Если локальный PowerShell не поддерживает `Invoke-RestMethod -Form`, используй `curl.exe` для multipart upload:

```powershell
$pathsJson = '{"sources":["/user/codex_tmp/run_001"]}'
curl.exe -sS -X POST "$runtimeBase/external/file/upload" `
  -H "Authorization: Bearer $token" `
  -F "paths=$pathsJson" `
  -F "upload_files=@D:\path\to\script.jl;type=text/plain"
```

Если multipart upload нестабилен, можно вообще не использовать `external/file/upload`, а передать `.jl` как base64 и восстановить его уже внутри Engee:

```powershell
$scriptText = Get-Content -Raw .\script.jl
$scriptB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($scriptText))
$remoteDir = "/user/codex_tmp/run_001"
$code = @"
using Base64
mkpath("$remoteDir")
write("$remoteDir/script.jl", String(base64decode("$scriptB64")))
include("$remoteDir/script.jl")
"@
```

Дальше этот код отправляется через `jobs/create` или `eval`.

Шаблон скачивания файла или набора файлов:

```powershell
$downloadBody = '{"sources":["/user/maxim_sidorov/codex_test.engee","/user/maxim_sidorov/codex_test_gained_sinus.csv"]}'
curl.exe -sS -X POST "$runtimeBase/external/file/download" `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  --data $downloadBody `
  -o artifacts.zip
```

## Практические нюансы

- Для временных файлов удобно использовать директории вида `/user/...`.
- Хороший практический паттерн: создавать уникальную временную папку вида `/user/codex_tmp/<guid>` под каждый прогон.
- Для `engee/start` версия и timeout лучше собирать не вручную, а через `GET /engee/version` и `GET /engee/limits`, используя default-значения из `.env`, если пользователь их не переопределил.
- Не рассчитывай, что `ENGEE_DEFAULT_VERSION` всегда совпадёт с живым именем версии один в один: сначала попробуй точное совпадение, а при промахе один раз применяй fallback-маску из `ENGEE_DEFAULT_VERSION_ERROR`.
- Формат upload чувствителен: `paths` нужно передавать как JSON-строку.
- Для длинных сценариев удобнее загрузить `.jl` и выполнить `include(...)`, чем передавать весь код inline.
- После `jobs/create` не считай задачу завершённой, пока `result.status` не станет `DONE`.
- Успешный HTTP-ответ ещё не означает успешное выполнение Engee-кода: всегда проверяй `result.type`.
- В `eval`-окружении Engee захват `stdout` через `redirect_stdout(IOBuffer(...))` может падать с `MethodError`; для надёжного результата лучше возвращать явный статус строкой, например `string("saved=", isfile(...))`.
- `external/file/download` может вернуть заголовок `Content-Type: multipart/form-data`, но тело ответа при этом может уже быть сырыми байтами файла. Если MIME-разбор не даёт attachment, проверь, не является ли `response.content` уже содержимым файла.
- В этом окружении PowerShell `Invoke-RestMethod` может не поддерживать параметр `-Form`; для `external/file/upload` надёжнее использовать `curl.exe`.
- Даже при рабочем account API multipart upload через `curl.exe` может неожиданно отвечать `302 Moved Temporarily` с редиректом на `/account/`. Если это произошло, не зацикливайся на upload и переключайся на fallback через base64 + `eval` или `jobs/create`.
- Если через `external/file/download` запрашивать несколько файлов сразу, сервер удобно возвращает zip-архив; его можно локально распаковать через `Expand-Archive`.
- `jobs/create` с `include(".../script.jl")` часто возвращает `result.type == "success"` и `result.data.text == "nothing"`, потому что `include(...)` сам по себе ничего полезного не печатает. Если нужен осмысленный итог выполнения, после job полезно сделать отдельный короткий `eval`, например через `engee.get_results(...)`, `isfile(...)` или другой явный статусный запрос.
- При длинных `jobs/create`-сценариях локальный shell может отвалиться по timeout раньше, чем Engee закончит работу. В таких случаях не считай задачу потерянной: лучше отдельно poll-ить `.../jobs/{job_id}/result` более долгим циклом.
- Для диагностики после запуска модели полезно помнить сигнатуры Engee API внутри Julia: `engee.get_logs()` вызывается без имени модели, а `engee.run(...)` и `engee.get_results(...)` в реальном runtime могут вернуть объект `SimulationResult`, а не обычный `Dict`.
- Не предполагай, что результат симуляции уже сериализован в удобный JSON. Надёжный путь: сделать follow-up `eval`, который сам превращает нужные поля результата в строку, CSV или другой простой формат.

## Правила работы

- Всегда проверяй `engee/info` перед обращением к runtime API.
- Статус инстанса в `engee/info` смотри в поле `serverStatus`, а не в `status`.
- Не хардкодь runtime URL: бери его из ответа `engee/info`.
- Если инстанс не готов сразу после `start`, сделай короткий retry/poll по `engee/info`.
- Перед `engee/start`, если нужно управлять версией или timeout, сначала получи `engee/version` и `engee/limits`.
- Если пользователь не указал версию, подставь `ENGEE_DEFAULT_VERSION` из `.env`, если она есть.
- Если пользователь не указал timeout, подставь `ENGEE_DEFAULT_TIMEOUT` из `.env`, если он есть.
- Если целевая версия недоступна или точное совпадение по `ENGEE_DEFAULT_VERSION` не найдено, один раз попробуй fallback на snapshot по маске из `ENGEE_DEFAULT_VERSION_ERROR`.
- Под fallback `*-SH` понимай первую доступную текущей лицензии версию, имя которой заканчивается на `-SH`.
- Для остановки инстанса используй `DELETE /account/api/engee/stop`.
- Для многошаговых действий сначала выполни маленькую smoke-check команду через `eval`.
- Если пользователь просит только подготовить код, не выполняй запросы без необходимости.
- Если API-ответ содержит ошибку, покажи пользователю короткую диагностику: endpoint, HTTP-код, краткое тело ответа.

## Когда этого skill обычно достаточно

- Проверить, жив ли Engee-инстанс
- Запустить или остановить Engee
- Получить runtime URL
- Выполнить короткий фрагмент Engee-кода через HTTP API
- Автоматизировать создание или изменение модели через последовательность `eval`-команд

## Что помнить

- `engee-model-development` полезен для генерации самого Engee-кода модели.
- `engee-api` нужен, когда этот код надо доставить и выполнить через HTTP API Engee.
- Эти два skill хорошо сочетаются: один пишет команды, второй объясняет как отправить их в Engee.
- `engee-blocks` полезен, когда сначала нужно найти правильный блок, его `path`, `blockType`, параметры и локальную документацию, а уже потом собирать или модифицировать модель через API.
- Практический паттерн для задач по Engee такой: `engee-blocks` помогает выбрать строительные элементы модели, а `engee-api` помогает реально запустить код, выполнить сборку и скачать артефакты.
