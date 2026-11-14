#!/usr/bin/env python3
"""
CLI для запуска .ngscript файлов в Engee.
"""

import sys
import argparse
from pathlib import Path

# Добавляем runner в путь
SKILL_DIR = Path(__file__).parent
sys.path.insert(0, str(SKILL_DIR))

from runner import EngeeNGScriptRunner


def cmd_run(args):
    """Запуск одного скрипта."""
    runner = EngeeNGScriptRunner()
    result = runner.run_script_safe(
        args.script_path,
        isolate=args.isolate,
        timeout=args.timeout
    )
    
    if result["success"]:
        print(f"✅ SUCCESS: {result['result']}")
        sys.exit(0)
    else:
        print(f"❌ ERROR: {result['error']}")
        sys.exit(1)


def cmd_run_all(args):
    """Запуск нескольких скриптов."""
    runner = EngeeNGScriptRunner()
    
    # Формируем список путей
    if args.scripts:
        scripts = args.scripts
    else:
        # По умолчанию все ngcm_*.ngscript в MBD-CM
        base = "/user/my_projects/Courses/MBD-CM/"
        scripts = [f"{base}ngcm_{i}.ngscript" for i in range(1, 7)]
    
    results = runner.run_multiple(
        scripts,
        isolate=args.isolate,
        timeout=args.timeout,
        delay=args.delay
    )
    
    # Вывод сводки
    print("\n" + "="*50)
    print("SUMMARY")
    print("="*50)
    for r in results:
        status = "✅" if r["success"] else "❌"
        name = Path(r["script"]).name
        print(f"  {status} {name}")
        if not r["success"]:
            print(f"      Error: {r['error'][:200]}...")
    
    failed = sum(1 for r in results if not r["success"])
    sys.exit(1 if failed else 0)


def cmd_fix_csv(args):
    """Исправление путей To CSV в модели."""
    runner = EngeeNGScriptRunner()
    
    result = runner.fix_to_csv_paths(
        args.model_name,
        args.base_path,
        args.files
    )
    
    print(json.dumps(result, indent=2, ensure_ascii=False))
    
    if "_save" in result:
        print(f"\n✅ Model saved: {args.base_path}{args.model_name}.engee")


def cmd_debug(args):
    """Диагностика модели."""
    runner = EngeeNGScriptRunner()
    runner.setup_environment()
    
    # Загрузка модели
    print(f"Loading {args.model_path}...")
    model = runner.load_model(args.model_path)
    print(f"Model: {model}")
    
    # Открытие
    model_name = Path(args.model_path).stem
    print(f"Opening {model_name}...")
    runner.open_model(model_name)
    
    # Блоки
    print("Finding blocks...")
    blocks = runner.find_blocks()
    print(f"Blocks: {blocks}")
    
    # Логи
    print("Getting logs...")
    logs = runner.get_logs()
    print(f"Logs: {logs}")


def main():
    parser = argparse.ArgumentParser(
        description="Engee ngscript Runner CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Запуск одного скрипта
  python -m engee_ngscript_runner run /user/my_projects/Courses/MBD-CM/ngcm_1.ngscript
  
  # Запуск всех скриптов MBD-CM
  python -m engee_ngscript_runner run-all
  
  # Исправление путей To CSV (как для ngcm_6)
  python -m engee_ngscript_runner fix-csv ngcm6_MIB_5G /user/my_projects/Courses/MBD-CM/
  
  # Диагностика модели
  python -m engee_ngscript_runner debug /user/my_projects/Courses/MBD-CM/ngcm6_MIB_5G.engee
"""
    )
    
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # run
    p_run = subparsers.add_parser("run", help="Запуск одного .ngscript")
    p_run.add_argument("script_path", help="Путь к скрипту в runtime (начинается с /user/)")
    p_run.add_argument("--isolate", action="store_true", help="Изолированное выполнение")
    p_run.add_argument("--timeout", type=int, default=300, help="Таймаут в секундах")
    p_run.set_defaults(func=cmd_run)
    
    # run-all
    p_all = subparsers.add_parser("run-all", help="Запуск нескольких скриптов")
    p_all.add_argument("scripts", nargs="*", help="Список путей (по умолчанию все ngcm_1-6)")
    p_all.add_argument("--isolate", action="store_true", help="Изолированное выполнение")
    p_all.add_argument("--timeout", type=int, default=300, help="Таймаут в секундах")
    p_all.add_argument("--delay", type=float, default=2.0, help="Задержка между запусками")
    p_all.set_defaults(func=cmd_run_all)
    
    # fix-csv
    p_fix = subparsers.add_parser("fix-csv", help="Исправление путей To CSV в модели")
    p_fix.add_argument("model_name", help="Имя модели (например, ngcm6_MIB_5G)")
    p_fix.add_argument("base_path", help="Базовый путь для CSV файлов")
    p_fix.add_argument("--files", nargs="+", help="Список CSV файлов (по умолчанию стандартные 5)")
    p_fix.set_defaults(func=cmd_fix_csv)
    
    # debug
    p_dbg = subparsers.add_parser("debug", help="Диагностика модели")
    p_dbg.add_argument("model_path", help="Путь к .engee файлу")
    p_dbg.set_defaults(func=cmd_debug)
    
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()