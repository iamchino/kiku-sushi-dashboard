//go:build windows

package main

import (
	"crypto/sha1"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"syscall"

	"golang.org/x/sys/windows/registry"
)

// isCATrusted checks if the CA certificate is already in the Windows
// current-user trusted root store by looking up its SHA-1 thumbprint in the registry.
func isCATrusted(caCertFile string) (bool, error) {
	data, err := os.ReadFile(caCertFile)
	if err != nil {
		return false, err
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return false, fmt.Errorf("invalid PEM in %s", caCertFile)
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return false, err
	}

	thumbprint := sha1.Sum(cert.Raw)
	thumb := strings.ToUpper(fmt.Sprintf("%X", thumbprint[:]))

	regPath := `Software\Microsoft\SystemCertificates\ROOT\Certificates\` + thumb
	key, err := registry.OpenKey(registry.CURRENT_USER, regPath, registry.QUERY_VALUE)
	if err != nil {
		return false, nil
	}
	key.Close()
	return true, nil
}

// installCATrust installs the CA certificate into the Windows current-user
// trusted root store using certutil. Windows will show a confirmation dialog.
func installCATrust(caCertFile string) error {
	cmd := exec.Command("certutil", "-addstore", "-user", "ROOT", caCertFile)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("certutil falló: %w\nSalida: %s", err, string(output))
	}
	logToConsole("CA instalada en el almacén de confianza de Windows")
	return nil
}

// ensureCATrusted installs the CA into the Windows trust store if not already there.
// Non-fatal: if the user declines or certutil fails the server still runs.
func ensureCATrusted(caCertFile string) error {
	trusted, err := isCATrusted(caCertFile)
	if err != nil {
		return err
	}
	if trusted {
		logToConsole("CA ya está en el almacén de confianza de Windows")
		return nil
	}
	logToConsole("Instalando CA en el almacén de confianza de Windows...")
	return installCATrust(caCertFile)
}
