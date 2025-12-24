@echo off
chcp 10000

:loop
start /wait /high node dist/app.js
echo Node exited, restarting...
timeout /t 2
goto loop