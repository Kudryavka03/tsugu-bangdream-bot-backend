@echo off
chcp 10000
set "SKIA_CANVAS_THREADS=2"

:loop

start /wait /abovenormal  node dist/boot.js
echo Node exited, restarting...
timeout /t 2
goto loop