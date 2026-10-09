# Cola de impresión — los celulares imprimen por la PC

## El problema que resuelve

Comandera Print corre en la PC del local y escucha en la red interna
(`https://192.168.x.x:8443`). Un celular solo llega ahí si está en el mismo
wifi, con el certificado instalado y sin firewall en el medio. Cuando falla
cualquiera de las tres cosas, antes el celular caía al diálogo de impresión
del navegador (inútil en un celular).

## Cómo funciona ahora

0. **Nadie usa la IP de red.** Cada dispositivo prueba Comandera Print en su
   propia máquina (`127.0.0.1:8443`, `HOST_PC` en `printerClient.js`). En la
   PC del local conecta y queda mantenida; en un celular falla al instante y
   en silencio. No hay banner rojo, ni campo de dirección, ni certificado en
   los celulares. `server_host` en `impresion_config` ya no se usa.
1. Un dispositivo que no es esa PC deja el ticket directo en la tabla
   `cola_impresion` (sin intentar nada) y muestra un aviso flotante:
   "Enviado a la PC del local, esperando que lo imprima…" que después cambia
   a "Impreso" / "Error". En la PC, si Comandera Print respondió pero la
   impresora dio error (sin papel), no se encola: la cola no ayudaría.
2. La PC (cualquier dispositivo con el dashboard **conectado** a Comandera
   Print) está suscripta por realtime a esa tabla y lo imprime.
3. **Por defecto imprime solo**, sin tocar nada: muestra un cartelito
   "Impreso desde un celular" y listo. El pop-up grande (con sonido) aparece
   únicamente si un ticket falló (Reintentar / Descartar). Si en una PC se
   destilda "Imprimir automáticamente en esta PC" (se guarda en esa PC,
   `localStorage` `kiku.cola.auto = 0`), cada ticket pide confirmar con un
   botón **Imprimir**.
4. Dos PCs con el dashboard abierto no imprimen el mismo ticket: antes de
   imprimir se "toma" (`estado = imprimiendo`) con una condición en el
   update; solo una gana.
5. Un ticket en `imprimiendo` hace más de 60 s (la PC se cerró a mitad)
   vuelve a ofrecerse. Los de más de 15 minutos se consideran vencidos y no
   se muestran (evita una ráfaga de comandas viejas cuando vuelve la PC).
   Los errores recientes quedan en el pop-up con **Reintentar**.
6. La tabla se limpia sola: al insertar se borran los de más de 7 días.

## Archivos

- `supabase/migrations/20261009000000_cola_impresion.sql` (= SQL-CIERRES 36):
  tabla, RLS (cualquier usuario con rol inserta a su nombre, ve y resuelve),
  realtime, limpieza.
- `src/lib/colaImpresion.js`: encolar, esperar resultado, pendientes, tomar,
  resolver, reabrir.
- `src/lib/printing.js` → `tryRemotePrint()` devuelve `'remote' | 'cola' | false`.
- `src/components/impresion/ColaImpresionPopup.jsx`: el pop-up de la PC.
- `src/components/impresion/ColaImpresionAvisos.jsx`: el aviso flotante del
  celular que mandó el ticket.

## Para desactivar la cola en un dispositivo

En la consola del navegador: `localStorage.setItem('kiku.cola.deshabilitada','1')`.
Vuelve al comportamiento anterior (diálogo del navegador).
