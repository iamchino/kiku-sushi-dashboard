package main

import "testing"

// El render de texto tiene que producir un raster con tinta, del ancho del
// cabezal, y proporcional a la cantidad de líneas.
func TestRenderTextoRaster(t *testing.T) {
	texto := "        KIKU SUSHI\n--------------------------------\n1x Soju Tonic        $10.000,00\nTotal:              $144.300,00"
	datos, err := renderTextoRaster(texto, 568, true)
	if err != nil {
		t.Fatalf("error renderizando: %v", err)
	}
	if len(datos) < 100 {
		t.Fatalf("raster sospechosamente chico: %d bytes", len(datos))
	}
	// Cabecera del primer bloque GS v 0
	if datos[0] != 0x1D || datos[1] != 0x76 || datos[2] != 0x30 {
		t.Fatalf("no empieza con GS v 0: % x", datos[:4])
	}
	bpf := int(datos[4]) | int(datos[5])<<8
	if bpf*8 < 500 || bpf*8 > 576 {
		t.Fatalf("ancho fuera de rango: %d puntos", bpf*8)
	}
	negros := 0
	for _, x := range datos[8:] {
		if x != 0 {
			negros++
		}
	}
	if negros < 100 {
		t.Fatalf("casi sin píxeles negros (%d): el texto no se dibujó", negros)
	}
}

func TestRenderVacio(t *testing.T) {
	datos, err := renderTextoRaster("   \n  ", 384, false)
	if err != nil {
		t.Fatalf("error con texto vacío: %v", err)
	}
	if datos != nil {
		t.Fatalf("texto vacío debería devolver nil")
	}
	_ = grisDe(0)
}
