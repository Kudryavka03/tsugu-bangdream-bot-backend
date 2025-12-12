chcp 65001
@echo off
:loop



echo ===== 预测开始 =====
del /f /q ycx500-3.json
python Output500.py
del /f /q ycx1000-3.json
python Output1000.py
del /f /q ycx2000-3.json
python Output2000.py
echo ===== 预测结束，等5min继续预测 =====

timeout /t 300 /nobreak >nul

goto loop