package main

// Subí este número en cada build que se instale en el local: es la única
// forma de saber qué versión corre (aparece en la consola al arrancar y en
// las propiedades del .exe). El bug del {{QR}} impreso como texto fue
// exactamente esto: un exe viejo con un fuente nuevo.
const appVersion = "1.1.0"


func main() {
	// Initialize console window management
	initConsole()

	// Run the application with system tray support
	runSystemTray()
}