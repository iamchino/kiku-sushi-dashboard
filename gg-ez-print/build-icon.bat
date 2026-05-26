@echo off
REM Alternative build script using goversioninfo (recommended)

echo ========================================
echo Building GG EZ Print (Alternative Method)
echo ========================================

REM Check if goversioninfo is installed
where goversioninfo >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Installing goversioninfo tool...
    go install github.com/josephspurrier/goversioninfo/cmd/goversioninfo@latest
)

echo.
echo Embedding icon and version information...
goversioninfo -icon=printerIcon.ico

if %ERRORLEVEL% EQU 0 (
    echo Version info embedded successfully!
    echo.
    echo Building executable with icon and version info...
    go build -ldflags -H=windowsgui -o gg-ez-print.exe

    if %ERRORLEVEL% EQU 0 (
        echo.
        echo ========================================
        echo Build complete!
        echo Executable: gg-ez-print.exe
        echo Publisher: Renzo Costarelli
        echo ========================================
    )
) else (
    echo Error: Could not embed version info
)

pause
