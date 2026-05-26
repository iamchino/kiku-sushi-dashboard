@echo off
REM Build script for GG EZ Print with embedded icon and version info

echo ========================================
echo Building GG EZ Print
echo ========================================

REM Check if goversioninfo is installed
where goversioninfo >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Installing goversioninfo tool...
    go install github.com/josephspurrier/goversioninfo/cmd/goversioninfo@latest
)

REM Generate version info and embed icon
echo.
echo Embedding icon and version information...
goversioninfo -icon=printerIcon.ico

if %ERRORLEVEL% EQU 0 (
    echo Version info embedded successfully!

    REM Build the executable
    echo.
    echo Building executable...
    go build -o gg-ez-print.exe

    if %ERRORLEVEL% EQU 0 (
        echo.
        echo ========================================
        echo Build complete!
        echo Executable: gg-ez-print.exe
        echo Publisher: Renzo Costarelli
        echo ========================================
    ) else (
        echo.
        echo Error during build
    )
) else (
    echo.
    echo Error embedding version info
)

pause
