//go:build !windows

// Stubs para sistemas no-Windows (permiten compilar y probar la lógica de
// tickets y QR en Linux/Mac). Las impresoras USB por nombre son de Windows;
// las de red (IP:9100) funcionan en cualquier sistema.
package main

import "fmt"

func listarImpresoras() []printerEntry {
	return []printerEntry{}
}

func imprimirWindows(nombre string, _ []byte) error {
	return fmt.Errorf("la impresora %q es de tipo USB y este sistema no es Windows; usá tipo Network con la IP", nombre)
}
