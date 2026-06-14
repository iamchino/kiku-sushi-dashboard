package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// updateManifest es la estructura del JSON publicado en el Storage de Supabase.
type updateManifest struct {
	Version   string `json:"version"`   // ej. "1.2.0"
	URL       string `json:"url"`       // link directo al .exe nuevo
	SHA256    string `json:"sha256"`    // hash hex del .exe (opcional pero recomendado)
	Notes     string `json:"notes"`     // changelog corto (informativo)
	Mandatory bool   `json:"mandatory"` // reservado para futuro (forzar update)
}

var updateHTTPClient = &http.Client{Timeout: 60 * time.Second}

// oldBinarySuffix: al actualizar, el binario viejo se renombra con este sufijo
// y se borra en el próximo arranque. Windows no permite borrar un .exe en uso,
// pero SÍ permite renombrarlo, así que ese es el truco del swap.
const oldBinarySuffix = ".old"

// newBinaryName: nombre temporal del binario descargado antes del swap.
const newBinaryName = "gg-ez-print.new.exe"

// startUpdater corre el chequeo de actualizaciones al arrancar y luego en loop
// cada updateCheckIntervalHours. Pensado para lanzarse con `go startUpdater()`.
func startUpdater() {
	if updateManifestURL == "" {
		logToConsole("Auto-update desactivado (updateManifestURL vacío)")
		return
	}

	logToConsole("Auto-update activo. Versión actual: %s", appVersion)

	// Pequeño delay para no competir con el arranque del server TLS / cert.
	time.Sleep(20 * time.Second)
	checkAndApplyUpdate(false)

	ticker := time.NewTicker(time.Duration(updateCheckIntervalHours) * time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		checkAndApplyUpdate(false)
	}
}

// checkAndApplyUpdate lee el manifiesto y, si hay versión nueva, la aplica.
// Si manual=true (botón del menú), loguea también cuando ya está al día.
func checkAndApplyUpdate(manual bool) {
	manifest, err := fetchManifest()
	if err != nil {
		logToConsole("Update: no se pudo leer el manifiesto: %v", err)
		return
	}

	if !isNewer(manifest.Version, appVersion) {
		if manual {
			logToConsole("Update: ya estás en la última versión (%s)", appVersion)
		}
		return
	}

	logToConsole("Update: versión nueva disponible %s (actual %s). Descargando...", manifest.Version, appVersion)
	if manifest.Notes != "" {
		logToConsole("Update: cambios -> %s", manifest.Notes)
	}

	if err := downloadAndApply(manifest); err != nil {
		logToConsole("Update: falló la actualización a %s: %v", manifest.Version, err)
		return
	}
	// Si downloadAndApply tuvo éxito, relanza y termina el proceso: no se vuelve.
}

func fetchManifest() (*updateManifest, error) {
	resp, err := updateHTTPClient.Get(updateManifestURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // máx 1 MB
	if err != nil {
		return nil, err
	}

	var m updateManifest
	if err := json.Unmarshal(body, &m); err != nil {
		return nil, fmt.Errorf("JSON inválido: %w", err)
	}
	if m.Version == "" || m.URL == "" {
		return nil, fmt.Errorf("manifiesto incompleto (faltan version/url)")
	}
	return &m, nil
}

// downloadAndApply descarga el nuevo binario, verifica el hash y hace el swap.
func downloadAndApply(m *updateManifest) error {
	execPath, err := getExecutablePath()
	if err != nil {
		return err
	}
	dir := filepath.Dir(execPath)
	newPath := filepath.Join(dir, newBinaryName)

	if err := downloadFile(m.URL, newPath); err != nil {
		return fmt.Errorf("descarga: %w", err)
	}

	// Verificación de integridad (recomendada). Si el manifiesto no trae hash,
	// se acepta igual, pero conviene siempre publicarlo.
	if m.SHA256 != "" {
		got, hErr := fileSHA256(newPath)
		if hErr != nil {
			os.Remove(newPath)
			return fmt.Errorf("calculando hash: %w", hErr)
		}
		if !strings.EqualFold(got, m.SHA256) {
			os.Remove(newPath)
			return fmt.Errorf("sha256 no coincide (esperado %s, obtenido %s)", m.SHA256, got)
		}
		logToConsole("Update: SHA256 verificado OK")
	}

	// Swap atómico en Windows: renombrar el binario en uso, luego mover el nuevo.
	oldPath := execPath + oldBinarySuffix
	os.Remove(oldPath) // por si quedó uno de una corrida previa

	if err := os.Rename(execPath, oldPath); err != nil {
		os.Remove(newPath)
		return fmt.Errorf("renombrando binario actual: %w", err)
	}
	if err := os.Rename(newPath, execPath); err != nil {
		// Revertir el primer rename para no dejar el sistema sin ejecutable.
		os.Rename(oldPath, execPath)
		os.Remove(newPath)
		return fmt.Errorf("moviendo binario nuevo: %w", err)
	}

	logToConsole("Update: %s aplicado. Reiniciando aplicación...", m.Version)
	relaunch(execPath)
	return nil
}

func downloadFile(url, dest string) error {
	resp, err := updateHTTPClient.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("status HTTP %d", resp.StatusCode)
	}

	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

func fileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// relaunch arranca el binario nuevo y termina el proceso actual.
func relaunch(execPath string) {
	cmd := exec.Command(execPath)
	cmd.Dir = filepath.Dir(execPath)
	if err := cmd.Start(); err != nil {
		logToConsole("Update: no se pudo relanzar el binario nuevo: %v", err)
		return
	}
	// Le damos un instante al nuevo proceso para tomar el puerto y salimos.
	go func() {
		time.Sleep(2 * time.Second)
		os.Exit(0)
	}()
}

// cleanupOldBinary borra el binario viejo que quedó tras una actualización
// previa (ya no está en uso) y cualquier .new.exe huérfano de una descarga
// interrumpida. Se llama al arrancar.
func cleanupOldBinary() {
	execPath, err := getExecutablePath()
	if err != nil {
		return
	}
	oldPath := execPath + oldBinarySuffix
	if _, statErr := os.Stat(oldPath); statErr == nil {
		if rmErr := os.Remove(oldPath); rmErr == nil {
			logToConsole("Update: binario anterior eliminado (%s)", filepath.Base(oldPath))
		}
	}
	os.Remove(filepath.Join(filepath.Dir(execPath), newBinaryName))
}

// isNewer compara dos versiones semver simples ("1.2.0"). true si remote > local.
func isNewer(remote, local string) bool {
	r := parseVersion(remote)
	l := parseVersion(local)
	for i := 0; i < 3; i++ {
		if r[i] > l[i] {
			return true
		}
		if r[i] < l[i] {
			return false
		}
	}
	return false
}

// parseVersion convierte "v1.2.3" / "1.2.3" en [3]int{1,2,3}. Tolerante a
// sufijos (ej. "1.2.0-beta" -> {1,2,0}) y a campos faltantes.
func parseVersion(v string) [3]int {
	var out [3]int
	v = strings.TrimPrefix(strings.TrimSpace(v), "v")
	parts := strings.SplitN(v, ".", 4)
	for i := 0; i < 3 && i < len(parts); i++ {
		num := parts[i]
		for j, c := range num {
			if c < '0' || c > '9' {
				num = num[:j]
				break
			}
		}
		n, _ := strconv.Atoi(num)
		out[i] = n
	}
	return out
}
