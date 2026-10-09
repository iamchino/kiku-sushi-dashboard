package main

import (
	"strings"
	"testing"
)

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

// Un ticket con más columnas de las que entran legibles se envuelve: la letra
// nunca baja de charWMin puntos por carácter.
func TestLetraNuncaChica(t *testing.T) {
	cols := 48
	linea := strings.Repeat("1x Roll de salmon con palta ", 3)[:cols]
	lineas := envolverLineas([]string{linea, "corta"}, 384/charWMin)
	if len(lineas) < 3 {
		t.Fatalf("la línea de %d columnas tenía que partirse: %v", cols, lineas)
	}
	for _, l := range lineas {
		if n := len([]rune(l)); n > 384/charWMin {
			t.Fatalf("línea de %d columnas supera el máximo: %q", n, l)
		}
	}
	// Y el render completo no falla con ese ancho.
	if _, err := renderTextoRaster(linea+"\n"+linea, 384, true); err != nil {
		t.Fatalf("render: %v", err)
	}
}

func TestEnvolverRespetaCortas(t *testing.T) {
	in := []string{"hola", "", "mundo"}
	out := envolverLineas(in, 32)
	if len(out) != 3 || out[0] != "hola" || out[1] != "" || out[2] != "mundo" {
		t.Fatalf("no tenía que tocar nada: %v", out)
	}
}
