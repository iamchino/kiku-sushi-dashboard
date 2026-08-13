// Certificados TLS. El dashboard corre en HTTPS, así que el navegador exige
// que la conexión al puente sea wss:// con un certificado confiable.
//
// Estrategia:
//   · Se genera UNA VEZ una CA propia ("KIKU Print CA") que se guarda en
//     ./certificados y se exporta como INSTALAR-ESTE-CERTIFICADO.crt.
//     Ese archivo se instala una sola vez en cada dispositivo (PC/celular).
//   · En cada arranque se emite un certificado de servidor firmado por esa CA
//     que cubre las IPs actuales de la máquina. Si la IP del local cambia,
//     alcanza con reiniciar el programa: la CA instalada sigue valiendo.
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

func prepararCertificados(dir string) (certPath, keyPath string, err error) {
	cdir := filepath.Join(dir, "certificados")
	if err = os.MkdirAll(cdir, 0755); err != nil {
		return
	}

	caCertPath := filepath.Join(cdir, "ca.pem")
	caKeyPath := filepath.Join(cdir, "ca-key.pem")

	var caCert *x509.Certificate
	var caKey *ecdsa.PrivateKey

	// ── CA persistente ──
	if datosCert, e1 := os.ReadFile(caCertPath); e1 == nil {
		if datosKey, e2 := os.ReadFile(caKeyPath); e2 == nil {
			if b, _ := pem.Decode(datosCert); b != nil {
				caCert, _ = x509.ParseCertificate(b.Bytes)
			}
			if b, _ := pem.Decode(datosKey); b != nil {
				caKey, _ = x509.ParseECPrivateKey(b.Bytes)
			}
		}
	}

	if caCert == nil || caKey == nil {
		caKey, err = ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		if err != nil {
			return
		}
		serial, _ := rand.Int(rand.Reader, big.NewInt(1<<62))
		plantilla := &x509.Certificate{
			SerialNumber:          serial,
			Subject:               pkix.Name{CommonName: "KIKU Print CA", Organization: []string{"KIKU Print"}},
			NotBefore:             time.Now().Add(-24 * time.Hour),
			NotAfter:              time.Now().AddDate(10, 0, 0),
			IsCA:                  true,
			KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature,
			BasicConstraintsValid: true,
		}
		var der []byte
		der, err = x509.CreateCertificate(rand.Reader, plantilla, plantilla, &caKey.PublicKey, caKey)
		if err != nil {
			return
		}
		caCert, _ = x509.ParseCertificate(der)

		_ = os.WriteFile(caCertPath, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0644)
		keyDER, _ := x509.MarshalECPrivateKey(caKey)
		_ = os.WriteFile(caKeyPath, pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}), 0600)
	}

	// El .crt que se instala en los dispositivos (formato DER: doble click en
	// Windows, importable en Android).
	_ = os.WriteFile(filepath.Join(dir, "INSTALAR-ESTE-CERTIFICADO.crt"), caCert.Raw, 0644)

	// ── Certificado del servidor para las IPs actuales ──
	srvKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return
	}
	ips := []net.IP{net.ParseIP("127.0.0.1")}
	for _, s := range ipsLocales() {
		if ip := net.ParseIP(s); ip != nil {
			ips = append(ips, ip)
		}
	}
	host, _ := os.Hostname()
	serial, _ := rand.Int(rand.Reader, big.NewInt(1<<62))
	plantilla := &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: "KIKU Print", Organization: []string{"KIKU Print"}},
		NotBefore:    time.Now().Add(-24 * time.Hour),
		NotAfter:     time.Now().AddDate(5, 0, 0),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IPAddresses:  ips,
		DNSNames:     []string{"localhost", host},
	}
	der, err := x509.CreateCertificate(rand.Reader, plantilla, caCert, &srvKey.PublicKey, caKey)
	if err != nil {
		return
	}

	certPath = filepath.Join(cdir, "server.pem")
	keyPath = filepath.Join(cdir, "server-key.pem")
	if err = os.WriteFile(certPath, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0644); err != nil {
		return
	}
	keyDER, _ := x509.MarshalECPrivateKey(srvKey)
	err = os.WriteFile(keyPath, pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}), 0600)
	return
}
