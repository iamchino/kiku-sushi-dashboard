package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"time"
)

// getLocalIP returns the machine's primary LAN IPv4 address.
// Falls back to "127.0.0.1" if none is found.
func getLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "127.0.0.1"
	}
	for _, addr := range addrs {
		ipNet, ok := addr.(*net.IPNet)
		if !ok || ipNet.IP.IsLoopback() || ipNet.IP.IsLinkLocalUnicast() {
			continue
		}
		if ip4 := ipNet.IP.To4(); ip4 != nil {
			return ip4.String()
		}
	}
	return "127.0.0.1"
}

func getCertDir() string {
	appData := os.Getenv("APPDATA")
	return filepath.Join(appData, "GGEZPrint")
}

func getCertPaths() (certFile, keyFile string) {
	dir := getCertDir()
	return filepath.Join(dir, "cert.pem"), filepath.Join(dir, "key.pem")
}

func getCACertPaths() (caCertFile, caKeyFile string) {
	dir := getCertDir()
	return filepath.Join(dir, "ca.pem"), filepath.Join(dir, "ca-key.pem")
}

// certMatchesIP returns true if the stored cert's SAN IPs include the given IP.
func certMatchesIP(certFile, ip string) bool {
	data, err := os.ReadFile(certFile)
	if err != nil {
		return false
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return false
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return false
	}
	target := net.ParseIP(ip)
	if target == nil {
		return false
	}
	for _, certIP := range cert.IPAddresses {
		if certIP.Equal(target) {
			return true
		}
	}
	return false
}

// generateCA creates a local CA certificate and key, storing them at caCertFile and caKeyFile.
func generateCA(caCertFile, caKeyFile string) error {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return err
	}

	template := &x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject: pkix.Name{
			Organization: []string{"GG EZ Print Local CA"},
			CommonName:   "GG EZ Print CA",
		},
		NotBefore:             time.Now().Add(-time.Minute),
		NotAfter:              time.Now().Add(10 * 365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}

	certDER, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		return err
	}

	certOut, err := os.Create(caCertFile)
	if err != nil {
		return err
	}
	defer certOut.Close()
	if err := pem.Encode(certOut, &pem.Block{Type: "CERTIFICATE", Bytes: certDER}); err != nil {
		return err
	}

	keyOut, err := os.OpenFile(caKeyFile, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	defer keyOut.Close()
	keyBytes, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		return err
	}
	if err := pem.Encode(keyOut, &pem.Block{Type: "EC PRIVATE KEY", Bytes: keyBytes}); err != nil {
		return err
	}

	logToConsole("CA local generada: %s", caCertFile)
	return nil
}

// generateLeafCert creates a server certificate signed by the local CA.
func generateLeafCert(certFile, keyFile, caCertFile, caKeyFile, localIP string) error {
	// Load CA cert
	caCertData, err := os.ReadFile(caCertFile)
	if err != nil {
		return err
	}
	caBlock, _ := pem.Decode(caCertData)
	if caBlock == nil {
		return os.ErrInvalid
	}
	caCert, err := x509.ParseCertificate(caBlock.Bytes)
	if err != nil {
		return err
	}

	// Load CA key
	caKeyData, err := os.ReadFile(caKeyFile)
	if err != nil {
		return err
	}
	caKeyBlock, _ := pem.Decode(caKeyData)
	if caKeyBlock == nil {
		return os.ErrInvalid
	}
	caKey, err := x509.ParseECPrivateKey(caKeyBlock.Bytes)
	if err != nil {
		return err
	}

	// Generate leaf key
	leafKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return err
	}

	ipAddresses := []net.IP{net.ParseIP("127.0.0.1")}
	if ip := net.ParseIP(localIP); ip != nil && !ip.IsLoopback() {
		ipAddresses = append(ipAddresses, ip)
	}

	template := &x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject: pkix.Name{
			Organization: []string{"GG EZ Print"},
			CommonName:   "GG EZ Print Local Server",
		},
		NotBefore:   time.Now().Add(-time.Minute),
		NotAfter:    time.Now().Add(2 * 365 * 24 * time.Hour),
		KeyUsage:    x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IPAddresses: ipAddresses,
	}

	// Sign with CA key (not self-signed)
	certDER, err := x509.CreateCertificate(rand.Reader, template, caCert, &leafKey.PublicKey, caKey)
	if err != nil {
		return err
	}

	certOut, err := os.Create(certFile)
	if err != nil {
		return err
	}
	defer certOut.Close()
	if err := pem.Encode(certOut, &pem.Block{Type: "CERTIFICATE", Bytes: certDER}); err != nil {
		return err
	}

	keyOut, err := os.OpenFile(keyFile, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	defer keyOut.Close()
	keyBytes, err := x509.MarshalECPrivateKey(leafKey)
	if err != nil {
		return err
	}
	if err := pem.Encode(keyOut, &pem.Block{Type: "EC PRIVATE KEY", Bytes: keyBytes}); err != nil {
		return err
	}

	logToConsole("Certificado TLS generado para IP: %s", localIP)
	return nil
}

// ensureCertificate ensures a local CA and a CA-signed server certificate exist
// for the given localIP. Regenerates only the leaf cert if the IP changes.
func ensureCertificate(localIP string) error {
	if err := os.MkdirAll(getCertDir(), 0700); err != nil {
		return err
	}

	caCertFile, caKeyFile := getCACertPaths()
	if _, err := os.Stat(caCertFile); err != nil {
		logToConsole("Generando CA local...")
		if err := generateCA(caCertFile, caKeyFile); err != nil {
			return err
		}
	}

	certFile, keyFile := getCertPaths()
	if _, err := os.Stat(certFile); err == nil {
		if certMatchesIP(certFile, localIP) {
			return nil
		}
		logToConsole("IP cambió o cert no coincide — regenerando certificado...")
	}

	return generateLeafCert(certFile, keyFile, caCertFile, caKeyFile, localIP)
}
