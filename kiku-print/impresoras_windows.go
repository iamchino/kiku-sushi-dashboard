//go:build windows

// Impresoras de Windows: listado (EnumPrinters) e impresión RAW por nombre
// (winspool: OpenPrinter → StartDocPrinter RAW → WritePrinter). Es el mismo
// mecanismo que usa cualquier utilidad de tickets: los bytes ESC/POS van
// directo al puerto de la impresora, sin driver de por medio.
package main

import (
	"fmt"
	"syscall"
	"unsafe"
)

var (
	winspool             = syscall.NewLazyDLL("winspool.drv")
	procEnumPrinters     = winspool.NewProc("EnumPrintersW")
	procOpenPrinter      = winspool.NewProc("OpenPrinterW")
	procClosePrinter     = winspool.NewProc("ClosePrinter")
	procStartDocPrinter  = winspool.NewProc("StartDocPrinterW")
	procEndDocPrinter    = winspool.NewProc("EndDocPrinter")
	procStartPagePrinter = winspool.NewProc("StartPagePrinter")
	procEndPagePrinter   = winspool.NewProc("EndPagePrinter")
	procWritePrinter     = winspool.NewProc("WritePrinter")
)

const (
	printerEnumLocal       = 0x00000002
	printerEnumConnections = 0x00000004
)

type printerInfo4 struct {
	pPrinterName *uint16
	pServerName  *uint16
	attributes   uint32
}

type docInfo1 struct {
	pDocName    *uint16
	pOutputFile *uint16
	pDatatype   *uint16
}

func listarImpresoras() []printerEntry {
	flags := uintptr(printerEnumLocal | printerEnumConnections)
	var needed, returned uint32

	// Primera llamada: cuánto buffer hace falta.
	procEnumPrinters.Call(flags, 0, 4, 0, 0,
		uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if needed == 0 {
		return []printerEntry{}
	}

	buf := make([]byte, needed)
	r1, _, _ := procEnumPrinters.Call(flags, 0, 4,
		uintptr(unsafe.Pointer(&buf[0])), uintptr(needed),
		uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if r1 == 0 || returned == 0 {
		return []printerEntry{}
	}

	entradas := make([]printerEntry, 0, returned)
	tam := unsafe.Sizeof(printerInfo4{})
	for i := uintptr(0); i < uintptr(returned); i++ {
		info := (*printerInfo4)(unsafe.Pointer(&buf[i*tam]))
		if info.pPrinterName != nil {
			entradas = append(entradas, printerEntry{
				Name: utf16aString(info.pPrinterName),
				Type: "USB",
			})
		}
	}
	return entradas
}

func imprimirWindows(nombre string, datos []byte) error {
	nombrePtr, err := syscall.UTF16PtrFromString(nombre)
	if err != nil {
		return err
	}

	var h syscall.Handle
	r1, _, e := procOpenPrinter.Call(
		uintptr(unsafe.Pointer(nombrePtr)),
		uintptr(unsafe.Pointer(&h)), 0)
	if r1 == 0 {
		return fmt.Errorf("no se pudo abrir la impresora %q: %v (¿el nombre es exacto?)", nombre, e)
	}
	defer procClosePrinter.Call(uintptr(h))

	docName, _ := syscall.UTF16PtrFromString("KIKU Print")
	datatype, _ := syscall.UTF16PtrFromString("RAW")
	di := docInfo1{pDocName: docName, pDatatype: datatype}

	r1, _, e = procStartDocPrinter.Call(uintptr(h), 1, uintptr(unsafe.Pointer(&di)))
	if r1 == 0 {
		return fmt.Errorf("no se pudo iniciar el documento en %q: %v", nombre, e)
	}
	defer procEndDocPrinter.Call(uintptr(h))

	r1, _, e = procStartPagePrinter.Call(uintptr(h))
	if r1 == 0 {
		return fmt.Errorf("no se pudo iniciar la página en %q: %v", nombre, e)
	}
	defer procEndPagePrinter.Call(uintptr(h))

	var escritos uint32
	r1, _, e = procWritePrinter.Call(uintptr(h),
		uintptr(unsafe.Pointer(&datos[0])), uintptr(len(datos)),
		uintptr(unsafe.Pointer(&escritos)))
	if r1 == 0 {
		return fmt.Errorf("error escribiendo a %q: %v", nombre, e)
	}
	if int(escritos) != len(datos) {
		return fmt.Errorf("escritura incompleta a %q: %d de %d bytes", nombre, escritos, len(datos))
	}
	return nil
}

func utf16aString(p *uint16) string {
	if p == nil {
		return ""
	}
	var chars []uint16
	for ptr := unsafe.Pointer(p); ; ptr = unsafe.Pointer(uintptr(ptr) + 2) {
		c := *(*uint16)(ptr)
		if c == 0 {
			break
		}
		chars = append(chars, c)
	}
	return syscall.UTF16ToString(chars)
}
