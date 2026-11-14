"""
Engee ngscript Runner — удобный класс для запуска .ngscript файлов в Engee.
"""

import sys
import os
import json
import time
import urllib.request
from pathlib import Path
from typing import Optional, List, Dict, Any

# Добавляем путь к engee-oauth
ENGE_API_SKILL = Path(r"C:\Users\523ur\Documents\MyProjects\Engee_prj\Skills\engee-api")
sys.path.insert(0, str(ENGE_API_SKILL / "scripts"))

from engee_oauth.account_client import EngeeAccountClient


class EngeeNGScriptRunner:
    """Класс для запуска .ngscript файлов через Engee HTTP API."""
    
    def __init__(
        self,
        env_path: Optional[str] = None,
        runtime_base: Optional[str] = None,
        auto_login: bool = True
    ):
        """
        Args:
            env_path: Путь к .env файлу (по умолчанию ищет в Engee_prj)
            runtime_base: Runtime URL (если None — получает из engee/info)
            auto_login: Автоматически логиниться при инициализации
        """
        self.env_path = env_path or str(Path(r"C:\Users\523ur\Documents\MyProjects\Engee_prj") / ".env")
        self._runtime_base = runtime_base
        self.client: Optional[EngeeAccountClient] = None
        
        if auto_login:
            self.connect()
    
    def connect(self) -> "EngeeNGScriptRunner":
        """Подключается к Engee и получает runtime URL."""
        self.client = EngeeAccountClient()
        self.client.auth.authorize()
        
        if not self._runtime_base:
            info = self.client.get_engee_info()
            account_base = self.client.auth.base_url
            runtime_url = info.get('url')
            from urllib.parse import urljoin
            self._runtime_base = urljoin(account_base + '/', runtime_url.lstrip('/')).rstrip('/')
        
        return self
    
    @property
    def runtime_base(self) -> str:
        if not self._runtime_base:
            raise RuntimeError("Runtime base not set. Call connect() first.")
        return self._runtime_base
    
    def _headers(self, json_body: bool = True) -> Dict[str, str]:
        """Формирует заголовки с авторизацией."""
        headers = self.client._headers(json_body=json_body)
        headers.update(self.client.auth.get_headers())
        return headers
    
    def eval(
        self,
        command: str,
        timeout: int = 180,
        return_raw: bool = False
    ) -> Any:
        """
        Выполняет команду в Engee runtime.
        
        Args:
            command: Julia код для выполнения
            timeout: Таймаут в секундах
            return_raw: Вернуть сырой ответ вместо result
            
        Returns:
            Результат выполнения (поле result из ответа)
        """
        body = json.dumps({'command': command}).encode('utf-8')
        req = urllib.request.Request(
            f"{self.runtime_base}/external/command/eval",
            data=body,
            method='POST',
            headers=self._headers(json_body=True)
        )
        
        with urllib.request.urlopen(req, timeout=timeout) as response:
            text = response.read().decode('utf-8')
            data = json.loads(text) if text else {}
            
        if return_raw:
            return data
        
        return data.get('result')
    
    def setup_environment(
        self,
        extra_imports: Optional[List[str]] = None,
        timeout: int = 120
    ) -> str:
        """
        Настраивает Julia окружение с необходимыми импортами.
        
        Args:
            extra_imports: Дополнительные пакеты для импорта
            timeout: Таймаут выполнения
            
        Returns:
            Результат выполнения (обычно "imports done")
        """
        base_imports = [
            "Engee",
            "Plots",
            "DataFrames",
            "LinearAlgebra",
            "Statistics",
            "Random",
            "CSV",
            "EngeeComms",
            "EngeeDSP",
        ]
        
        if extra_imports:
            base_imports.extend(extra_imports)
        
        # Импорты базовых функций для избежания конфликтов имен
        base_funcs = "import Base.sin, Base.cos, Base.pi, Base.exp, Base.log, Base.sqrt"
        
        imports_code = f"""
using {", ".join(base_imports)}
{base_funcs}
"imports done"
"""
        return self.eval(imports_code.strip(), timeout=timeout)
    
    def run_script(
        self,
        script_path: str,
        isolate: bool = False,
        timeout: int = 300,
        setup_env: bool = True,
        extra_imports: Optional[List[str]] = None
    ) -> Any:
        """
        Запускает .ngscript файл через engee.script.run.
        
        Args:
            script_path: Путь к .ngscript в runtime Engee (начинается с /user/)
            isolate: Изолированное выполнение (True) или общее окружение (False)
            timeout: Таймаут выполнения в секундах
            setup_env: Автоматически настроить окружение перед запуском
            extra_imports: Дополнительные импорты для окружения
            
        Returns:
            Результат выполнения скрипта
        """
        if setup_env:
            self.setup_environment(extra_imports)
        
        command = f'engee.script.run("{script_path}"; isolate = {str(isolate).lower()})'
        return self.eval(command, timeout=timeout)
    
    def run_script_safe(
        self,
        script_path: str,
        isolate: bool = False,
        timeout: int = 300,
        setup_env: bool = True,
        extra_imports: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Безопасный запуск с перехватом ошибок.
        
        Returns:
            Dict с ключами: success (bool), result (Any), error (str или None)
        """
        if setup_env:
            self.setup_environment(extra_imports)
        
        command = f'''
try
    result = engee.script.run("{script_path}"; isolate = {str(isolate).lower()})
    string("OK: ", sprint(show, result))
catch e
    string("ERROR: ", sprint(showerror, e, catch_backtrace()))
end
'''
        result = self.eval(command, timeout=timeout)
        
        if isinstance(result, str):
            if result.startswith("OK: "):
                return {"success": True, "result": result[4:], "error": None}
            elif result.startswith("ERROR: "):
                return {"success": False, "result": None, "error": result[7:]}
        
        return {"success": True, "result": result, "error": None}
    
    def run_multiple(
        self,
        script_paths: List[str],
        isolate: bool = False,
        timeout: int = 300,
        delay: float = 2.0,
        setup_env: bool = True,
        extra_imports: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Запускает несколько скриптов последовательно.
        
        Returns:
            Список результатов для каждого скрипта
        """
        results = []
        for i, path in enumerate(script_paths):
            print(f"\n[{i+1}/{len(script_paths)}] Running {path}...")
            
            # Настраиваем окружение только для первого скрипта
            env = setup_env and (i == 0)
            result = self.run_script_safe(path, isolate, timeout, env, extra_imports)
            results.append({"script": path, **result})
            
            status = "✅" if result["success"] else "❌"
            print(f"  {status} {result.get('error') or result.get('result')}")
            
            if delay and i < len(script_paths) - 1:
                time.sleep(delay)
        
        return results
    
    def load_model(self, model_path: str) -> Any:
        """Загружает модель .engee"""
        return self.eval(f'engee.load("{model_path}")')
    
    def open_model(self, model_name: str) -> Any:
        """Открывает модель"""
        return self.eval(f'engee.open("{model_name}")')
    
    def run_model(self, model_name: str) -> Any:
        """Запускает симуляцию модели"""
        return self.eval(f'engee.run("{model_name}")')
    
    def get_logs(self) -> Any:
        """Получает логи симуляции"""
        return self.eval('engee.get_logs()')
    
    def get_param(self, block_path: str, param: Optional[str] = None) -> Any:
        """Получает параметр блока или модели"""
        if param:
            return self.eval(f'engee.get_param("{block_path}", "{param}")')
        return self.eval(f'engee.get_param("{block_path}")')
    
    def set_param(self, block_path: str, **params) -> Any:
        """Устанавливает параметры блока"""
        pairs = ", ".join(f'"{k}" => {json.dumps(v)}' for k, v in params.items())
        return self.eval(f'engee.set_param!("{block_path}", {pairs})')
    
    def save_model(self, model_name: str, save_path: str, force: bool = True) -> Any:
        """Сохраняет модель"""
        force_str = "true" if force else "false"
        return self.eval(f'engee.save("{model_name}", "{save_path}"; force={force_str})')
    
    def find_blocks(self, system: Optional[str] = None, **blockparams) -> Any:
        """Находит блоки в системе"""
        sys_arg = f'"{system}"' if system else "engee.gcs()"
        if blockparams:
            # blockparams должен быть Vector{Pair{String, String}}
            pairs = "; ".join(f'"{k}" => "{v}"' for k, v in blockparams.items())
            return self.eval(f'engee.find_system({sys_arg}; blockparams = [{pairs}])')
        return self.eval(f'engee.find_system({sys_arg})')
    
    def fix_to_csv_paths(
        self,
        model_name: str,
        new_base_path: str,
        csv_files: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Исправляет пути FileName в блоках To CSV модели.
        
        Args:
            model_name: Имя модели (например, "ngcm6_MIB_5G")
            new_base_path: Новый базовый путь (например, "/user/my_projects/Courses/MBD-CM/")
            csv_files: Список имен файлов (если None — использует стандартные)
            
        Returns:
            Результаты обновления для каждого блока
        """
        if csv_files is None:
            csv_files = ["NID.csv", "Frequency_offset.csv", "SSS_search.csv", "Waveform.csv", "MIB.csv"]
        
        # Находим все To CSV блоки
        blocks_result = self.find_blocks(f"{model_name}", BlockType="ToCsv")
        
        if not isinstance(blocks_result, list):
            return {"error": "Failed to find To CSV blocks", "blocks": blocks_result}
        
        results = {}
        for i, (block_path, filename) in enumerate(zip(blocks_result, csv_files)):
            new_path = new_base_path.rstrip('/') + '/' + filename
            result = self.set_param(block_path, FileName=new_path)
            results[block_path] = {"success": True, "new_path": new_path, "result": result}
        
        # Сохраняем модель
        save_result = self.save_model(model_name, f"{new_base_path.rstrip('/')}/{model_name}.engee")
        results["_save"] = save_result
        
        return results


# Удобная функция для быстрого запуска
def quick_run(script_path: str, **kwargs) -> Any:
    """Быстрый запуск одного скрипта с настройкой окружения по умолчанию."""
    runner = EngeeNGScriptRunner()
    return runner.run_script(script_path, **kwargs)


def quick_run_all(script_dir: str, pattern: str = "*.ngscript", **kwargs) -> List[Dict[str, Any]]:
    """Быстрый запуск всех скриптов в директории."""
    # Здесь нужно реализовать получение списка файлов через eval
    # Пока возвращаем заглушку
    raise NotImplementedError("Use runner.run_multiple with explicit paths")


if __name__ == "__main__":
    # Пример использования
    runner = EngeeNGScriptRunner()
    
    # Настройка окружения
    runner.setup_environment()
    
    # Запуск одного скрипта
    result = runner.run_script_safe("/user/my_projects/Courses/MBD-CM/ngcm_1.ngscript")
    print(f"ngcm_1: {result}")
    
    # Запуск нескольких
    scripts = [
        "/user/my_projects/Courses/MBD-CM/ngcm_1.ngscript",
        "/user/my_projects/Courses/MBD-CM/ngcm_2.ngscript",
        "/user/my_projects/Courses/MBD-CM/ngcm_4.ngscript",
        "/user/my_projects/Courses/MBD-CM/ngcm_5.ngscript",
        "/user/my_projects/Courses/MBD-CM/ngcm_6.ngscript",
    ]
    results = runner.run_multiple(scripts)
    for r in results:
        print(f"{r['script']}: {'OK' if r['success'] else 'FAIL'}")