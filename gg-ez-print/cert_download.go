package main

import (
	"fmt"
	"net/http"
)

const certServerPort = "8080"

// startCertServer arranca un servidor HTTP plano (sin TLS) en el puerto 8080
// que sirve el certificado CA para que dispositivos móviles puedan descargarlo
// antes de tener la CA instalada.
//
// Rutas:
//   GET /cert  → descarga ca.pem con el Content-Disposition correcto
//   GET /      → página HTML mínima con instrucciones + enlace de descarga
func startCertServer() {
	mux := http.NewServeMux()

	mux.HandleFunc("/cert", handleCertDownload)
	mux.HandleFunc("/", handleCertPage)

	localIP := getLocalIP()
	addr := ":" + certServerPort
	logToConsole("Servidor de certificado iniciado en http://%s%s/cert", localIP, addr)

	if err := http.ListenAndServe(addr, mux); err != nil {
		logToConsole("ADVERTENCIA: No se pudo iniciar servidor de certificado: %v", err)
	}
}

// handleCertDownload sirve el archivo ca.pem para descarga directa.
func handleCertDownload(w http.ResponseWriter, r *http.Request) {
	caCertFile, _ := getCACertPaths()
	w.Header().Set("Content-Type", "application/x-pem-file")
	w.Header().Set("Content-Disposition", `attachment; filename="GGEZPrint-CA.pem"`)
	http.ServeFile(w, r, caCertFile)
}

// handleCertPage sirve una página HTML mínima con el enlace de descarga
// e instrucciones de instalación para Android e iOS.
func handleCertPage(w http.ResponseWriter, r *http.Request) {
	localIP := getLocalIP()
	certURL := fmt.Sprintf("http://%s:%s/cert", localIP, certServerPort)

	html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GG EZ Print – Instalar certificado</title>
<style>
  body { font-family: sans-serif; max-width: 480px; margin: 40px auto; padding: 0 20px; background: #f5f5f5; color: #222; }
  h1   { font-size: 1.3rem; }
  .btn { display: inline-block; margin: 16px 0; padding: 14px 28px; background: #2563eb; color: #fff;
         border-radius: 8px; text-decoration: none; font-size: 1.1rem; }
  h2   { font-size: 1rem; margin-top: 28px; }
  ol   { padding-left: 20px; line-height: 1.7; }
  code { background: #e2e8f0; padding: 2px 5px; border-radius: 3px; }
</style>
</head>
<body>
<h1>Instalar certificado GG EZ Print</h1>
<p>Descargá el certificado CA y seguí los pasos según tu dispositivo.</p>
<a class="btn" href="/cert">⬇ Descargar certificado</a>

<h2>Android</h2>
<ol>
  <li>Tocá el botón de arriba para descargar <code>GGEZPrint-CA.pem</code></li>
  <li>Abrí <strong>Ajustes → Seguridad → Más ajustes → Instalar certificado → Certificado CA</strong></li>
  <li>Seleccioná el archivo descargado y confirmá</li>
  <li>Samsung: <strong>Biometría y seguridad → Otras config. de seguridad → Instalar desde almacenamiento</strong></li>
</ol>

<h2>iPhone / iPad</h2>
<ol>
  <li>Tocá el botón de arriba — iOS preguntará si querés instalar el perfil</li>
  <li>Aceptá e ingresá tu código si lo pide</li>
  <li>Ir a <strong>Ajustes → General → Información → Ajustes de confianza de certificados</strong></li>
  <li>Activar la CA <em>GG EZ Print</em></li>
</ol>

<p style="margin-top:32px;color:#666;font-size:.85rem;">
  Servidor: <code>%s</code>
</p>
</body>
</html>`, certURL)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, html)
}
