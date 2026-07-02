package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net"
	"os/exec"
	"syscall"
	"time"

	"github.com/alexbrainman/printer"
)

// getWindowsPrinters retrieves a list of printers available on Windows
func getWindowsPrinters() []PrinterInfo {
	// Execute PowerShell to get printer names (no window using CREATE_NO_WINDOW flag)
	cmd := exec.Command("powershell", "-Command", "Get-Printer | Select-Object Name | ConvertTo-Json")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}
	var out bytes.Buffer
	cmd.Stdout = &out
	err := cmd.Run()

	var list []PrinterInfo
	if err != nil {
		fmt.Println("Error executing PowerShell:", err)
		return list
	}

	// PowerShell can return a single object or an array
	// Try to decode as array first
	var raw []map[string]interface{}
	if err := json.Unmarshal(out.Bytes(), &raw); err != nil {
		// If it fails, try to decode as a single object
		var single map[string]interface{}
		if err := json.Unmarshal(out.Bytes(), &single); err == nil {
			if name, ok := single["Name"].(string); ok {
				list = append(list, PrinterInfo{Name: name, Type: "USB"})
			}
		}
	} else {
		for _, p := range raw {
			if name, ok := p["Name"].(string); ok {
				list = append(list, PrinterInfo{Name: name, Type: "USB"})
			}
		}
	}
	return list
}

// formatESCPOSTicket converts a print job to ESC/POS commands
func formatESCPOSTicket(job PrintJob) []byte {
	var b bytes.Buffer
	b.Write([]byte{0x1B, 0x40}) // Init printer

	// Set font size
	var sizeByte byte
	switch job.FontSize {
	case 2:
		sizeByte = 0x11
	case 3:
		sizeByte = 0x22
	default:
		sizeByte = 0x00
	}
	b.Write([]byte{0x1D, 0x21, sizeByte})

	// Manejo del QR. Reglas de oro:
	//  1) NUNCA imprimir el marcador {{QR}} como texto crudo, aunque el QR
	//     falle o no lleguen datos (evita el bug de que salga "{{QR}}").
	//  2) Si vino qr_code_data y se pudo generar el raster, se inserta en la
	//     posición del marcador {{QR}} (o al final del ticket si no hay marcador).
	content := []byte(job.Content)
	marker := []byte("{{QR}}")

	var qrBytes []byte
	if job.QRCodeData != "" {
		gen, err := generateQRRaster(job.QRCodeData, 4)
		if err != nil {
			preview := job.QRCodeData
			if len(preview) > 120 {
				preview = preview[:120]
			}
			logToConsole("ERROR: No se pudo generar QR (len=%d): %v | data=%q", len(job.QRCodeData), err, preview)
		} else {
			qrBytes = gen
			logToConsole("QR generado OK (datos len=%d)", len(job.QRCodeData))
		}
	} else if bytes.Contains(content, marker) {
		logToConsole("ADVERTENCIA: el ticket tiene {{QR}} pero NO llegó qr_code_data (cliente desactualizado). Se quita el marcador.")
	}

	if idx := bytes.Index(content, marker); idx >= 0 {
		// Insertar el QR (si hay) donde estaba el marcador y limpiar cualquier
		// marcador extra que pudiera quedar en el resto del contenido.
		b.Write(content[:idx])
		if qrBytes != nil {
			b.Write(qrBytes)
		}
		b.Write(bytes.ReplaceAll(content[idx+len(marker):], marker, nil))
	} else {
		b.Write(content)
		if qrBytes != nil {
			b.Write([]byte{'\n'})
			b.Write(qrBytes)
		}
	}
	b.WriteByte('\n')

	// Feed and cut paper
	b.Write([]byte{0x1B, 0x64, 0x03}) // Feed 3 lines
	b.Write([]byte{0x1D, 0x56, 0x00}) // Cut paper

	return b.Bytes()
}

// printToUSB sends raw data to a USB/system printer
func printToUSB(printerName string, rawData []byte) error {
	logToConsole("Intentando imprimir en impresora USB '%s'", printerName)

	p, err := printer.Open(printerName)
	if err != nil {
		logToConsole("ERROR: Falló al abrir impresora USB '%s': %v", printerName, err)
		return err
	}
	defer p.Close()

	err = p.StartDocument("Ticket", "RAW")
	if err != nil {
		logToConsole("ERROR: Falló al iniciar documento en impresora USB '%s': %v", printerName, err)
		return err
	}
	defer p.EndDocument()

	_, err = p.Write(rawData)
	if err != nil {
		logToConsole("ERROR: Falló al escribir en impresora USB '%s': %v", printerName, err)
		return err
	}

	logToConsole("ÉXITO: Impreso en impresora USB '%s'", printerName)
	return nil
}

// printToNetwork sends raw data to a network printer via TCP
func printToNetwork(ip string, rawData []byte) error {
	logToConsole("Intentando imprimir en impresora de red '%s'", ip)

	conn, err := net.DialTimeout("tcp", ip+":9100", 3*time.Second)
	if err != nil {
		logToConsole("ERROR: Falló al conectar con impresora de red '%s': %v", ip, err)
		return err
	}
	defer conn.Close()

	_, err = conn.Write(rawData)
	if err != nil {
		logToConsole("ERROR: Falló al escribir en impresora de red '%s': %v", ip, err)
		return err
	}

	logToConsole("ÉXITO: Impreso en impresora de red '%s'", ip)
	return nil
}
