// ────────────────────────────────────────────────────────────────────────────
// KIKU Print — puente de impresión térmica para el dashboard.
//
// Reemplazo directo de GG EZ Print: mismo protocolo (wss://IP:8443/ws,
// mensajes "list" y "print"), así el dashboard no necesita ningún cambio.
//
// La diferencia clave: el QR se imprime SIEMPRE como imagen (raster GS v 0),
// nunca con el comando QR nativo de la impresora — que es lo que falla según
// el modelo y firmware. Una imagen son píxeles: cualquier impresora ESC/POS
// la imprime.
// ────────────────────────────────────────────────────────────────────────────
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const version = "1.0.0"

// ── Configuración ────────────────────────────────────────────────────────────
type Config struct {
	Puerto    int    `json:"puerto"`
	Acentos   string `json:"acentos"`    // "cp858" (tildes reales) | "ascii" (a e i o u)
	UpdateURL string `json:"update_url"` // JSON de versión publicado por el dashboard
}

func cargarConfig(dir string) Config {
	cfg := Config{
		Puerto:    8443,
		Acentos:   "cp858",
		UpdateURL: "https://kiku-sushi-dashboard.vercel.app/descargas/kiku-print-version.json",
	}
	path := filepath.Join(dir, "config.json")
	if data, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(data, &cfg)
	} else {
		data, _ := json.MarshalIndent(cfg, "", "  ")
		_ = os.WriteFile(path, data, 0644)
	}
	if cfg.Puerto == 0 {
		cfg.Puerto = 8443
	}
	return cfg
}

// ── Mensajes del protocolo (idéntico a GG EZ Print) ──────────────────────────
type wsRequest struct {
	Action string `json:"action"`
	Data   struct {
		PrinterName string `json:"printer_name"`
		Type        string `json:"type"` // "USB" | "Network"
		Content     string `json:"content"`
		FontSize    int    `json:"font_size"`
		PaperWidth  int    `json:"paper_width"`
		QRCodeData  string `json:"qr_code_data"`
	} `json:"data"`
}

type printerEntry struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

var (
	upgrader = websocket.Upgrader{
		// El dashboard corre en otro origen (vercel.app): hay que aceptarlo.
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	// Un trabajo por vez: dos tickets a la misma impresora no se pisan.
	printMu sync.Mutex
	cfg     Config
)

// ── Impresión ────────────────────────────────────────────────────────────────
func imprimir(req wsRequest) error {
	datos, err := buildTicket(req.Data.Content, req.Data.FontSize, req.Data.PaperWidth, req.Data.QRCodeData, cfg.Acentos)
	if err != nil {
		return fmt.Errorf("armando el ticket: %w", err)
	}

	printMu.Lock()
	defer printMu.Unlock()

	tipo := strings.ToLower(strings.TrimSpace(req.Data.Type))
	var ultimo error
	for intento := 1; intento <= 2; intento++ {
		if tipo == "network" {
			ultimo = imprimirRed(req.Data.PrinterName, datos)
		} else {
			ultimo = imprimirWindows(req.Data.PrinterName, datos)
		}
		if ultimo == nil {
			return nil
		}
		log.Printf("  intento %d falló: %v", intento, ultimo)
		time.Sleep(700 * time.Millisecond)
	}
	return ultimo
}

// Impresora de red: bytes crudos al puerto 9100 (RAW estándar ESC/POS).
func imprimirRed(direccion string, datos []byte) error {
	addr := strings.TrimSpace(direccion)
	if !strings.Contains(addr, ":") {
		addr += ":9100"
	}
	conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
	if err != nil {
		return fmt.Errorf("no se pudo conectar a la impresora %s: %w", addr, err)
	}
	defer conn.Close()
	_ = conn.SetWriteDeadline(time.Now().Add(15 * time.Second))
	if _, err := conn.Write(datos); err != nil {
		return fmt.Errorf("error enviando a %s: %w", addr, err)
	}
	return nil
}

// ── WebSocket ────────────────────────────────────────────────────────────────
func atenderWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WS upgrade: %v", err)
		return
	}
	defer conn.Close()
	log.Printf("✓ Dashboard conectado desde %s", r.RemoteAddr)

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			log.Printf("Dashboard desconectado (%s)", r.RemoteAddr)
			return
		}
		var req wsRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			_ = conn.WriteJSON(map[string]string{"status": "error", "message": "mensaje inválido"})
			continue
		}

		switch req.Action {
		case "list":
			lista := listarImpresoras()
			log.Printf("→ list: %d impresora(s)", len(lista))
			_ = conn.WriteJSON(map[string]any{"type": "printer_list", "printers": lista})

		case "print":
			nombre := req.Data.PrinterName
			conQR := ""
			if req.Data.QRCodeData != "" {
				conQR = " + QR"
			}
			log.Printf("→ print [%s/%s]%s (%d caracteres)", nombre, req.Data.Type, conQR, len(req.Data.Content))
			if err := imprimir(req); err != nil {
				log.Printf("  ✘ ERROR: %v", err)
				_ = conn.WriteJSON(map[string]string{"status": "error", "message": err.Error()})
			} else {
				log.Printf("  ✔ impreso")
				_ = conn.WriteJSON(map[string]string{"status": "success"})
			}

		default:
			_ = conn.WriteJSON(map[string]string{"status": "error", "message": "acción desconocida: " + req.Action})
		}
	}
}

