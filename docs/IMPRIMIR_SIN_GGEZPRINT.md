# Imprimir sin gg-ez-print (directo desde el navegador)

El navegador ya imprime el ticket **perfecto y con QR**. Con esta configuración
sacamos el programa `gg-ez-print` del medio: el dashboard imprime directo en la
térmica, sin el cartel de "Guardar como PDF" y **sin depender de la IP, el
certificado, ni actualizaciones del `.exe`**.

Se hace **una sola vez** en la PC de caja.

---

## Paso 1 — Poner la impresora térmica como predeterminada en Windows

1. Abrí **Configuración de Windows** → **Bluetooth y dispositivos** → **Impresoras y escáneres**.
2. Tocá tu impresora térmica → **Establecer como predeterminada**.
3. Si aparece la opción **"Permitir que Windows administre mi impresora predeterminada"**, **desactivala** (así Windows no te la cambia solo).
4. Entrá a **Preferencias de impresión** de esa impresora y verificá:
   - **Tamaño de papel**: el de tu modelo (58 mm o 80 mm).
   - **Márgenes**: al mínimo.
   - **Corte de papel**: activado (si el driver lo ofrece).

## Paso 2 — Poner Chrome en modo "impresión directa"

Esto hace que, al imprimir, vaya directo a la impresora **sin mostrar el cartel**.

1. Cerrá todas las ventanas de Chrome.
2. Click derecho en el **acceso directo de Chrome** → **Propiedades**.
3. En el campo **"Destino"**, al final de todo (después de las comillas), dejá un espacio y agregá:

   ```
   --kiosk-printing
   ```

   Queda algo así:

   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing
   ```

4. **Aceptar**.
5. De ahora en más, abrí Chrome **siempre desde ese acceso directo**.

## Paso 3 — Sacar gg-ez-print del dashboard

1. En el dashboard, andá a **Configuración → Impresoras**.
2. **Borrá la dirección** del "Servidor GG EZ Print" (dejá el campo **vacío**).
3. **Guardar**.

Con el campo vacío, el dashboard deja de intentar el programa y imprime siempre
por el navegador.

## Paso 4 — Cerrar gg-ez-print (ya no se usa)

1. En la bandeja del sistema (al lado del reloj), click derecho en el **ícono de la impresora** → **Salir**.
2. Opcional: sacalo del inicio automático de Windows para que no vuelva a abrirse.

---

## Probar

Facturá una **factura de prueba**. Tiene que salir **directo en la térmica, con el QR**, sin cartel.

## Si algo sale raro

- **El ticket sale cortado o con el ancho mal** → es un ajuste chico en el diseño del ticket (código). Avisá el modelo de impresora y el ancho (58 u 80 mm) y se deja clavado.
- **No corta el papel solo** → se activa el corte automático en las Preferencias de impresión del driver.
- **Vuelve a aparecer el cartel** → verificá que abriste Chrome desde el acceso directo con `--kiosk-printing`.

## Ventajas de este método

- El **QR sale siempre** (se imprime como imagen).
- **No importa si cambia la IP** de la PC.
- **No hay certificado** que instalar en ningún dispositivo.
- **No hay `.exe`** que actualizar ni mantener.
