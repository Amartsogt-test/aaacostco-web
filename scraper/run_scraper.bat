@echo off
cd /d "%~dp0"
call .venv\Scripts\activate
python full_sync.py
