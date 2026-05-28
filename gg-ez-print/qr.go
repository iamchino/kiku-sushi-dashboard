package main

import (
	"bytes"

	"github.com/skip2/go-qrcode"
)

// generateQRRaster genera los bytes ESC/POS necesarios para imprimir un
// código QR como imagen raster (comando GS v 0). Compatible con cualquier
// impresora térmica ESC/POS.
//
// scale: cuántos píxeles de impresión por módulo del QR. 6 = ~25mm a 80mm.
func generateQRRaster(text string, scale int) ([]byte, error) {
	if scale <= 0 {
		scale = 6
	}

	q, err := qrcode.New(text, qrcode.Medium)
	if err != nil {
		return nil, err
	}
	q.DisableBorder = false // dejar quiet zone (4 módulos) — ayuda al scanner

	bitmap := q.Bitmap() // [][]bool, true = negro
	size := len(bitmap)
	pxSize := size * scale
	bytesPerRow := (pxSize + 7) / 8

	buf := make([]byte, bytesPerRow*pxSize)
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			if !bitmap[y][x] {
				continue
			}
			for dy := 0; dy < scale; dy++ {
				py := y*scale + dy
				for dx := 0; dx < scale; dx++ {
					px := x*scale + dx
					byteIdx := py*bytesPerRow + (px >> 3)
					bitIdx := uint(7 - (px & 7))
					buf[byteIdx] |= 1 << bitIdx
				}
			}
		}
	}

	var out bytes.Buffer
	// Centrar
	out.Write([]byte{0x1B, 0x61, 0x01})
	// GS v 0 m xL xH yL yH
	out.Write([]byte{0x1D, 0x76, 0x30, 0x00})
	out.WriteByte(byte(bytesPerRow & 0xff))
	out.WriteByte(byte((bytesPerRow >> 8) & 0xff))
	out.WriteByte(byte(pxSize & 0xff))
	out.WriteByte(byte((pxSize >> 8) & 0xff))
	out.Write(buf)
	out.WriteByte('\n')
	// Alineación izquierda otra vez
	out.Write([]byte{0x1B, 0x61, 0x00})

	return out.Bytes(), nil
}
