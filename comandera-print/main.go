// ────────────────────────────────────────────────────────────────────────────
// Comandera Print — puente de impresión térmica para el dashboard.
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
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const version = "1.0.10"

// Ruta del certificado exportado (se completa en main).
var certCrtPath string

// ── Configuración ────────────────────────────────────────────────────────────
type Config struct {
	Puerto    int    `json:"puerto"`
	Acentos   string `json:"acentos"`    // "cp858" (tildes reales) | "ascii" (a e i o u)
	Texto     string `json:"texto"`      // "normal" | "alto" (default) | "grande"
	Negrita   string `json:"negrita"`    // "si" (default) | "no"
	Papel     int    `json:"papel"`      // 0 = usar el del dashboard | 58 | 80 (fuerza el ancho real)
	Modo      string `json:"modo"`       // "imagen" (default: texto como raster, sale igual en todas) | "comandos"
	UpdateURL string `json:"update_url"` // JSON de versión publicado por el dashboard
}

func cargarConfig(dir string) Config {
	cfg := Config{
		Puerto:    8443,
		Acentos:   "cp858",
		Texto:     "alto",
		Negrita:   "si",
		UpdateURL: "https://kiku-sushi-dashboard.vercel.app/descargas/comandera-print-version.json",
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
			// Columnas reales del ticket (línea más larga): es lo que define el
			// tamaño de letra en modo imagen. Queda logueado para diagnosticar.
			maxCols := 0
			for _, l := range strings.Split(req.Data.Content, "\n") {
				if n := len([]rune(strings.TrimRight(l, "\r"))); n > maxCols {
					maxCols = n
				}
			}
			log.Printf("→ print [%s/%s]%s · papel dashboard=%dmm config=%d · fuente=%d · %d columnas",
				nombre, req.Data.Type, conQR, req.Data.PaperWidth, cfg.Papel, req.Data.FontSize, maxCols)
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

// Descarga del certificado (.crt).
func servirCrt(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/x-x509-ca-cert")
	w.Header().Set("Content-Disposition", `attachment; filename="comandera-certificado.crt"`)
	http.ServeFile(w, r, certCrtPath)
}

// Página del puerto HTTP común (8442): solo existe para repartir el
// certificado. Un dispositivo sin el certificado instalado no puede pasar el
// candado https, pero http entra directo — se baja el .crt, se instala, listo.
func atenderPaginaCert(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/cert.crt" {
		servirCrt(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, `<html><body style="font-family:sans-serif;background:#111;color:#eee;padding:40px;max-width:500px">
<h1>🖨 Comandera Print — certificado</h1>
<p><a href="/cert.crt" style="display:inline-block;background:#4ade80;color:#111;padding:14px 24px;border-radius:12px;text-decoration:none;font-weight:bold;font-size:18px">⬇ Descargar certificado</a></p>
<p><b>Después de descargarlo:</b></p>
<p><b>Celular Android:</b> abrí el archivo descargado. Si no se instala solo:
Configuración → Seguridad → Instalar certificados desde el almacenamiento →
elegí el archivo → tipo "Certificado de CA".</p>
<p><b>PC Windows:</b> doble click → Instalar certificado → Equipo local →
"Colocar en el siguiente almacén" → Entidades de certificación raíz de confianza.</p>
<p style="color:#888">Al terminar, cerrá y abrí el navegador y probá el candado en el puerto 8443.</p>
</body></html>`)
}

// ── Ticket de diagnóstico de tamaños ────────────────────────────────────────
// Imprime la misma frase con cada comando de tamaño. Sirve para ver EN PAPEL
// qué comandos honra el modelo de impresora y elegir la config correcta.
func ticketPruebaTamanos() []byte {
	var b bytes.Buffer
	esc := func(bs ...byte) { b.Write(bs) }
	esc(0x1B, 0x40) // init
	b.WriteString("PRUEBA DE TAMANOS - COMANDERA\n")
	b.WriteString("------------------------------\n")
	esc(0x1B, 0x21, 0x00)
	esc(0x1D, 0x21, 0x00)
	b.WriteString("1) Normal de fabrica\n\n")
	esc(0x1B, 0x21, 0x18) // ESC !: doble alto + negrita
	b.WriteString("2) ESC doble alto\n\n")
	esc(0x1B, 0x21, 0x00)
	esc(0x1D, 0x21, 0x01) // GS !: doble alto
	b.WriteString("3) GS doble alto\n\n")
	esc(0x1D, 0x21, 0x11) // GS !: doble ancho y alto
	b.WriteString("4) GS grande\n\n")
	esc(0x1D, 0x21, 0x00)
	esc(0x1B, 0x45, 0x01) // negrita
	b.WriteString("5) Solo negrita\n")
	b.WriteString("\nSacale una foto a este ticket.\n")
	esc(0x1B, 0x64, 0x04, 0x1D, 0x56, 0x42, 0x00)
	return b.Bytes()
}

func atenderPruebaImpresion(w http.ResponseWriter, r *http.Request) {
	imp := strings.TrimSpace(r.URL.Query().Get("impresora"))
	tipo := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("tipo")))
	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	if imp == "" {
		opciones := ""
		for _, p := range listarImpresoras() {
			opciones += fmt.Sprintf(`<option value="%s">%s (USB)</option>`, p.Name, p.Name)
		}
		fmt.Fprintf(w, `<html><body style="font-family:sans-serif;background:#111;color:#eee;padding:40px;max-width:520px">
<h1>🖨 Ticket de prueba de tamaños</h1>
<p>Imprime la misma frase en 5 modos. La foto del resultado dice qué comandos
entiende la impresora.</p>
<form method="get">
<p>Impresora USB: <select name="impresora">%s</select>
<input type="hidden" name="tipo" value="usb">
<button style="padding:8px 16px;border-radius:8px;border:none;background:#4ade80;font-weight:bold">Imprimir</button></p>
</form>
<form method="get">
<p>O impresora de red (IP): <input name="impresora" placeholder="192.168.1.50">
<input type="hidden" name="tipo" value="network">
<button style="padding:8px 16px;border-radius:8px;border:none;background:#4ade80;font-weight:bold">Imprimir</button></p>
</form>
</body></html>`, opciones)
		return
	}

	datos := ticketPruebaTamanos()
	printMu.Lock()
	var err error
	if tipo == "network" {
		err = imprimirRed(imp, datos)
	} else {
		err = imprimirWindows(imp, datos)
	}
	printMu.Unlock()
	if err != nil {
		fmt.Fprintf(w, `<html><body style="font-family:sans-serif;background:#111;color:#f87171;padding:40px">✘ Error: %s</body></html>`, err.Error())
		return
	}
	fmt.Fprint(w, `<html><body style="font-family:sans-serif;background:#111;color:#4ade80;padding:40px">✔ Ticket de prueba enviado. Sacale una foto.</body></html>`)
}

