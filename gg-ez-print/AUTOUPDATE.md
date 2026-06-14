# Auto-update de GG EZ Print

Desde la versión **1.1.0**, el binario se actualiza solo. Ya no hay que ir a cada
local a copiar el `.exe` a mano.

## Cómo funciona

1. El binario tiene su versión embebida en `version.go` (`appVersion`).
2. Al arrancar (con ~20s de gracia) y luego cada **6 horas**, consulta un
   manifiesto JSON publicado en el Storage de Supabase:

   ```
   https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/gg-ez-print/latest.json
   ```

3. Si la `version` del manifiesto es mayor que la instalada, descarga el `.exe`
   nuevo, verifica el **SHA256**, hace el swap y se reinicia solo.
4. En Windows no se puede borrar un `.exe` en uso, así que el viejo se renombra a
   `gg-ez-print.exe.old` y se elimina en el siguiente arranque.

También hay un botón **"Buscar actualizaciones"** en el menú de la bandeja para
forzar el chequeo en el momento, y un renglón **"Versión: X.Y.Z"** que muestra la
instalada.

> Para **desactivar** el auto-update (por ejemplo en una PC de desarrollo), dejá
> `updateManifestURL` vacío en `version.go` y recompilá.

## Publicar una versión nueva (flujo de release)

Cada vez que cambies el código del servicio:

### 1. Subí la versión

- En `version.go`: subí `appVersion` (ej. `"1.1.0"` → `"1.2.0"`).
- En `versioninfo.json`: actualizá `FileVersion`, `ProductVersion` y los strings
  para que coincidan.

> Importante: el auto-update sólo dispara si la versión del manifiesto es
> **mayor** que `appVersion` del binario que está corriendo. Si no la subís, no
> se actualiza nunca.

### 2. Compilá

```bat
build.bat
```

Esto genera `gg-ez-print.exe`.

### 3. Calculá el SHA256 del `.exe`

En PowerShell:

```powershell
Get-FileHash .\gg-ez-print.exe -Algorithm SHA256 | Select-Object -ExpandProperty Hash
```

(en minúsculas o mayúsculas da igual, la comparación no distingue caso).

### 4. Subí el `.exe` al bucket `gg-ez-print` de Supabase Storage

- Bucket: **`gg-ez-print`** (debe ser **público**).
- Subí el binario con un nombre versionado, por ejemplo
  `gg-ez-print-1.2.0.exe` (así no pisás el anterior y podés volver atrás).

> Crear el bucket una sola vez: Supabase → Storage → New bucket → nombre
> `gg-ez-print`, marcar **Public bucket**.

### 5. Actualizá `latest.json` y subilo al mismo bucket

Tomá `latest.example.json` como plantilla:

```json
{
  "version": "1.2.0",
  "url": "https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/gg-ez-print/gg-ez-print-1.2.0.exe",
  "sha256": "<hash del paso 3>",
  "notes": "Qué cambió en esta versión",
  "mandatory": false
}
```

Subilo al bucket con el nombre **`latest.json`** (pisando el anterior — este sí se
sobreescribe). Si Supabase cachea el archivo, podés invalidarlo desde el panel o
esperar a que expire el cache.

### 6. Listo

En la próxima ventana de chequeo (o cuando alguien toque "Buscar
actualizaciones"), todos los locales se actualizan solos y se reinician.

## Orden recomendado al publicar

Subí **primero el `.exe`** y **después el `latest.json`**. Si publicás el manifiesto
antes que el binario, un cliente podría intentar descargar una URL que todavía no
existe (falla sin romper nada: reintenta en el próximo chequeo, pero es prolijo
evitarlo).

## Seguridad

- La descarga es por HTTPS y se verifica el **SHA256** contra el manifiesto, así
  que un `.exe` corrupto o cambiado en tránsito se rechaza.
- El bucket es público sólo de lectura; nadie externo puede pisar tu `latest.json`
  ni tus binarios (eso requiere tu service key).
- Sólo se descarga desde la URL del manifiesto que vos controlás.

## Diagnóstico remoto de versión

Además del auto-update, el servicio ahora responde al mensaje WebSocket
`{ "action": "version" }` con:

```json
{ "type": "version", "version": "1.1.0", "qr_supported": true }
```

Desde el dashboard podés llamar `printerClient.getVersion()` para saber qué
versión corre en un local sin ir físicamente — útil, por ejemplo, para confirmar
si un local tiene una versión vieja que no imprime el QR.
