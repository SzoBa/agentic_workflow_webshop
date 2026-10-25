@echo off
rem A start.sh inditasa Windows terminalbol (PowerShell / cmd).
rem
rem Hasznalat:  start.cmd [kapcsolok]   - a kapcsolok valtozatlanul mennek tovabb,
rem                                       sugo:  start.cmd --help
rem
rem Miert kell wrapper: a start.sh bash szkript, amit Windowson a Git Bash futtat.
rem A PATH-on levo "bash" ilyenkor NEM jo: az a C:\Windows\System32\bash.exe, ami a
rem WSL-t inditja - mas PATH, mas fajlrendszer, nincs ott a Windows-os mvn/npm/docker.
rem Ezert a Git telepiteshez tartozo bash.exe-t keressuk meg celzottan.
rem
rem Ez a fajl szandekosan ekezet nelkuli es CRLF sorvegu: a cmd.exe a batch fajlt az
rem OEM kodlappal olvassa, az UTF-8 ekezetek es az LF sorvegek megtorik a parsolast.

setlocal

set "PF=%ProgramFiles%"
set "PF86=%ProgramFiles(x86)%"
set "LAD=%LOCALAPPDATA%"

set "GITBASH="
for %%D in ("%PF%\Git\bin\bash.exe" "%PF86%\Git\bin\bash.exe" "%LAD%\Programs\Git\bin\bash.exe") do (
  if not defined GITBASH if exist "%%~D" set "GITBASH=%%~D"
)

rem Nem szokvanyos helyre telepitett Git: a git.exe mellol kovetkeztetunk vissza.
if not defined GITBASH (
  for /f "delims=" %%G in ('where git 2^>nul') do (
    if not defined GITBASH if exist "%%~dpG..\bin\bash.exe" set "GITBASH=%%~dpG..\bin\bash.exe"
  )
)

if not defined GITBASH (
  echo [hiba]  A Git Bash ^(bash.exe^) nem talalhato.>&2
  echo         Telepitsd a Git for Windowst ^(https://git-scm.com/download/win^),>&2
  echo         vagy futtasd a szkriptet kozvetlenul Git Bashbol:  ./start.sh>&2
  exit /b 1
)

rem A repo gyokerebol futunk, hogy a start.sh relativ utvonalai stimmeljenek.
cd /d "%~dp0"

"%GITBASH%" start.sh %*
exit /b %ERRORLEVEL%