// ── Prueba del QR sin impresora ─────────────────────────────────────────────
// Reconstruye la imagen a partir de los BYTES EXACTOS del comando raster
// GS v 0 que se le mandan a la impresora. No es un dibujo aparte: si la
// cámara lo lee acá, la impresora imprime exactamente eso.
func rasterAImagen(raster []byte) *image.Gray {
	if len(raster) < 8 {
		return nil
	}
	bpf := int(raster[4]) | int(raster[5])<<8
	alto := int(raster[6]) | int(raster[7])<<8
	ancho := bpf * 8
	if bpf <= 0 || alto <= 0 || alto > 4096 {
		return nil
	}
	img := image.NewGray(image.Rect(0, 0, ancho, alto))
	datos := raster[8:]
	for y := 0; y < alto; y++ {
		for x := 0; x < ancho; x++ {
			idx := y*bpf + x/8
			if idx >= len(datos) {
				return img
			}
			c := uint8(255)
			if (datos[idx]>>(7-uint(x%8)))&1 == 1 {
				c = 0
			}
			img.SetGray(x, y, color.Gray{Y: c})
		}
	}
	return img
}

func datosDePrueba(r *http.Request) string {
	if d := r.URL.Query().Get("data"); d != "" {
		return d
	}
	return "https://www.afip.gob.ar/fe/qr/?p=PRUEBA-COMANDERA-" + time.Now().Format("20060102150405")
}

