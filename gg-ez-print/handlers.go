package main

import (
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Global variables for tracking connection state
var (
	activeConnections    int
	connectionMutex      sync.Mutex
	connectionStatusChan = make(chan bool, 10)
)

// handleConnections manages WebSocket connections and messages
func handleConnections(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Error upgrade:", err)
		return
	}
	defer conn.Close()

	// Track connection state
	connectionMutex.Lock()
	wasZero := activeConnections == 0
	activeConnections++
	currentCount := activeConnections
	connectionMutex.Unlock()

	if wasZero {
		// Notify that we now have connections
		select {
		case connectionStatusChan <- true:
		default:
		}
	}

	logToConsole("Cliente conectado (total: %d)", currentCount)

	// Defer cleanup: decrement connection count
	defer func() {
		connectionMutex.Lock()
		activeConnections--
		nowZero := activeConnections == 0
		remaining := activeConnections
		connectionMutex.Unlock()

		logToConsole("Cliente desconectado (restantes: %d)", remaining)

		if nowZero {
			// Notify that we have no more connections
			select {
			case connectionStatusChan <- false:
			default:
			}
		}
	}()

	for {
		var msg WSMessage
		err := conn.ReadJSON(&msg)
		if err != nil {
			log.Println("Error de lectura / Desconectado")
			break
		}

		logToConsole("Acción recibida: %s", msg.Action)

		switch msg.Action {
		case "list":
			handleListPrinters(conn)
		case "print":
			handlePrint(conn, msg.Data)
		}
	}
}

// handleListPrinters sends the list of available printers to the client
func handleListPrinters(conn *websocket.Conn) {
	printers := getWindowsPrinters()
	logToConsole("Se encontraron %d impresoras", len(printers))

	conn.WriteJSON(map[string]interface{}{
		"type":     "printer_list",
		"printers": printers,
	})
}

// handlePrint processes a print job request
func handlePrint(conn *websocket.Conn, job PrintJob) {
	rawBytes := formatESCPOSTicket(job)
	var printErr error

	switch job.Type {
	case "Network":
		printErr = printToNetwork(job.PrinterName, rawBytes)
	default:
		printErr = printToUSB(job.PrinterName, rawBytes)
	}

	if printErr != nil {
		conn.WriteJSON(map[string]string{
			"status":  "error",
			"message": printErr.Error(),
		})
	} else {
		conn.WriteJSON(map[string]string{
			"status": "success",
		})
	}
}
