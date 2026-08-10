# Por qué la impresora imprime `{{QR}}` como texto — y cómo arreglarlo

## El diagnóstico

El QR fiscal funciona así: el dashboard **no** genera el QR — deja un marcador
`{{QR}}` en el ticket y manda la URL de ARCA aparte (`qr_code_data`). GG EZ
Print, en la compu del local, reemplaza el marcador por el QR dibujado en
comandos de impresora (ESC/POS raster).

El código fuente que hace ese reemplazo está en este repo desde el 1 de julio
(`printers.go`), y hasta maneja el caso de error para nunca imprimir el
marcador crudo. **Pero el `.exe` committeado es del 15 de junio** — anterior a
ese código. El programa que corre en el local no conoce el marcador, así que
lo imprime tal cual: `{{QR}}`.

En resumen: el fuente está bien, **falta recompilar y reinstalar el exe**.

## Cómo actualizar (en la compu del local, Windows)

Necesita tener Go instalado (gratis, 2 minutos): https://go.dev/dl/ → bajar el
instalador de Windows → siguiente, siguiente, listo.

Después, en la carpeta `gg-ez-print` del repo:

1. **Cerrar el GG EZ Print que está corriendo**: ícono de la impresora en la
   bandeja (al lado del reloj) → click derecho → salir. Si no aparece,
   Administrador de tareas → `gg-ez-print.exe` → finalizar tarea.
2. Doble click en **`build.bat`**. Compila y deja un `gg-ez-print.exe` nuevo
   en la misma carpeta. (Si es la primera vez, instala solo una herramienta
   extra; dejalo terminar.)
3. Si el exe que corre en el local está en OTRA carpeta (por ejemplo
   `C:\gg-ez-print\`), copiá el `gg-ez-print.exe` nuevo encima del viejo.
4. Abrir el `gg-ez-print.exe` nuevo. Listo — arranca con Windows como siempre.

## Cómo verificar que quedó bien

1. En la consola negra que abre GG EZ Print, la primera línea tiene que decir
   **`v1.1.0`** (o mayor). Si no muestra versión, sigue corriendo el viejo.
2. Facturá un ticket de prueba desde el dashboard. En la consola tiene que
   aparecer **`QR generado OK (datos len=…)`**.
3. En el papel: el QR dibujado, sin `{{QR}}` por ningún lado.

Si en la consola aparece *"el ticket tiene {{QR}} pero NO llegó qr_code_data"*,
el exe ya es el nuevo pero el dashboard está desactualizado: recargá la página
del dashboard con Ctrl+Shift+R.

## Para la próxima

Cada build que se instale en el local tiene que subir el número de
`appVersion` en `main.go` (y idealmente `versioninfo.json`). Es la única
manera de saber qué versión está corriendo cuando algo falla. Este bug fue
exactamente eso: dos semanas de diferencia entre el fuente y el binario, y
nada que lo delatara.
