package main

func main() {
	// Initialize console window management
	initConsole()

	// Limpiar binario viejo si venimos de una auto-actualización previa.
	cleanupOldBinary()

	// Run the application with system tray support
	runSystemTray()
}