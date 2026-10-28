@echo off
rem Existing environment overrides take priority. tools/ is optional and local.
if not defined NODE set "NODE=node"
if not defined PYTHON if exist "%~dp0tools\python-env\Scripts\python.exe" set "PYTHON=%~dp0tools\python-env\Scripts\python.exe"
if not defined PYTHON set "PYTHON=python"
if not defined PYTHONUTF8 set "PYTHONUTF8=1"
if not defined HB_FONT if exist "%~dp0tools\fonts\DejaVuSans.ttf" set "HB_FONT=%~dp0tools\fonts\DejaVuSans.ttf"
if not defined HB_FONT if exist "%WINDIR%\Fonts\arial.ttf" set "HB_FONT=%WINDIR%\Fonts\arial.ttf"
if not defined GLSLANG if exist "%~dp0tools\glslang\mingw64\bin\glslangValidator.exe" set "GLSLANG=%~dp0tools\glslang\mingw64\bin\glslangValidator.exe"
if not defined GLSLANG set "GLSLANG=glslangValidator"
if not defined SPIRV_VAL if exist "%~dp0tools\spirv-tools\mingw64\bin\spirv-val.exe" set "SPIRV_VAL=%~dp0tools\spirv-tools\mingw64\bin\spirv-val.exe"
if not defined SPIRV_VAL set "SPIRV_VAL=spirv-val"
