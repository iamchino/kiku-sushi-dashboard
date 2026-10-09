// Texto renderizado como IMAGEN (raster GS v 0), igual que el QR.
//
// El motivo: los comandos ESC/POS de tamaño de letra (ESC !, GS !) dependen
// del firmware de cada impresora — en algunas andan, en otras no, y el mismo
// ticket sale gigante o microscópico según el modelo. Una imagen no discute:
// son píxeles, y se imprimen idénticos en cualquier ESC/POS.
//
// El tamaño se adapta solo: el ancho de cada carácter = ancho del cabezal /
// columnas del ticket (el dashboard ya manda el texto formateado a N columnas
// con espacios). Menos columnas (comanda con fuente 2) → letra más grande.
package main

import (
	"bytes"
	"image"
	"image/color"
	"strings"

	"golang.org/x/image/font"
	"golang.org/x/image/font/gofont/gomono"
	"golang.org/x/image/font/gofont/gomonobold"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
)

// Ancho mínimo de un carácter, en puntos del cabezal.
const charWMin = 11

// envolverLineas corta en `cols` columnas las líneas más largas, preferentemente
// en un espacio; la continuación va con una sangría de dos espacios.
func envolverLineas(lineas []string, cols int) []string {
	if cols < 4 {
		return lineas
	}
	out := make([]string, 0, len(lineas))
	for _, l := range lineas {
		r := []rune(l)
		// Separadores (----- o =====): se recortan, no se envuelven.
		if len(r) > cols && esSeparador(r) {
			out = append(out, string(r[:cols]))
			continue
		}
		primera := true
		for len(r) > cols {
			corte := -1
			for i := cols; i > cols/2; i-- {
				if r[i] == ' ' {
					corte = i
					break
				}
			}
			if corte == -1 {
				corte = cols
			}
			out = append(out, string(r[:corte]))
			resto := strings.TrimLeft(string(r[corte:]), " ")
			if resto == "" {
				r = nil
				break
			}
			r = []rune("  " + resto)
			primera = false
		}
		if r != nil && (len(r) > 0 || primera) {
			out = append(out, string(r))
		}
	}
	return out
}

func esSeparador(r []rune) bool {
	for _, c := range r {
		if c != r[0] {
			return false
		}
	}
	return r[0] == '-' || r[0] == '=' || r[0] == '_' || r[0] == '*' || r[0] == '.'
}

// renderTextoRaster dibuja el texto (multilínea, monoespaciado) y lo devuelve
// como uno o más bloques GS v 0 listos para mandar a la impresora.
func renderTextoRaster(texto string, maxPuntos int, negrita bool) ([]byte, error) {
	texto = strings.TrimRight(texto, "\n")
	if strings.TrimSpace(texto) == "" {
		return nil, nil
	}
	lineas := strings.Split(texto, "\n")

	// Columnas reales del ticket: la línea más larga (el formatter del
	// dashboard rellena con espacios al ancho configurado).
	maxCols := 0
	for _, l := range lineas {
		if n := len([]rune(l)); n > maxCols {
			maxCols = n
		}
	}
	if maxCols == 0 {
		return nil, nil
	}

	// Piso de legibilidad: nunca menos de charWMin puntos por carácter (11 en
	// un cabezal de 384 = 34 columnas, en uno de 568 = 51). Si el ticket viene
	// con más columnas (dashboard configurado con un ancho mayor al del papel,
	// o una línea larga), las líneas se envuelven en vez de achicar la letra:
	// un ticket con letra microscópica no sirve en cocina.
	colsMax := maxPuntos / charWMin
	if maxCols > colsMax {
		lineas = envolverLineas(lineas, colsMax)
		maxCols = colsMax
	}
	charW := maxPuntos / maxCols
	if charW > 30 {
		charW = 30
	}

	ttf := gomono.TTF
	if negrita {
		ttf = gomonobold.TTF
	}
	ft, err := opentype.Parse(ttf)
	if err != nil {
		return nil, err
	}

	// Cara tipográfica con avance ≈ charW: primera pasada estimada, se mide
	// el avance real y se corrige.
	size := float64(charW) / 0.6
	face, err := opentype.NewFace(ft, &opentype.FaceOptions{Size: size, DPI: 72, Hinting: font.HintingFull})
	if err != nil {
		return nil, err
	}
	if adv, ok := face.GlyphAdvance('M'); ok {
		if px := adv.Ceil(); px > 0 && px != charW {
			size = size * float64(charW) / float64(px)
			if f2, err2 := opentype.NewFace(ft, &opentype.FaceOptions{Size: size, DPI: 72, Hinting: font.HintingFull}); err2 == nil {
				face = f2
			}
		}
	}

	met := face.Metrics()
	lineH := met.Height.Ceil() + 2
	ascent := met.Ascent.Ceil()

	ancho := maxPuntos
	alto := lineH*len(lineas) + 4
	img := image.NewGray(image.Rect(0, 0, ancho, alto))
	// Fondo blanco (Gray arranca en 0 = negro).
	for i := range img.Pix {
		img.Pix[i] = 0xFF
	}

	d := font.Drawer{Dst: img, Src: image.Black, Face: face}
	y := ascent + 2
	for _, l := range lineas {
		d.Dot = fixed.P(0, y)
		d.DrawString(l)
		y += lineH
	}

	return empaquetarGSv0(img, 160), nil
}

// empaquetarGSv0 convierte una imagen en bloques raster GS v 0. Se parte en
// bandas de ≤200 filas: algunos firmwares tienen buffer chico y un raster muy
// alto los ahoga; bandas consecutivas imprimen sin costura.
func empaquetarGSv0(img *image.Gray, umbral uint8) []byte {
	b := img.Bounds()
	ancho, alto := b.Dx(), b.Dy()
	bpf := (ancho + 7) / 8

	var out bytes.Buffer
	const banda = 200
	for y0 := 0; y0 < alto; y0 += banda {
		filas := banda
		if y0+filas > alto {
			filas = alto - y0
		}
		out.Write([]byte{0x1D, 0x76, 0x30, 0x00,
			byte(bpf & 0xFF), byte(bpf >> 8),
			byte(filas & 0xFF), byte(filas >> 8)})
		fila := make([]byte, bpf)
		for y := y0; y < y0+filas; y++ {
			for i := range fila {
				fila[i] = 0
			}
			for x := 0; x < ancho; x++ {
				if img.GrayAt(b.Min.X+x, b.Min.Y+y).Y < umbral {
					fila[x/8] |= 0x80 >> (x % 8)
				}
			}
			out.Write(fila)
		}
	}
	return out.Bytes()
}

// grisDe es un helper de test.
func grisDe(v uint8) color.Gray { return color.Gray{Y: v} }
