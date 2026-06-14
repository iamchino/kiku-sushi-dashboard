package main

// appVersion es la versión de ESTE binario. El auto-updater la compara contra
// la versión publicada en el manifiesto remoto. Subila cada vez que generes un
// release nuevo (y también en versioninfo.json para que coincida en Windows).
//
// Formato: "MAJOR.MINOR.PATCH" (semver simple, sin sufijos).
const appVersion = "1.1.0"

// updateManifestURL apunta al JSON de release publicado en el Storage de
// Supabase (bucket público "gg-ez-print"). El binario hace un GET a esta URL
// al arrancar y cada updateCheckInterval para saber si hay una versión nueva.
//
// Estructura esperada del JSON (ver update.go -> updateManifest):
//
//	{
//	  "version": "1.2.0",
//	  "url":     "https://.../storage/v1/object/public/gg-ez-print/gg-ez-print-1.2.0.exe",
//	  "sha256":  "<hash hex del .exe>",
//	  "notes":   "Arregla impresión de QR fiscal",
//	  "mandatory": false
//	}
//
// Para DESACTIVAR el auto-update (ej. en desarrollo), dejá esta constante vacía.
const updateManifestURL = "https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/gg-ez-print/latest.json"

// updateCheckInterval: cada cuánto se vuelve a chequear el manifiesto mientras
// la app está corriendo (además del chequeo al arrancar).
const updateCheckIntervalHours = 6
