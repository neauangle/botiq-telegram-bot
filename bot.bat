@echo off
if not exist "node_modules" (
	echo Running for the first time- installing dependencies...
    CALL npm install
	echo: 
)
echo Running script...
CALL node index.js
set /p Input=