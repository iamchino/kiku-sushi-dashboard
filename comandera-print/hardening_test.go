package main

import "testing"

func TestVersionMayor(t *testing.T) {
	casos := []struct {
		n, a string
		want bool
	}{
		{"1.0.13", "1.0.12", true}, {"1.0.12", "1.0.12", false}, {"1.0.11", "1.0.12", false},
		{"1.1.0", "1.0.99", true}, {"2", "1.9.9", true}, {"1.0.12.1", "1.0.12", true},
	}
	for _, c := range casos {
		if got := versionMayor(c.n, c.a); got != c.want {
			t.Errorf("versionMayor(%q,%q)=%v, quería %v", c.n, c.a, got, c.want)
		}
	}
}

func TestUrlDeDescargaValida(t *testing.T) {
	base := "https://kiku-sushi-dashboard.vercel.app/descargas/comandera-print-version.json"
	if !urlDeDescargaValida("https://kiku-sushi-dashboard.vercel.app/descargas/ComanderaPrint.exe", base) {
		t.Error("misma host https debería ser válida")
	}
	if urlDeDescargaValida("http://kiku-sushi-dashboard.vercel.app/x.exe", base) {
		t.Error("http no debería ser válida")
	}
	if urlDeDescargaValida("https://malo.example.com/x.exe", base) {
		t.Error("otro host no debería ser válida")
	}
}

func TestDireccionImpresoraPermitida(t *testing.T) {
	cfg = Config{}
	if err := direccionImpresoraPermitida("192.168.1.50:9100"); err != nil {
		t.Errorf("LAN 9100 debería pasar: %v", err)
	}
	if err := direccionImpresoraPermitida("8.8.8.8:9100"); err == nil {
		t.Error("IP pública no debería pasar")
	}
	if err := direccionImpresoraPermitida("192.168.1.50:22"); err == nil {
		t.Error("puerto 22 no debería pasar")
	}
	if err := direccionImpresoraPermitida("impresora.local:9100"); err == nil {
		t.Error("nombre de host no debería pasar")
	}
	cfg = Config{PermitirRedExterna: true}
	if err := direccionImpresoraPermitida("8.8.8.8:22"); err != nil {
		t.Error("con permitir_red_externa pasa todo")
	}
}
