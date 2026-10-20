@echo off
chcp 65001 > nul
echo ========================================================
echo   Notion Web Collector (노션 웹 링크 수집기) 실행 중...
echo ========================================================
echo.
echo 웹 브라우저에서 http://localhost:3000 을 엽니다.
echo 종료하시려면 창을 닫거나 Ctrl+C 를 누르세요.
echo.

start "" "http://localhost:3000"
node server.js
pause
