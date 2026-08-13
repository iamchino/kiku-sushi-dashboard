// Armado del ticket en bytes ESC/POS.
//
// El dashboard manda texto plano ya formateado al ancho del papel, con un
// marcador {{QR}} donde va el código. Acá:
//   · se inicializa la impresora y se elige la página de códigos,
//   · el texto se codifica a CP858 (tildes y ñ reales) o ASCII según config,
//   · {{QR}} se reemplaza por el QR EN RASTER (GS v 0): píxeles, no el
//     comando QR nativo que falla según el modelo. Esto es lo que hace que
//     "no falle nunca".
package main

import (
	"bytes"
	"fmt"
	"strings"

	qrcode "github.com/skip2/go-qrcode"
)

const marcadorQR = "{{QR}}"

func buildTicket(contenido string, fontSize, paperWidth int, qrData, acentos string) ([]byte, error) {
	var out bytes.Buffer

	// Inicializar + página de códigos CP858 (n=19, multilingüe con €).
	out.Write([]byte{0x1B, 0x40}) // ESC @
	if acentos != "ascii" {
		out.Write([]byte{0x1B, 0x74, 19}) // ESC t 19
	}

	// Tamaño de fuente: GS ! n. La fuente "normal" de las térmicas se ve
	// chica y finita: por defecto va DOBLE ALTO (0x01), que es más legible y
	// no cambia la cantidad de columnas — el formato del ticket queda intacto.
	// Configurable con "texto" en config.json: normal | alto | grande.
	tam := byte(0x01)
	switch cfg.Texto {
	case "normal":
		tam = 0x00
	case "grande":
		tam = 0x11
	}
	if fontSize >= 2 {
		tam = 0x11 // el dashboard pidió grande explícitamente
	}
	out.Write([]byte{0x1D, 0x21, tam})

	// Negrita: mucho mejor contraste en papel térmico. "negrita": "no" la saca.
	if cfg.Negrita != "no" {
		out.Write([]byte{0x1B, 0x45, 0x01}) // ESC E 1
	}

	texto := strings.ReplaceAll(contenido, "\r\n", "\n")

	// Red de seguridad: sin datos de QR, el marcador desaparece — jamás se
	// imprime el literal "{{QR}}".
	if strings.TrimSpace(qrData) == "" {
		texto = strings.ReplaceAll(texto, marcadorQR, "")
		out.Write(codificar(texto, acentos))
	} else {
		partes := strings.SplitN(texto, marcadorQR, 2)
		out.Write(codificar(partes[0], acentos))

		qr, err := rasterQR(qrData, paperWidth)
		if err != nil {
			return nil, fmt.Errorf("generando el QR: %w", err)
		}
		out.Write([]byte{0x0A})             // línea en blanco
		out.Write([]byte{0x1B, 0x61, 0x01}) // centrar
		out.Write(qr)
		out.Write([]byte{0x1B, 0x61, 0x00}) // volver a izquierda
		out.Write([]byte{0x0A})

		if len(partes) == 2 {
			resto := strings.ReplaceAll(partes[1], marcadorQR, "")
			out.Write(codificar(resto, acentos))
		}
	}

	// Avance + corte parcial.
	out.Write([]byte{0x1B, 0x64, 0x04})       // ESC d 4: alimentar 4 líneas
	out.Write([]byte{0x1D, 0x56, 0x42, 0x00}) // GS V 66 0: corte parcial
	return out.Bytes(), nil
}

// rasterQR: QR como imagen raster GS v 0. Cada módulo del QR se dibuja como
// un cuadrado de `escala` puntos. Cualquier impresora ESC/POS imprime esto.
func rasterQR(datos string, paperWidth int) ([]byte, error) {
	q, err := qrcode.New(datos, qrcode.Medium)
	if err != nil {
		return nil, err
	}
	mapa := q.Bitmap() // [][]bool, true = negro, incluye borde blanco

	// Ancho útil: 384 puntos en papel de 58mm, 576 en 80mm. Margen de
	// seguridad para no cortar el QR en impresoras con cabezal más chico.
	maxPuntos := 360
	if paperWidth >= 80 {
		maxPuntos = 512
	}
	escala := maxPuntos / len(mapa)
	if escala < 2 {
		escala = 2
	}
	if escala > 8 {
		escala = 8
	}

	lado := len(mapa) * escala
	bytesPorFila := (lado + 7) / 8

	var out bytes.Buffer
	// GS v 0 m xL xH yL yH
	out.Write([]byte{0x1D, 0x76, 0x30, 0x00,
		byte(bytesPorFila & 0xFF), byte(bytesPorFila >> 8),
		byte(lado & 0xFF), byte(lado >> 8)})

	fila := make([]byte, bytesPorFila)
	for my := 0; my < len(mapa); my++ {
		for i := range fila {
			fila[i] = 0
		}
		for mx := 0; mx < len(mapa); mx++ {
			if mapa[my][mx] {
				for r := 0; r < escala; r++ {
					x := mx*escala + r
					fila[x/8] |= 0x80 >> (x % 8)
				}
			}
		}
		for r := 0; r < escala; r++ {
			out.Write(fila)
		}
	}
	return out.Bytes(), nil
}

// ── Codificación de texto ────────────────────────────────────────────────────

// Los caracteres del español en CP858 (igual a CP850 salvo el €).
var tablaCP858 = map[rune]byte{
	'á': 0xA0, 'é': 0x82, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3,
	'Á': 0xB5, 'É': 0x90, 'Í': 0xD6, 'Ó': 0xE0, 'Ú': 0xE9,
	'ñ': 0xA4, 'Ñ': 0xA5, 'ü': 0x81, 'Ü': 0x9A,
	'à': 0x85, 'è': 0x8A, 'ì': 0x8D, 'ò': 0x95, 'ù': 0x97,
	'ä': 0x84, 'ë': 0x89, 'ï': 0x8B, 'ö': 0x94,
	'ç': 0x87, 'Ç': 0x80,
	'¿': 0xA8, '¡': 0xAD, '°': 0xF8, 'º': 0xA7, 'ª': 0xA6,
	'€': 0xD5, '·': 0xFA, '½': 0xAB, '¼': 0xAC, '±': 0xF1,
}

// Fallback sin tildes: siempre imprime algo legible.
var tablaASCII = map[rune]string{
	'á': "a", 'é': "e", 'í': "i", 'ó': "o", 'ú': "u",
	'Á': "A", 'É': "E", 'Í': "I", 'Ó': "O", 'Ú': "U",
	'ñ': "n", 'Ñ': "N", 'ü': "u", 'Ü': "U",
	'à': "a", 'è': "e", 'ì': "i", 'ò': "o", 'ù': "u",
	'ä': "a", 'ë': "e", 'ï': "i", 'ö': "o",
	'ç': "c", 'Ç': "C",
	'¿': "?", '¡': "!", '°': "o", 'º': "o", 'ª': "a",
	'€': "EUR", '·': "-", '½': "1/2", '¼': "1/4", '±': "+-",
	'—': "-", '–': "-", '“': "\"", '”': "\"", '‘': "'", '’': "'", '…': "...",
}

func codificar(s, acentos string) []byte {
	var out bytes.Buffer
	for _, r := range s {
		switch {
		case r == '\n' || r == '\t' || (r >= 0x20 && r < 0x7F):
			out.WriteByte(byte(r))
		case acentos != "ascii" && tablaCP858[r] != 0:
			out.WriteByte(tablaCP858[r])
		case tablaASCII[r] != "":
			out.WriteString(tablaASCII[r])
		default:
			out.WriteByte('?')
		}
	}
	return out.Bytes()
}
