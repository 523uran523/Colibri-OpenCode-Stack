"""
Шаблон настройки Julia окружения для запуска .ngscript в Engee.
Используется в EngeeNGScriptRunner.setup_environment()
"""

ENV_SETUP_TEMPLATE = """
using Engee
using Plots
using DataFrames
using LinearAlgebra
using Statistics
using Random
using CSV
using EngeeComms
using EngeeDSP

# Импорт базовых математических функций для избежания конфликтов имен
import Base.sin, Base.cos, Base.pi, Base.exp, Base.log, Base.sqrt, Base.abs

# Дополнительные импорты (добавляются при необходимости)
# using QuadGK
# using Unitful
# using DSP
# using FFTW

"environment ready"
"""

# Шаблон для установки недостающих пакетов
PKG_INSTALL_TEMPLATE = """
import Pkg

required_packages = ["%s"]
installed_now = String[]

for pkg in required_packages
    if Base.find_package(pkg) === nothing
        Pkg.add(pkg)
        push!(installed_now, pkg)
    end
end

using .required_packages...

string("packages-ready; installed=", isempty(installed_now) ? "none" : join(installed_now, ","))
"""

# Шаблон безопасного запуска скрипта
SAFE_RUN_TEMPLATE = """
try
    result = engee.script.run("%s"; isolate = %s)
    string("OK: ", sprint(show, result))
catch e
    string("ERROR: ", sprint(showerror, e, catch_backtrace()))
end
"""

# Шаблон загрузки и запуска модели
MODEL_RUN_TEMPLATE = """
try
    model = engee.load("%s")
    engee.open(model)
    results = engee.run(model)
    string("OK: model run completed, results type: ", typeof(results))
catch e
    string("ERROR: ", sprint(showerror, e, catch_backtrace()))
end
"""

# Шаблон получения логов
GET_LOGS_TEMPLATE = """
try
    logs = engee.get_logs()
    string("Logs: ", sprint(show, logs))
catch e
    string("ERROR getting logs: ", sprint(showerror, e, catch_backtrace()))
end
"""