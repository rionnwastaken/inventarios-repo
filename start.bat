@echo off
cd /d "%~dp0"

if exist "inventario-persianas\venv\Scripts\pythonw.exe" (
    start "" "inventario-persianas\venv\Scripts\pythonw.exe" run_app.py
) else (
    start "" pythonw run_app.py
)
