"""
Engee ngscript Runner — пакет для запуска .ngscript файлов в Engee.
"""

from .runner import EngeeNGScriptRunner, quick_run, quick_run_all

__version__ = "1.0.0"
__all__ = ["EngeeNGScriptRunner", "quick_run", "quick_run_all"]