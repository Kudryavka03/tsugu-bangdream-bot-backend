chcp 65001
@echo off
:loop


wmic process where name="mongod.exe" CALL setpriority 128
echo ===== 预测开始 =====
del /f /q ycx500-3.json
del /f /q temp.json
python.exe Output500.py
del /f /q ycx1000-3.json
del /f /q temp.json
python.exe Output1000.py
del /f /q ycx2000-3.json
del /f /q temp.json
python.exe Output2000.py
echo ===== 预测结束，等5min继续预测 =====

timeout /t 300 /nobreak >nul

goto loop