// Página de estado: sirve para verificar que el certificado quedó instalado
// (candado verde) y que el servicio corre.
func atenderStatus(w http.ResponseWriter, _ *http.Request) {
	lista := listarImpresoras()
	nombres := make([]string, 0, len(lista))
	for _, p := range lista {
		nombres = append(nombres, "· "+p.Name)
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, `<html><body style="font-family:sans-serif;background:#111;color:#eee;padding:40px">
<h1>🖨 KIKU Print v%s</h1>
<p style="color:#4ade80">Funcionando. Si ves el candado en la barra de direcciones, el certificado está bien instalado.</p>
<p>Impresoras de Windows detectadas:</p><pre>%s</pre>
<p style="color:#888">El dashboard se conecta solo. No hay nada más que hacer acá.</p>
</body></html>`, version, strings.Join(nombres, "\n"))
}

func ipsLocales() []string {
	var ips []string
	ifaces, _ := net.InterfaceAddrs()
	for _, a := range ifaces {
		if ipn, ok := a.(*net.IPNet); ok && !ipn.IP.IsLoopback() {
			if v4 := ipn.IP.To4(); v4 != nil {
				ips = append(ips, v4.String())
			}
		}
	}
	return ips
}

func main() {
	exe, _ := os.Executable()
	dir := filepath.Dir(exe)

	// Log a consola Y a archivo, para poder revisar qué pasó.
	logFile, err := os.OpenFile(filepath.Join(dir, "kiku-print.log"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err == nil {
		log.SetOutput(newDualWriter(os.Stdout, logFile))
	}

	cfg = cargarConfig(dir)

	// Auto-actualización: al arrancar, si hay versión nueva se instala y se
	// relanza ya actualizado. Después vigila cada 6 horas.
	limpiarViejo(exe)
	if actualizarSiHayNueva(exe) {
		relanzar(exe)
	}
	vigilarActualizaciones(exe)

	fmt.Printf(`
  ╔════════════════════════════════════════════╗
  ║   🖨  KIKU Print v%s                    ║
  ║   Puente de impresión del dashboard        ║
  ╚════════════════════════════════════════════╝

`, version)

	certPath, keyPath, err := prepararCertificados(dir)
	if err != nil {
		log.Fatalf("No se pudieron preparar los certificados: %v", err)
	}

	http.HandleFunc("/ws", atenderWS)
	http.HandleFunc("/", atenderStatus)

	addr := fmt.Sprintf(":%d", cfg.Puerto)
	for _, ip := range ipsLocales() {
		log.Printf("Escuchando en https://%s%s  (dashboard: usar %s como servidor de impresión)", ip, addr, ip)
	}
	log.Printf("Certificado para instalar: %s", filepath.Join(dir, "INSTALAR-ESTE-CERTIFICADO.crt"))

	if err := http.ListenAndServeTLS(addr, certPath, keyPath, nil); err != nil {
		log.Fatalf("No se pudo iniciar el servidor: %v", err)
	}
}

// dualWriter: escribe a consola y archivo a la vez.
type dualWriter struct{ a, b *os.File }

func newDualWriter(a, b *os.File) *dualWriter { return &dualWriter{a, b} }
func (d *dualWriter) Write(p []byte) (int, error) {
	_, _ = d.b.Write(p)
	return d.a.Write(p)
}
