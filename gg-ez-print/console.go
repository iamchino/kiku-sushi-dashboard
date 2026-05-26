//go:build windows

package main

import (
	"fmt"
	"syscall"
	"time"
)

// Constants for ShowWindow
const (
	SW_HIDE    = 0
	SW_RESTORE = 9

	CTRL_CLOSE_EVENT = 2
)

var (
	kernel32                  = syscall.NewLazyDLL("kernel32.dll")
	user32                    = syscall.NewLazyDLL("user32.dll")
	procGetConsoleWindow      = kernel32.NewProc("GetConsoleWindow")
	procShowWindow            = user32.NewProc("ShowWindow")
	procIsWindowVisible       = user32.NewProc("IsWindowVisible")
	procSetConsoleCtrlHandler = kernel32.NewProc("SetConsoleCtrlHandler")

	consoleWindow syscall.Handle
)

// initConsole sets up console window management
func initConsole() {
	consoleWindow = getConsoleWindow()
	if consoleWindow == 0 {
		logToConsole("ADVERTENCIA: No se encontró ventana de consola")
		return
	}

	// Set up close handler
	setConsoleCloseHandler()

	// Log startup banner
	logToConsole("===========================================")
	logToConsole("GG EZ Print - Servidor de Impresión")
	logToConsole("===========================================")
	logToConsole("Ventana de consola inicializada")
}

// getConsoleWindow retrieves the console window handle
func getConsoleWindow() syscall.Handle {
	ret, _, _ := procGetConsoleWindow.Call()
	return syscall.Handle(ret)
}

// showConsole makes the console window visible
func showConsole() {
	if consoleWindow == 0 {
		return
	}
	procShowWindow.Call(uintptr(consoleWindow), SW_RESTORE)
	logToConsole("Consola mostrada")
}

// hideConsole hides the console window
func hideConsole() {
	if consoleWindow == 0 {
		return
	}
	logToConsole("Consola oculta (la aplicación sigue ejecutándose en la bandeja)")
	procShowWindow.Call(uintptr(consoleWindow), SW_HIDE)
}

// isConsoleVisible checks if console is currently visible
func isConsoleVisible() bool {
	if consoleWindow == 0 {
		return false
	}
	ret, _, _ := procIsWindowVisible.Call(uintptr(consoleWindow))
	return ret != 0
}

// consoleCtrlHandler handles console control events
func consoleCtrlHandler(ctrlType uint32) uintptr {
	switch ctrlType {
	case CTRL_CLOSE_EVENT:
		// User clicked X button - hide instead of closing
		hideConsole()
		return 1 // Return TRUE to prevent termination
	}
	return 0
}

// setConsoleCloseHandler installs the console event handler
func setConsoleCloseHandler() {
	callback := syscall.NewCallback(consoleCtrlHandler)
	procSetConsoleCtrlHandler.Call(callback, 1)
}

// logToConsole prints a timestamped message to console
func logToConsole(format string, args ...interface{}) {
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	message := fmt.Sprintf(format, args...)
	fmt.Printf("[%s] %s\n", timestamp, message)
}
