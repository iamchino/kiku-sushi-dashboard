# 🖨 Comandera Print — puente de impresión propio

Reemplaza a GG EZ Print. Habla **exactamente el mismo protocolo**, así que el
dashboard no necesita cambios: misma IP, mismo puerto (8443), misma config.

**Por qué no falla el QR**: GG EZ Print usaba el comando QR *nativo* de la
impresora, que anda o no según el modelo y firmware — por eso "a veces sí, a
veces no". Comandera Print dibuja el QR como **imagen** (píxeles): cualquier
impresora térmica ESC/POS imprime imágenes, siempre. Y si no llegan los datos
del QR, elimina el marcador — jamás imprime el literal `{{QR}}`.

**Se compila y actualiza solo**: cada push a este repo que toque `comandera-print/`
hace que GitHub Actions compile el `.exe` y lo publique en el deploy del
dashboard. El programa instalado en el local chequea al arrancar y cada 6
horas, y se actualiza sin que nadie toque nada.

---

## Instalación en el equipo de KIKU (una sola vez)

### 1. Descargar
En la PC del local, abrí el dashboard → **Ajustes → Configuración → Impresoras**
→ link **"Descargar Comandera Print"** (o directo:
`https://kiku-sushi-dashboard.vercel.app/descargas/ComanderaPrint.exe`).
Guardalo en una carpeta fija, por ejemplo `C:\ComanderaPrint`.

### 2. Primer arranque
Doble click en `ComanderaPrint.exe`:
- Windows Firewall pregunta → **"Permitir acceso"** (redes privadas).
- Se generan los certificados y el archivo **`INSTALAR-ESTE-CERTIFICADO.crt`**.
- La consola muestra la IP, ej: `Escuchando en https://192.168.0.10:8443`.
  **Anotá esa IP.**

### 3. Instalar el certificado (una vez por dispositivo)
El dashboard es https y el navegador solo habla con el puente si confía en su
certificado (mismo trámite que ya hicieron con GG EZ Print):

**PC del local**: doble click en `INSTALAR-ESTE-CERTIFICADO.crt` → Instalar
certificado → **Equipo local** → "Colocar todos los certificados en el
siguiente almacén" → Examinar → **Entidades de certificación raíz de
confianza** → Finalizar.

**Cada celular (Android)**: en el navegador del celu abrí
**`http://LA-IP:8442`** (con http, SIN s — ej: `http://192.168.0.10:8442`).
Aparece un botón verde **"Descargar certificado"**: bajalo y abrilo. Si no se
instala solo: Configuración → Seguridad → **Instalar certificados desde el
almacenamiento** → elegí el archivo → tipo **"Certificado de CA"**.

**Prueba**: en cada dispositivo abrí `https://LA-IP:8443`. Si aparece
"Comandera Print funcionando" **con candado y sin advertencia**, está listo.

### 4. Conectar el dashboard
Ajustes → Configuración → Impresoras → servidor = la IP del paso 2 (si ya
estaba esa IP, no tocás nada) → "Conectar y listar" → asigná comanda/ticket/
fiscal (impresoras de red: tipo **Network** + IP de la impresora).
Imprimí una factura de prueba: **el QR sale siempre**.

### 5. Arranque automático
`Win + R` → `shell:startup` → Enter → click derecho → Nuevo → **Acceso
directo** → `C:\ComanderaPrint\ComanderaPrint.exe` → Finalizar.

### 6. Sacar GG EZ Print de raíz
Cerralo, borrá su acceso directo de `shell:startup` y borrá su carpeta.

---

## Si algo no anda

| Síntoma | Solución |
|---|---|
| "Nadie responde en X.X.X.X" (timeout) | En esa IP no hay ningún Comandera Print. Casi siempre la PC cambió de IP: mirá la ventana negra, dice "Escuchando en https://IP:8443", y poné esa IP en el dashboard ("Cambiar dirección" en el aviso rojo). Al arrancar, el programa avisa si la IP cambió respecto a la vez anterior. Ideal: IP fija desde el router (ver abajo). |
| "respondió pero el navegador no aceptó la conexión" | El certificado falta en ESE dispositivo → paso 3; probá `https://IP:8443` en su navegador. |
| Las comandas salen con letra chica | El dashboard no pudo hablar con Comandera Print e imprimió por el diálogo de Windows (plan B). Es el síntoma de alguno de los dos puntos de arriba. |
| La ventana se abre y se cierra sola | Ya hay otra copia abierta (desde v1.0.11 la ventana lo dice y espera Enter). Si la otra copia anda, no hay que hacer nada. |
| Cambió la IP de la PC | Cerrá y abrí ComanderaPrint.exe (regenera el certificado del servidor; el `.crt` instalado sigue valiendo). Actualizá la IP en el dashboard. Si el dashboard se usa en la MISMA PC, desde v1.0.11 del dashboard se conecta solo por 127.0.0.1 aunque la IP haya cambiado (los celulares no). |
| No imprime la USB | El nombre debe ser EXACTO al de Windows. Elegilo de la lista del dashboard, no lo escribas. |
| No imprime la de red | Verificá la IP de la impresora (autotest). Puerto 9100. |
| Tildes raras | En `config.json` cambiá `"acentos": "cp858"` por `"ascii"` y reiniciá. |
| Letra muy chica o muy grande | En `config.json`: `"texto"` puede ser `"normal"`, `"alto"` (default) o `"grande"`, y `"negrita"` `"si"`/`"no"`. Reiniciá el programa. |
| ¿Qué pasó con una impresión? | Está todo en `comandera-print.log`, con fecha y motivo. |

---

## IP fija para la PC (para que no vuelva a pasar)

El router reparte direcciones al azar dentro de un rango; con el tiempo la PC
puede recibir otra y el dashboard sigue buscando la vieja. Dos formas de fijarla,
con una alcanza:

**A. Desde Windows (más fácil, no hace falta la clave del router)**
Configuración → Red e Internet → Wi-Fi → la red del local → "Asignación de IP"
→ Editar → Manual → IPv4 activado → IP `192.168.100.200`, máscara `255.255.255.0`
(o longitud de prefijo `24`), puerta de enlace `192.168.100.1`, DNS `8.8.8.8` →
Guardar. Verificá que `ipconfig` en un CMD muestre esa IP y que el wifi siga
andando.

**B. Desde el router ("reserva DHCP")**
Entrar a `http://192.168.100.1` con la clave del router → buscar DHCP →
"Reserva de direcciones" / "Address reservation" / "Static lease" → agregar la
MAC de la PC (en CMD: `ipconfig /all`, "Dirección física" del adaptador Wi-Fi)
con la IP `192.168.100.200` → guardar. A partir de ahí el router siempre le da
esa IP a esa PC.

---

## Para desarrollo

- El código vive en `comandera-print/` del repo del dashboard. Cualquier push que
  lo toque dispara `.github/workflows/comandera-print.yml`: compila, y commitea el
  exe en `public/descargas/` (Vercel lo sirve).
- **Importante**: para que los equipos se actualicen hay que subir el número
  de `const version` en `main.go` en cada cambio — el auto-update compara esa
  versión contra `comandera-print-version.json`.
- Compilar a mano (opcional): instalar Go y correr `build.bat`.
