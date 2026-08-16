# Checklist: instalar el sistema para un cliente nuevo

Objetivo: de cero a local operando en un día de trabajo. Cada cliente tiene su
propia instancia (su base Supabase + su deploy), aislada de las demás.

## Requisitos previos (una sola vez, del lado nuestro)

- [ ] `provision/esquema_base.sql` actualizado: correr el workflow **dump-esquema**
      (GitHub → Actions) después de cualquier cambio grande de esquema.
- [ ] Tener a mano este repo y el de la web pública.

## 1. Base de datos (Supabase)

- [ ] Crear proyecto nuevo en supabase.com (región `sa-east-1`, San Pablo).
- [ ] SQL Editor → correr en orden: `provision/esquema_base.sql`, después
      `provision/datos_catalogo.sql`, y por último `provision/CONFIGURAR-CLIENTE.sql`
      **editado antes** con los datos del cliente (email admin, nombre, color).
- [ ] Storage → crear bucket `menu-images` (público) — las policies ya vienen
      en el esquema.
- [ ] Authentication → crear el primer usuario (el dueño / admin) con email y
      contraseña. Anotar el UUID.
- [ ] Database → Webhooks → si van a usar push de pedidos: webhook sobre
      `pedidos` (INSERT y UPDATE) → Edge Function `push-pedidos`.

## 2. Edge Functions

- [ ] Deployar `admin-usuarios` y `arca-comprobantes` (y `push-pedidos` si
      aplica) en el proyecto nuevo, con sus secrets:
      - `arca-comprobantes`: certificado y clave ARCA **del cliente** (los
        gestiona su contador; emiten bajo su CUIT).
      - `push-pedidos`: `FCM_SERVICE_ACCOUNT` (opcional).

## 3. Front (Vercel)

- [ ] Fork/copia del repo del dashboard para el cliente (o mismo repo, proyecto
      Vercel nuevo con branch propio — decidir según cliente).
- [ ] Proyecto nuevo en Vercel apuntando a ese repo, con las env vars
      `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` del proyecto nuevo.
- [ ] Dominio: `cliente.tudominio.com` (o dominio propio del cliente).
- [ ] Web pública: solo si el cliente la contrata; mismo procedimiento con el
      repo de la web.

## 4. Configuración dentro del sistema

- [ ] Entrar con el usuario admin → Ajustes → Configuración:
      impresoras (ComanderaPrint), ancho de papel, caracteres por línea.
- [ ] Personal → Permisos: revisar la matriz por rol (viene con los defaults).
- [ ] Cargar carta, recetas y stock inicial (o importarlos — servicio de
      implementación).
- [ ] Datos fiscales del cliente (razón social, CUIT, punto de venta) en la
      config de facturación.

## 5. Puente de impresión

- [ ] En la PC del local: descargar el exe desde el dashboard del cliente
      (link "Descargar" en Configuración → Impresoras — sale de su propio
      deploy, `/descargas/ComanderaPrint.exe`).
- [ ] `config.json`: **cambiar `update_url`** al dominio del cliente
      (`https://cliente.tudominio.com/descargas/comandera-print-version.json`)
      para que se auto-actualice desde su instancia.
- [ ] Certificados en PC y celulares (instrucciones en `comandera-print/INSTRUCCIONES.md`).
- [ ] Acceso directo en `shell:startup`.

## 6. Backups y cierre

- [ ] En el repo del cliente: secret `DATABASE_URL` + verificar que el workflow
      **backup-diario** corre (Actions → Run workflow la primera vez).
- [ ] Imprimir factura de prueba con QR y escanearla.
- [ ] Fichaje de prueba con el QR del local.
- [ ] Entregar el manual de uso (`docs/MANUAL-DE-USO.md`) y el contacto de soporte.

## Pendientes conocidos del producto (no bloquean pilotos)

- Renombre de marca (elegir nombre → renombrar "Comandera Print", textos y repos).
- Asistente de onboarding dentro del sistema (hoy: este checklist + SQL Editor).
- Multi-tenant real (hoy: una instancia por cliente, que para <15 clientes es
  más simple y más aislado).