func atenderPruebaPNG(w http.ResponseWriter, r *http.Request) {
	raster, err := rasterQR(datosDePrueba(r), 58)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	img := rasterAImagen(raster)
	if img == nil {
		http.Error(w, "raster inválido", 500)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	_ = png.Encode(w, img)
}

func atenderPrueba(w http.ResponseWriter, r *http.Request) {
	datos := datosDePrueba(r)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, `<html><body style="font-family:sans-serif;background:#111;color:#eee;padding:40px;max-width:560px">
<h1>🖨 Prueba del QR (sin impresora)</h1>
<p>Esta imagen está reconstruida desde los <b>bytes exactos</b> que Comandera Print
le manda a la impresora. No es un dibujo aparte: <b>si tu cámara lee este QR,
la impresora imprime exactamente esto</b>, píxel por píxel.</p>
<p style="background:#fff;display:inline-block;padding:16px;border-radius:8px"><img src="/prueba.png?data=%s" style="width:280px;image-rendering:pixelated"></p>
<p>Escanealo con la cámara del celular. Tiene que abrir:<br><code style="color:#4ade80;word-break:break-all">%s</code></p>
<form method="get"><p>Probar con otro contenido (p. ej. la URL real de un comprobante):<br>
<input name="data" style="width:100%%;padding:10px;border-radius:8px;border:none" placeholder="https://www.afip.gob.ar/fe/qr/?p=...">
<button style="margin-top:8px;padding:10px 18px;border-radius:8px;border:none;background:#4ade80;font-weight:bold">Generar</button></p></form>
</body></html>`, url.QueryEscape(datos), datos)
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
<h1>🖨 Comandera Print v%s</h1>
<p style="color:#4ade80">Funcionando. Si ves el candado en la barra de direcciones, el certificado está bien instalado.</p>
<p>Impresoras de Windows detectadas:</p><pre>%s</pre>
<p>¿Falta instalar el certificado en otro dispositivo? Desde ese dispositivo
abrí <b>http://ESTA-IP:8442</b> (con http, sin s) y descargalo, o
<a href="/cert.crt" style="color:#4ade80">bajalo directo acá</a>.</p>
<p>¿Querés verificar el QR sin impresora? <a href="/prueba" style="color:#4ade80">Prueba del QR</a>.</p>
<p style="color:#888">El dashboard se conecta solo. No hay nada más que hacer acá.</p>
</body></html>`, version, strings.Join(nombres, "\n"))
}

func ipsLocales() []string {
	var lan, linkLocal []string
	ifaces, _ := net.InterfaceAddrs()
	for _, a := range ifaces {
		if ipn, ok := a.(*net.IPNet); ok && !ipn.IP.IsLoopback() {
			if v4 := ipn.IP.To4(); v4 != nil {
				// 169.254.x.x = dirección "link-local": una placa de red sin
				// conexión real (sin cable, virtual). Nadie puede conectarse a
				// esa IP desde otro dispositivo — mostrarla solo confunde.
				if v4[0] == 169 && v4[1] == 254 {
					linkLocal = append(linkLocal, v4.String())
					continue
				}
				lan = append(lan, v4.String())
			}
		}
	}
	if len(lan) > 0 {
		return lan
	}
	return linkLocal
}

func main() {
	exe, _ := os.Executable()
	dir := filepath.Dir(exe)

	// Log a consola Y a archivo, para poder revisar qué pasó.
	logFile, err := os.OpenFile(filepath.Join(dir, "comandera-print.log"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
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
  ║   🖨  Comandera Print v%s               ║
  ║   Puente de impresión del dashboard        ║
  ╚════════════════════════════════════════════╝

`, version)

	certPath, keyPath, err := prepararCertificados(dir)
	if err != nil {
		log.Fatalf("No se pudieron preparar los certificados: %v", err)
	}

	certCrtPath = filepath.Join(dir, "INSTALAR-ESTE-CERTIFICADO.crt")
	log.Printf("Ticket: texto=%s · negrita=%s · acentos=%s", cfg.Texto, cfg.Negrita, cfg.Acentos)

	http.HandleFunc("/ws", atenderWS)
	http.HandleFunc("/cert.crt", servirCrt)
	http.HandleFunc("/prueba", atenderPrueba)
	http.HandleFunc("/prueba.png", atenderPruebaPNG)
	http.HandleFunc("/prueba-impresion", atenderPruebaImpresion)
	http.HandleFunc("/", atenderStatus)

	// Puerto HTTP común (sin candado): reparte el certificado a dispositivos
	// nuevos y permite la prueba del QR sin certificado instalado.
	go func() {
		mux := http.NewServeMux()
		mux.HandleFunc("/prueba", atenderPrueba)
		mux.HandleFunc("/prueba.png", atenderPruebaPNG)
		mux.HandleFunc("/prueba-impresion", atenderPruebaImpresion)
		mux.HandleFunc("/", atenderPaginaCert)
		_ = http.ListenAndServe(":8442", mux)
	}()

	addr := fmt.Sprintf(":%d", cfg.Puerto)
	for _, ip := range ipsLocales() {
		log.Printf("Escuchando en https://%s%s  (dashboard: usar %s como servidor de impresión)", ip, addr, ip)
	}
	log.Printf("Certificado para instalar: %s", certCrtPath)
	for _, ip := range ipsLocales() {
		log.Printf("Para instalar el certificado en un celular: abrí http://%s:8442 desde ese celular", ip)
		break
	}

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
