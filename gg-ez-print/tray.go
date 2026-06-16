package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/getlantern/systray"
)

const serverPort = "8443"

// startServer starts the HTTPS/WSS server in a goroutine
func startServer() {
	http.HandleFunc("/ws", handleConnections)

	localIP := getLocalIP()
	certFile, keyFile := getCertPaths()

	if err := ensureCertificate(localIP); err != nil {
		log.Fatal("Error generando certificado TLS:", err)
	}

	caCertFile, _ := getCACertPaths()
	if err := ensureCATrusted(caCertFile); err != nil {
		logToConsole("ADVERTENCIA: No se pudo instalar la CA: %v", err)
	}

	addr := ":" + serverPort
	logToConsole("Servidor WebSocket seguro iniciado en wss://%s%s/ws", localIP, addr)

	if err := http.ListenAndServeTLS(addr, certFile, keyFile, nil); err != nil {
		log.Fatal("Error al iniciar el servidor:", err)
	}
}

// updateTrayIcon updates the system tray icon based on connection status
func updateTrayIcon(hasConnections bool) {
	if hasConnections {
		systray.SetIcon(loadGreenIcon())
		systray.SetTooltip("GG EZ Print - Clientes conectados")
	} else {
		systray.SetIcon(loadRedIcon())
		systray.SetTooltip("GG EZ Print - Sin conexiones")
	}
}

// getConnectionCount safely gets the current connection count
func getConnectionCount() int {
	connectionMutex.Lock()
	defer connectionMutex.Unlock()
	return activeConnections
}

// onReady is called when the system tray is ready
func onReady() {
	// Start with red icon (no connections initially)
	systray.SetIcon(loadRedIcon())
	systray.SetTitle("GG EZ Print")
	systray.SetTooltip("GG EZ Print - Sin conexiones")

	// Add menu items
	mStatus := systray.AddMenuItem("Conexiones: 0", "Número de clientes conectados")
	mStatus.Disable() // Make it non-clickable, just informational

	localIP := getLocalIP()
	serverAddr := fmt.Sprintf("Dirección: %s:%s", localIP, serverPort)
	mAddr := systray.AddMenuItem(serverAddr, "Dirección WSS del servidor")
	mAddr.Disable()

	certURL := fmt.Sprintf("Cert móvil: http://%s:%s", localIP, certServerPort)
	mCertURL := systray.AddMenuItem(certURL, "Abrí esta URL en el celu para instalar el certificado CA")
	mCertURL.Disable()

	mTrustCert := systray.AddMenuItem("Instalar certificado CA (esta PC)", "Instala la CA local en el almacén de confianza de Windows")

	systray.AddSeparator()

	mToggleConsole := systray.AddMenuItem(getConsoleMenuText(), "Mostrar/ocultar la consola")

	systray.AddSeparator()

	// Add startup toggle menu item
	mStartup := systray.AddMenuItem(getStartupMenuText(), "Iniciar automáticamente con Windows")

	mQuit := systray.AddMenuItem("Salir", "Cierra el servidor")

	// Start the web server in a separate goroutine
	go startServer()
	go startCertServer()

	// Monitor connection status changes
	go func() {
		for hasConnections := range connectionStatusChan {
			updateTrayIcon(hasConnections)

			// Update status menu item
			count := getConnectionCount()
			switch count {
			case 0:
				mStatus.SetTitle("Conexiones: 0")
			case 1:
				mStatus.SetTitle("Conexiones: 1")
			default:
				mStatus.SetTitle(fmt.Sprintf("Conexiones: %d", count))
			}
		}
	}()

	// Handle menu item clicks
	go func() {
		for {
			select {
			case <-mTrustCert.ClickedCh:
				caCertFile, _ := getCACertPaths()
				if err := installCATrust(caCertFile); err != nil {
					logToConsole("Error instalando CA: %v", err)
				} else {
					logToConsole("CA instalada correctamente")
				}
			case <-mToggleConsole.ClickedCh:
				if isConsoleVisible() {
					hideConsole()
				} else {
					showConsole()
				}
				mToggleConsole.SetTitle(getConsoleMenuText())
			case <-mStartup.ClickedCh:
				if err := toggleStartup(); err != nil {
					fmt.Printf("Error al cambiar configuración de inicio: %v\n", err)
				}
				// Update menu text to reflect new state
				mStartup.SetTitle(getStartupMenuText())
			case <-mQuit.ClickedCh:
				logToConsole("Cerrando servidor...")
				systray.Quit()
				return
			}
		}
	}()
}

// onExit is called when the system tray is about to quit
func onExit() {
	logToConsole("Servidor detenido")
}

// runSystemTray initializes and runs the system tray application
func runSystemTray() {
	systray.Run(onReady, onExit)
}

// getStartupMenuText returns the menu text with checkbox indicator
func getStartupMenuText() string {
	if isStartupEnabled() {
		return "✓ Iniciar con Windows"
	}
	return "   Iniciar con Windows"
}

// getConsoleMenuText returns the menu text for console toggle
func getConsoleMenuText() string {
	if isConsoleVisible() {
		return "Ocultar Consola"
	}
	return "Mostrar Consola"
}
