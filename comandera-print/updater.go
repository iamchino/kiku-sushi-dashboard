// Auto-actualización. El pipeline completo:
//
//   se cambia el código → push a GitHub → GitHub Actions compila el .exe →
//   lo publica en public/descargas del dashboard → Vercel lo sirve →
//   este programa lo detecta y se reemplaza a sí mismo.
//
// En el arranque el chequeo es sincrónico: si hay versión nueva se instala y
// el programa se relanza ya actualizado. Después chequea cada 6 horas y, si
// encuentra una, la deja instalada para el próximo arranque (no se reinicia
// solo en medio del servicio para no cortar una impresión).
package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"time"
)

type infoVersion struct {
	Version string `json:"version"`
	URL     string `json:"url"`
}

// limpiarViejo borra el binario anterior que queda tras una actualización.
func limpiarViejo(exePath string) {
	_ = os.Remove(exePath + ".old")
}

// actualizarSiHayNueva devuelve true si instaló una versión nueva.
func actualizarSiHayNueva(exePath string) bool {
	if cfg.UpdateURL == "" {
		return false
	}
	cliente := &http.Client{Timeout: 15 * time.Second}

	resp, err := cliente.Get(cfg.UpdateURL)
	if err != nil || resp.StatusCode != 200 {
		if resp != nil {
			resp.Body.Close()
		}
		return false // sin internet o sin publicar todavía: seguimos normal
	}
	var info infoVersion
	err = json.NewDecoder(resp.Body).Decode(&info)
	resp.Body.Close()
	if err != nil || info.Version == "" || info.Version == version || info.URL == "" {
		return false
	}

	log.Printf("⬆ Hay una versión nueva: v%s (esta es v%s). Descargando…", info.Version, version)

	resp, err = cliente.Get(info.URL)
	if err != nil || resp.StatusCode != 200 {
		if resp != nil {
			resp.Body.Close()
		}
		log.Printf("  no se pudo descargar; se reintenta más tarde")
		return false
	}
	defer resp.Body.Close()

	nuevo := exePath + ".new"
	f, err := os.Create(nuevo)
	if err != nil {
		log.Printf("  no se pudo crear el archivo: %v", err)
		return false
	}
	n, err := io.Copy(f, resp.Body)
	f.Close()
	if err != nil || n < 1_000_000 { // un exe real pesa varios MB
		_ = os.Remove(nuevo)
		log.Printf("  descarga inválida (%d bytes); se reintenta más tarde", n)
		return false
	}

	// En Windows se puede renombrar un exe en ejecución (no borrarlo).
	_ = os.Remove(exePath + ".old")
	if err := os.Rename(exePath, exePath+".old"); err != nil {
		log.Printf("  no se pudo apartar el binario actual: %v", err)
		return false
	}
	if err := os.Rename(nuevo, exePath); err != nil {
		_ = os.Rename(exePath+".old", exePath) // volver atrás
		log.Printf("  no se pudo instalar la versión nueva: %v", err)
		return false
	}
	log.Printf("✔ Versión v%s instalada.", info.Version)
	return true
}

// relanzar abre la versión nueva en una consola propia y termina esta.
func relanzar(exePath string) {
	log.Printf("Reiniciando con la versión nueva…")
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", "start", "", exePath)
	} else {
		cmd = exec.Command(exePath)
	}
	cmd.Dir = ""
	_ = cmd.Start()
	os.Exit(0)
}

// vigilarActualizaciones corre en segundo plano.
func vigilarActualizaciones(exePath string) {
	go func() {
		for {
			time.Sleep(6 * time.Hour)
			if actualizarSiHayNueva(exePath) {
				log.Printf("La versión nueva queda lista: se aplica al reiniciar el programa (o la PC).")
			}
		}
	}()
}
