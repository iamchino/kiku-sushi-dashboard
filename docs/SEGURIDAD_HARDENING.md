# Comandera / Kiku Sushi — Hardening y plan de cumplimiento

**Versión 1.0 · 1 de noviembre de 2026.** Marcos de referencia: SOC 2 (Trust Services Criteria 2017, rev. 2022), ISO/IEC 27001:2022 (Anexo A), ISO/IEC 27701:2019 (privacidad, como responsable y encargado) y CIS Controls v8 (Grupo de Implementación 1). Legislación aplicable: Ley 25.326 de Protección de Datos Personales (Argentina) y normativa fiscal (ARCA).

Objetivo: dejar el sistema en condiciones de venderse a otros locales (**Comandera**) con evidencia de seguridad y privacidad, usando Kiku Sushi como cliente 0. Este documento es el estado real al 01/11/2026, lo que se corrigió ese día y el plan para lo que falta. Se actualiza con cada cambio; la fecha de arriba es la última revisión.

---

## 1. Alcance y arquitectura

| Componente | Qué es | Dónde corre | Datos que maneja |
|---|---|---|---|
| **Dashboard** (`kiku-sushi-dashboard`) | Panel interno: caja, facturación ARCA, pedidos, cocina, stock, personal, finanzas | Vercel (estático) | Todo: clientes, empleados (sueldos, CBU), comprobantes, pagos |
| **Web pública** (`kiku-sushi-web`) | kikusushi.ar: reservas, lista de espera, pedidos online | Vercel (estático) | Nombre, teléfono, email, dirección, restricciones alimentarias |
| **Supabase** (proyecto `sepyieuxsmxhzobtmzxb`) | Postgres + Auth + Storage + Edge Functions + Realtime | AWS, región del proyecto | La base entera; secretos en `private.config` y Edge Secrets |
| **Edge Functions** | `admin-usuarios`, `arca-comprobantes`, `push-web`, `push-pedidos` | Supabase (Deno) | Usuarios, facturación (certificado ARCA), notificaciones |
| **Comandera Print** | Programa Go en la PC del local: imprime tickets | PC "noeli" (Windows) | Contenido de tickets (no lo guarda) |
| **GitHub** (`iamchino/*`) | Código, CI (build de Comandera Print, backup diario, dump de esquema) | GitHub Actions | Backups de la base (artefactos) |
| **Terceros** | Vercel, Supabase, GitHub, Meta (píxel), ARCA (WSFE), WhatsApp/Wasender, Google Fonts | — | Ver §7 |

Usuarios del dashboard: cuentas internas (no Google), roles `admin`, `finanzas`, `cocina`, `mozo`, `empleado` + los creados en Permisos. Entran desde Chrome en celulares y desde la PC del local.

---

## 2. Cómo leer la matriz

Estado: ✅ cubierto · 🟡 parcial · ❌ falta · ⚙️ corregido en el parche del 01/11 (queda ✅ al aplicarlo). "Evidencia" dice dónde está el control (archivo, migración, pantalla). "Fase" remite al plan de §5.

Mapeo abreviado: **CC** = SOC 2 Common Criteria; **A.x** = ISO 27001:2022 Anexo A; **27701** = cláusulas de ISO 27701; **CIS** = CIS Controls v8.

---

## 3. Matriz de controles

### 3.1 Gobierno, políticas y riesgo (CC1, CC2, CC3 · A.5.1–5.4, A.5.7, A.5.36 · CIS 17)

| Control | Estado | Evidencia / hallazgo | Acción | Fase |
|---|---|---|---|---|
| Política de seguridad aprobada y comunicada | ❌ | No existe formalmente; las reglas viven en `CONTEXTO.md` | Adoptar el Anexo A de este doc como política v1, firmada por el responsable (Manu) y la dueña del local | 2 |
| Roles y responsabilidades de seguridad | 🟡 | De hecho: Manu (admin del sistema), finanzas (operación), dueña (negocio) | Escribirlo en la política; nombrar responsable de privacidad (27701 §5.3) | 2 |
| Evaluación de riesgos documentada | ❌ | Esta auditoría es la primera | Mantener §4 como registro de riesgos; revisar cada 6 meses | 2 |
| Inventario de activos (sistemas, datos, proveedores) | ⚙️ | §1 y §7 de este documento | Mantener al día cuando se sume un proveedor o un local | 2 |
| Gestión de cambios documentada | ✅ | `CONTEXTO.md` §"Cómo se trabaja": parche → verificación (build, tests, `verificar:permisos`, Postgres local) → `git am` → push → Vercel. Commits trazables | Formalizar en política (Anexo A.3); exigir revisión humana para cambios de permisos/facturación | 2 |
| Capacitación del personal | ❌ | — | Charla de 30 min al equipo: contraseñas, no compartir usuarios, qué hacer ante algo raro; registro de asistencia | 2 |

### 3.2 Control de acceso e identidad (CC6.1–6.3 · A.5.15–5.18, A.8.2–8.5 · CIS 5, 6)

| Control | Estado | Evidencia / hallazgo | Acción | Fase |
|---|---|---|---|---|
| Autenticación con usuario individual | ✅ | Supabase Auth, un login por persona (Equipo → Usuarios) | Prohibir en la política compartir logins; revisar que cocina/mozos no usen uno común | 1 |
| Autorización por rol + matriz de permisos en la base | ✅ | `roles`, `recursos`, `rol_permisos`, `recurso_tablas`; `tiene_permiso()` / `puede_tabla()` en RLS (migración 20260803 y siguientes) | — | — |
| RLS en todas las tablas | ✅ | 58/58 tablas del dump + las 5 nuevas (auditoría 01/11) | — | — |
| Policies que esquivan la matriz | ⚙️ | 13 policies `auth.role() = 'authenticated'` FOR ALL (`clientes`, `stock`, `recetas`, tablas legacy…) | **SQL 51** las reemplaza por la matriz (legacy → solo admin). Correr con el diagnóstico 49 en verde | 0 |
| Acceso anónimo mínimo (web pública) | ⚙️ | Capa 1 (07/10) dejó 10 tablas SELECT + 4 RPC. Default privileges seguían dando EXECUTE a anon; `registrar_pago`/`editar_pago` quedaron abiertas (con guarda interna) | **SQL 50**: default privileges revocados, funciones cerradas, `crear_reserva`/`crear_lista_espera` endurecidas | 0 |
| 2FA para roles privilegiados | 🟡 | Implementado (capa 2, 07/10) y **desactivado por los directivos el 08/10** (SQL 35). Queda el cierre por inactividad (7 días) y el registro de accesos | Decisión de negocio: SOC 2 e ISO esperan MFA para admin. Propuesta: reactivar solo para `admin` y `finanzas` (2 personas), con TOTP en el celular de cada uno | 1 |
| Política de contraseñas | 🟡 | Mínimo 8 caracteres (Edge `admin-usuarios`); Supabase permite subirlo | Supabase → Auth → mínimo 10 + "leaked password protection" ON; política: no reutilizar | 1 |
| Revisión periódica de accesos | ❌ | Panel "Últimos accesos" existe (`AccesosPanel`), nadie lo revisa con regularidad | Revisión trimestral: lista de logins vs. personal activo; baja inmediata al desvincular (procedimiento en Anexo A.2) | 2 |
| Separación admin / finanzas en la Edge `admin-usuarios` | 🟡 | `finanzas` puede crear admins, resetear contraseñas y 2FA de cualquiera (= admin en la práctica). Decisión de Manu: finanzas es su cuenta operativa | Aceptado y documentado como riesgo; revisar si Comandera se vende (en un cliente nuevo, finanzas no debería administrar logins) | 2 |
| Signup público cerrado | 🟡 | Un escáner creó un login el 10/09 (`bee@…oastify.com`); desde SQL 41 un login sin rol no ve nada | Supabase → Auth → Providers → Email → **"Allow new users to sign up" OFF** (pendiente de confirmar) | 1 |
| Llave de emergencia | 🟡 | `es_admin_permisos_de_emergencia()` con email `finanzas@kikusushi.com.ar` hardcodeado, sin 2FA | Mantener (es el "break-glass"), pero esa cuenta tiene que tener 2FA y contraseña larga guardada en gestor | 1 |
| Sesiones | ✅ | Cierre por inactividad 7 días (12 h si 2FA); tokens solo en header; sin tokens en URL | Al reactivar 2FA, admin/finanzas pasan a 12 h | 1 |

### 3.3 Seguridad de aplicaciones y desarrollo seguro (CC8.1 · A.8.25–8.29, A.8.31 · CIS 16)

| Control | Estado | Evidencia / hallazgo | Acción | Fase |
|---|---|---|---|---|
| Cabeceras HTTP de seguridad | ⚙️ | Tenían `nosniff`, `X-Frame-Options`; faltaban **CSP** y **HSTS** | `vercel.json` de ambas apps: CSP estricta (`script-src 'self'`), HSTS 2 años + preload, COOP, Permissions-Policy. Verificado con Playwright: 0 violaciones en 14 pantallas | 0 |
| Sin scripts inline / eval | ⚙️ | Píxel de Meta inline en la web; popup del QR con `onload=` en el dashboard | Píxel → `/pixel.js`; popup armado por DOM; no hay `eval`/`dangerouslySetInnerHTML` activo | 0 |
| XSS en Comandera Print | ⚙️ | `data` y errores sin escapar en páginas de prueba | `html.EscapeString` | 0 |
| Validación de entrada en RPC públicas | ⚙️ | `crear_lista_espera` sin límites ni fechas; `crear_reserva` aceptaba `p_origen='dashboard'` desde la web | SQL 50: largos, fechas, origen forzado, freno 5/10 min | 0 |
| Precio del lado del servidor | 🟡 | `crear_pedido_web` usa el precio del menú si hay `menu_item_id`; ítems sin id usan el precio del navegador | Rechazar ítems sin `menu_item_id` (cambio chico en la RPC) | 1 |
| Dependencias con vulnerabilidades | 🟡 | `npm audit` 01/11: dashboard 25 (2 críticas: `@capacitor/android`, `tar`), web 29 (críticas solo en dev: `vitest`). En producción pesan `react-router`, `@capacitor/android`, `xlsx` (sin fix en npm) | `npm audit fix` sin `--force` en ambos (fase 1); `xlsx` → `exceljs` o tarball 0.20 de SheetJS (fase 2); Dependabot ON | 1–2 |
| Logs sin datos personales | ⚙️ | `console.log` con nombre de cliente y `qr_url` (CUIT, importe) | Quitados; `console.log`/`debug` se eliminan del build (esbuild `pure`) | 0 |
| CORS de Edge Functions | ⚙️ | `*` | Lista `ALLOWED_ORIGINS` (configurar en Edge Secrets) | 0 |
| Secretos fuera del código | ✅ | `.env.example` sin valores; secretos en Supabase Secrets y GitHub Secrets; auditoría de `git log -p` sin claves | Rotar el PAT de GitHub y las claves que `docs/SEGURIDAD_CAPA2.md` reporta filtradas, si no se hizo | 1 |
| Revisión de código | 🟡 | Claude escribe y verifica; Manu aplica. No hay segunda persona | Para cambios en permisos, facturación o pagos: checklist de revisión en el PR (Anexo A.3) | 2 |

### 3.4 Infraestructura, red y endpoints (CC6.6–6.8 · A.8.1, A.8.7–8.9, A.8.20 · CIS 1, 4, 9, 10, 12)

| Control | Estado | Evidencia / hallazgo | Acción | Fase |
|---|---|---|---|---|
| Comandera Print expuesto a la red | ⚙️ | Escuchaba en `0.0.0.0:8443/8442`, sin auth, origen libre, SSRF a cualquier host, update sin firma | 1.0.13: solo `127.0.0.1` (config `escuchar_en_red`), origen permitido, impresoras solo en LAN:9100, sha256 del exe, sin downgrade, log rotado | 0 |
| CA propia instalada en dispositivos | 🟡 | `ca-key.pem` en la carpeta del exe, sin name constraints. Con el modelo 09/10 (todo por 127.0.0.1) los celulares ya no la necesitan | Desinstalar la CA de los celulares; en la PC, mover `certificados/` a una carpeta solo-admin. A futuro: generar la CA con name constraints `127.0.0.1` | 1 |
| PC del local (Windows) | ❌ | Sin relevar: usuario con permisos de admin, actualizaciones, antivirus, cifrado de disco, bloqueo de sesión | Checklist Anexo A.8 (Windows Update automático, Defender ON, BitLocker, usuario estándar para operar, bloqueo a 10 min, sin IP fija) | 1 |
| Red del local | 🟡 | Wi-Fi compartido con clientes; router con credenciales de fábrica (probable) | Cambiar clave de admin del router, Wi-Fi separado para el local y para clientes, DNS 1.1.1.1/8.8.8.8 | 1 |
| Celulares del equipo | ❌ | Dashboard en Chrome en celulares personales | Política mínima: bloqueo de pantalla, cerrar sesión al dejar de trabajar, no instalar la CA | 2 |
| Proveedores cloud con certificaciones | ✅ | Supabase (SOC 2 Tipo II, ISO 27001), Vercel (SOC 2 Tipo II, ISO 27001), GitHub (SOC 2) | Guardar los informes (Trust Center de cada uno) en la carpeta de evidencia | 2 |

### 3.5 Datos, cifrado y backups (CC6.1, CC6.5, A1.2 · A.8.10–8.13, A.8.24 · CIS 3, 11)

| Control | Estado | Evidencia / hallazgo | Acción | Fase |
|---|---|---|---|---|
| Cifrado en tránsito | ✅ | HTTPS en Vercel/Supabase; HSTS (⚙️); Comandera Print por TLS local | — | — |
| Cifrado en reposo | ✅ | Supabase/AWS cifran discos; Storage idem | — | — |
| Backup diario | ⚙️ | Existía: `pg_dump` de `public` a artefacto de GitHub **sin cifrar**, 30 días, sin `auth` ni `private` | Workflow nuevo: `public`+`private`+`auth` (datos), **GPG AES-256** con `BACKUP_PASSPHRASE`, prueba de integridad, `permissions: contents: read` | 0 |
| Copia fuera de GitHub | ❌ | Todo depende de GitHub | Mensual: bajar un backup y guardarlo cifrado en un disco/nube de la dueña (es también lo que pidió: "un backup del proyecto") | 1 |
| Prueba de restauración | ❌ | Nunca se restauró | Cada 3 meses: restaurar el último backup en un proyecto Supabase vacío o en Postgres local y abrir el dashboard contra él. Registrar fecha y resultado | 2 |
| Secretos en la base | 🟡 | `private.config` cerrado a anon/authenticated ✅; `webhook_config.wasender_api_key` en texto plano legible por quien tenga `ver` sobre esa tabla | Mover la API key a `private.config` (o Edge Secret) | 1 |
| Dato sensible expuesto a anon | ⚙️ | `web_config.banco_cuenta` (etiqueta) legible por anon | SQL 50 la vacía (vive en `cuentas_negocio`) | 0 |
| Clasificación de datos | ⚙️ | §7 registro de tratamientos | Mantener | 2 |

### 3.6 Registro, monitoreo y respuesta a incidentes (CC7.1–7.5 · A.5.24–5.28, A.8.15–8.16 · CIS 8, 17)

| Control | Estado | Evidencia / hallazgo | Acción | Fase |
|---|---|---|---|---|
| Registro de accesos (login) | ✅ | `log_accesos()` sobre `auth.audit_log_entries`; panel en Personal → Usuarios | Revisarlo en la revisión trimestral | 2 |
| Auditoría de cambios en pagos | ✅ | `egresos_auditoria` (alta, edición con antes/después, anulación con motivo) | — | — |
| Auditoría de cambios sensibles (menú/precios, permisos, usuarios, comprobantes) | ❌ | "Capa 3" pendiente desde el 08/10 | Trigger genérico `auditoria` (tabla, fila, quién, antes/después) sobre `menu_items`, `rol_permisos`, `roles`, `comprobantes_fiscales`, `cuentas_negocio`, `facturacion_config`; retención 2 años | 1 |
| Logs de Edge Functions y Postgres | 🟡 | Supabase los guarda 1–7 días según plan | Plan Pro: 7 días; si se necesita más, exportar a un destino externo (Logflare/S3) | 2 |
| Alertas | ❌ | Nadie se entera de un fallo de backup o de 1000 logins fallidos | GitHub: notificación por email si falla `backup-diario`; Supabase: alertas de uso; revisar semanalmente los accesos fallidos | 1 |
| Plan de respuesta a incidentes | ❌ | — | Anexo A.5: quién, qué, en cuánto tiempo, cómo se notifica a afectados y a la AAIP (72 h recomendadas) | 2 |
| Notificaciones push sin autenticación | ⚙️ | `push-pedidos` sin secreto; `push-web` aceptaba todo si faltaba la variable | Ambas exigen `x-push-secret` (fail-closed). Configurar `PUSH_WEB_SECRET` y cambiar el placeholder en `private.config` (diagnóstico 49-A) | 0 |

### 3.7 Privacidad — ISO 27701 y Ley 25.326 (P1–P8 de SOC 2)

| Control | Estado | Evidencia / hallazgo | Acción | Fase |
|---|---|---|---|---|
| Aviso de privacidad al recolectar datos (art. 6) | ⚙️ | La web no tenía aviso ni política | Página `/privacidad`, link en el footer y aviso bajo "Confirmar reserva" y "Enviar pedido" | 0 |
| Consentimiento para marketing | ✅ | Checkbox opt-in desmarcado por defecto; `acepta_marketing` | `kiku_upsert_cliente_marketing` ya no es llamable desde el front (SQL 50): nadie puede marcar opt-in sobre el teléfono de otro | 0 |
| Minimización | 🟡 | Restricciones alimentarias y accesibilidad = datos sensibles (salud) | Son opcionales y están justificados por la finalidad; anonimización a 2 años (SQL 52). Mencionado en la política | 0 |
| Retención y borrado | ⚙️ | No existía | SQL 52: `aplicar_retencion()` (lista de espera 90 d, notificaciones 180 d, GPS de fichajes 90 d, tokens 180 d, reservas anonimizadas a 2 años) + programación mensual con pg_cron | 0 |
| Derechos ARCO (acceso, rectificación, supresión) | ⚙️ | Sin procedimiento | `borrar_datos_persona(telefono, email)` + procedimiento Anexo A.7 (respuesta en 10 días hábiles) | 0 |
| Registro de actividades de tratamiento | ⚙️ | §7 | Mantener; registrar la base en el RNBD de la AAIP si corresponde (consultar con el contador/abogado) | 2 |
| Encargados de tratamiento (Supabase, Vercel) | 🟡 | DPAs estándar aceptados al contratar | Guardar copia de los DPA; transferencia internacional cubierta por cláusulas tipo | 2 |
| Píxel de Meta | 🟡 | Sin advanced matching; solo PageView y Schedule | Verificar en Events Manager que "Automatic Advanced Matching" esté OFF; está declarado en la política | 1 |
| Datos de empleados (CUIT, CBU, sueldo, GPS de fichaje) | 🟡 | RLS por rol; GPS sin retención | SQL 52 anonimiza GPS a 90 días; política de acceso: solo finanzas/admin ven sueldos (ya es así por matriz) | 0 |

---

## 4. Registro de riesgos (01/11/2026)

| # | Riesgo | Prob. | Impacto | Estado | Mitigación |
|---|---|---|---|---|---|
| R1 | Login sin rol o con rol mínimo lee/escribe `clientes` y stock por policies amplias | Media | Alto | ⚙️ SQL 51 | Matriz manda |
| R2 | Comandera Print expuesto en la LAN del local: imprimir, SSRF, reemplazo del exe | Media | Alto | ⚙️ 1.0.13 | Solo localhost + sha256 |
| R3 | Backup sin cifrar en GitHub con todos los datos personales | Baja | Alto | ⚙️ workflow | GPG + copia externa |
| R4 | Sin 2FA en admin/finanzas: un phishing al celular da acceso total | Media | Alto | 🟡 decisión | Reactivar para 2 cuentas |
| R5 | Secreto de push en placeholder: avisos falsos a cocina | Media | Bajo | ⚙️ + config | Diagnóstico 49-A |
| R6 | Dependencias vulnerables en producción (`react-router`, `xlsx`) | Media | Medio | 🟡 | `npm audit fix`; reemplazar `xlsx` |
| R7 | Pérdida de datos personales por falta de retención (acumulación indefinida) | Alta | Medio | ⚙️ SQL 52 | Retención mensual |
| R8 | PC del local sin hardening (admin local, sin cifrado) | Alta | Medio | ❌ | Anexo A.8 |
| R9 | Única persona con conocimiento del sistema (Manu) | Alta | Alto | 🟡 | `CONTEXTO.md`, este doc, backup en manos de la dueña, credenciales en gestor compartido |
| R10 | Claves filtradas en octubre (PAT GitHub, service_role) no rotadas | ? | Alto | 🟡 | Confirmar rotación; si no, rotar ya |

---

## 5. Plan por fases

**Fase 0 — hoy (parches del 01/11, verificados):** `hardening-dashboard.patch` (headers/CSP, logs, CORS, push fail-closed, backup cifrado, Comandera Print 1.0.13, SQL 49–52, este documento) y `hardening-web.patch` (headers/CSP, píxel externo, página de privacidad, avisos). Orden de aplicación en §8.

**Fase 1 — primeros 30 días (configuración, sin código):**
1. Correr SQL 49 → 50 → 52; revisar 49-D y correr 51. Habilitar `pg_cron` y confirmar el job mensual.
2. Supabase: `PUSH_WEB_SECRET` real + `private.config`; `ALLOWED_ORIGINS`; Auth: signups OFF, contraseña mínima 10, leaked-password protection; Edge Functions redeployadas.
3. GitHub: `BACKUP_PASSPHRASE` (≥32, en gestor de contraseñas); Dependabot ON; rotar PAT; verificar que el repo sea privado; avisos por email si falla un workflow.
4. Decidir 2FA para admin/finanzas; si sí, reactivar (`private.config.mfa_roles`, ver `docs/SEGURIDAD_CAPA2.md`).
5. PC del local: Anexo A.8. Celulares: desinstalar la CA de Comandera.
6. `npm audit fix` en ambos repos (parche aparte, con build y tests).
7. Primer backup externo cifrado entregado a la dueña + instrucciones de restauración.
8. Mover `wasender_api_key` a `private.config`; rechazar ítems sin `menu_item_id` en `crear_pedido_web`.

**Fase 2 — 60 a 90 días (organización y evidencia):**
1. Adoptar las políticas del Anexo A (firmadas, fecha, versión). Capacitación de 30 min al equipo con registro.
2. Auditoría de cambios sensibles (capa 3) + revisión trimestral de accesos (primera: fin de noviembre).
3. Prueba de restauración documentada. Plan de incidentes probado con un simulacro (p. ej. "se perdió el celular de un mozo").
4. Carpeta de evidencia (Drive privado): políticas, informes SOC 2 de Supabase/Vercel/GitHub, DPAs, capturas de configuración, registros de revisión.
5. Reemplazar `xlsx`; name constraints en la CA de Comandera Print; Windows task para Comandera Print.

**Fase 3 — readiness (cuando haya un cliente que lo pida):**
- SOC 2 Tipo I o ISO 27001 requieren un auditor externo y 3–6 meses de evidencia operando. Con las fases 1 y 2 hechas, lo que queda es formalidad: gestión de riesgos periódica, revisión por la dirección, auditoría interna. Herramientas como Vanta/Drata automatizan la recolección de evidencia (costo mensual); para un solo producto chico alcanza con la carpeta de evidencia y una planilla de controles.
- Para Comandera multi-cliente: un proyecto Supabase por cliente (aislamiento), onboarding con `provision/`, DPA propio de Comandera con cada local, y este documento como "paquete de seguridad" que se entrega al cliente.

---

## 6. CIS Controls v8 — IG1 (resumen de cumplimiento)

| CIS | Control | Estado |
|---|---|---|
| 1 | Inventario de activos | ⚙️ §1 |
| 2 | Inventario de software | 🟡 `package.json` + §1; falta lo instalado en la PC del local |
| 3 | Protección de datos | ⚙️ clasificación §7, retención SQL 52, cifrado ✅ |
| 4 | Configuración segura | ⚙️ headers, Comandera Print; ❌ PC/router |
| 5 | Gestión de cuentas | ✅ roles; 🟡 revisión periódica |
| 6 | Control de acceso | ✅ RLS/matriz; 🟡 MFA |
| 7 | Gestión de vulnerabilidades | 🟡 `npm audit`; Dependabot pendiente |
| 8 | Registro de auditoría | 🟡 accesos y pagos ✅; cambios sensibles ❌ |
| 9 | Protección de email y navegador | 🟡 CSP ✅; capacitación phishing ❌ |
| 10 | Antimalware | ❌ PC del local sin relevar |
| 11 | Recuperación de datos | ⚙️ backup cifrado; ❌ restauración probada |
| 12 | Infraestructura de red | ❌ router/Wi-Fi |
| 14 | Concientización | ❌ |
| 15 | Proveedores | 🟡 |
| 16 | Seguridad de aplicaciones | ⚙️ |
| 17 | Respuesta a incidentes | ❌ plan |

---

## 7. Registro de actividades de tratamiento (ISO 27701 §7.2.8 / Ley 25.326)

| Tratamiento | Datos | Titulares | Finalidad | Base legal | Retención | Dónde | Encargados |
|---|---|---|---|---|---|---|---|
| Reservas | nombre, teléfono, email, cumpleaños, restricciones*, accesibilidad*, notas | Clientes | Gestionar la reserva | Consentimiento + ejecución | 2 años, luego anonimizado | `reservas` | Supabase, Vercel |
| Lista de espera | nombre, teléfono, email, notas | Clientes | Avisar si se libera lugar | Consentimiento | 90 días | `lista_espera` | Supabase |
| Pedidos online | nombre, teléfono, dirección, notas | Clientes | Preparar y entregar | Ejecución | Fiscal/comercial | `pedidos` | Supabase |
| Clientes frecuentes | nombre, teléfono, email, cumpleaños, gasto, opt-in marketing | Clientes | Atención, promos (opt-in) | Consentimiento | Hasta baja | `clientes` | Supabase; WhatsApp/Wasender si hay campañas |
| Facturación | CUIT/DNI, razón social, domicilio, importes | Clientes | Emitir comprobantes | Obligación legal | 10 años | `comprobantes_fiscales`, `arca_request_log` (2 años) | ARCA, Supabase |
| Personal | nombre, CUIT/CUIL, CBU, teléfono, sueldo, horas, GPS de fichaje | Empleados | Liquidación, control horario | Relación laboral | Legal; GPS 90 días | `empleados`, `fichajes`, `liquidaciones`, `egresos` | Supabase; contadores (Excel) |
| Usuarios del sistema | email, rol, IP y fecha de acceso | Empleados | Operar el dashboard | Relación laboral | Mientras dure el vínculo | `auth.users`, `auth.audit_log_entries` | Supabase |
| Notificaciones push | tokens de dispositivo | Empleados | Avisos de pedidos | Consentimiento (navegador) | 180 días sin uso | `web_push_subs`, `device_tokens` | Supabase, Google FCM |
| Medición de anuncios | cookie/visita, evento "reserva confirmada" | Visitantes | Medir campañas | Interés legítimo (declarado) | Según Meta | Navegador → Meta | Meta |

\* Datos sensibles (salud). Opcionales; se guardan solo si el cliente los escribe.

---

## 8. Checklist de aplicación (orden)

1. **Dashboard**: `kiku-sync am hardening-dashboard.patch` → push (Vercel deploya headers + front).
2. **Web**: `kiku-sync am hardening-web.patch` → push. Verificar kikusushi.ar/privacidad y que reservas/pedidos funcionen.
3. **Supabase SQL Editor**: `SQL-CIERRES/49` (leer resultados) → `50` → `52`. Si 49-D muestra roles con "editar" en las tablas en uso → `51`. Si 49-A dice CAMBIAR: `update private.config set valor = '<secreto largo>' where clave = 'push_web_secret';`
4. **Supabase → Edge Functions → Secrets**: `PUSH_WEB_SECRET` (igual al anterior), `ALLOWED_ORIGINS=https://kiku-sushi-dashboard.vercel.app` (+ dominio propio si hay).
5. `supabase functions deploy admin-usuarios`, `arca-comprobantes`, `push-web`, `push-pedidos --no-verify-jwt`. Si el webhook de `pedidos` → `push-pedidos` existe (Database → Webhooks), agregarle el header `x-push-secret`; si no se usa, borrarlo.
6. **Supabase → Database → Extensions**: habilitar `pg_cron` y volver a correr el bloque final del SQL 52 (o `select cron.schedule(...)`).
7. **GitHub → Settings → Secrets**: `BACKUP_PASSPHRASE`. Correr `backup-diario` a mano (Actions → Run workflow) y confirmar que el artefacto es `.gpg`.
8. **Comandera Print**: el push dispara el build 1.0.13 (GitHub Actions); la PC se actualiza sola en menos de 6 h o al reiniciar el programa. Confirmar en el log `Escuchando en https://127.0.0.1:8443`.
9. **Supabase → Auth**: signups OFF; contraseña mínima 10; leaked-password protection.
10. Decidir 2FA (fase 1.4) y agendar la revisión de accesos del fin de mes.

---

## Anexo A — Políticas base de Comandera (v1, para adoptar)

> Cada política: responsable = Juan Manuel Carreras (administrador del sistema); aprobación = dirección de Kiku Sushi; revisión anual o ante un cambio relevante.

### A.1 Política de seguridad de la información
Comandera protege la confidencialidad, integridad y disponibilidad de los datos de los locales que lo usan y de sus clientes y empleados. Todo acceso es nominal y por rol mínimo necesario; todo cambio al sistema pasa por el circuito de cambios; los datos personales se tratan según la política de privacidad; los incidentes se gestionan según el plan de respuesta. Esta política se comunica a todo el personal con acceso al sistema y se revisa una vez por año.

### A.2 Control de acceso
Un login por persona; prohibido compartir usuarios o contraseñas. Alta de usuario: solo admin/finanzas, con rol asignado desde la matriz de permisos. Baja: el mismo día en que la persona deja de trabajar (Equipo → Usuarios → eliminar; se cierran sus sesiones). Contraseñas de 10 caracteres o más, únicas, guardadas en un gestor; 2FA obligatorio para `admin` y `finanzas`. Revisión trimestral de la lista de usuarios y del panel de últimos accesos, con registro de fecha y resultado. La cuenta de emergencia (`finanzas@`) se usa solo para recuperar la matriz de permisos.

### A.3 Gestión de cambios y desarrollo seguro
Todo cambio en código o base de datos se hace en una rama/parche, se verifica (build, tests, `verificar:permisos`, SQL probado en Postgres local), se commitea con mensaje descriptivo y se aplica a `master` por una persona distinta a la que lo escribió (hoy: Claude escribe, Manu revisa y aplica). Cambios en permisos, facturación, pagos o usuarios llevan un checklist: ¿toca RLS? ¿toca dinero? ¿se probó con un rol no admin? Nunca se aplican cambios que corten acceso durante el servicio. Los secretos nunca entran al repositorio; se rotan ante cualquier sospecha de filtración.

### A.4 Backup y recuperación
Backup diario automático, cifrado (AES-256), con 30 días de historia en GitHub y una copia mensual cifrada fuera de GitHub en manos de la dueña del local. La frase de cifrado se guarda en el gestor de contraseñas de dos personas. Objetivos: RPO 24 h, RTO 4 h. Prueba de restauración trimestral documentada (fecha, backup usado, resultado, tiempo). Procedimiento: descifrar con `gpg`, restaurar en un proyecto Supabase vacío con `psql`, apuntar el dashboard, verificar login y una pantalla de cada módulo.

### A.5 Respuesta a incidentes y notificación de brechas
Incidente = cualquier evento que comprometa datos, disponibilidad o integridad (acceso no autorizado, pérdida de un celular con sesión abierta, filtración de claves, ransomware en la PC del local, caída prolongada). Pasos: (1) contener: cerrar sesiones del usuario afectado, rotar la clave comprometida, desconectar el equipo; (2) registrar: fecha, qué pasó, qué datos, quién; (3) evaluar si afecta a personas; (4) notificar a los afectados y, si corresponde, a la AAIP dentro de las 72 h; (5) corregir la causa y documentar la lección. Responsable: administrador del sistema; comunica a la dirección el mismo día.

### A.6 Proveedores
Solo se usan proveedores con certificación SOC 2 o ISO 27001 para alojar datos (Supabase, Vercel, GitHub). Se guarda copia de sus informes y de los acuerdos de tratamiento de datos. Los proveedores de mensajería (WhatsApp/Wasender) reciben el mínimo necesario (teléfono y mensaje). Revisión anual de la lista.

### A.7 Privacidad y retención
Los datos personales se recogen con aviso (página `/privacidad`), para finalidades definidas (§7), y se guardan solo el tiempo indicado; `aplicar_retencion()` corre todos los meses. Pedidos de acceso, rectificación o supresión: se reciben por email, se verifica la identidad (mismo email/teléfono registrado) y se responden en 10 días hábiles; la supresión se ejecuta con `borrar_datos_persona(telefono, email)` y se registra. Los datos fiscales no se borran (obligación legal); se informa al titular. Los datos de salud (restricciones, accesibilidad) son opcionales y se anonimizan a los 2 años.

### A.8 Puesto de trabajo (PC del local y celulares)
PC del local: Windows actualizado automáticamente, Microsoft Defender activo, BitLocker encendido, cuenta de uso diario sin permisos de administrador, bloqueo de pantalla a 10 minutos con contraseña, sin software ajeno al trabajo, Comandera Print instalado en una carpeta protegida. Celulares que usan el dashboard: bloqueo de pantalla obligatorio, sesión cerrada al terminar el turno, sin certificados de terceros instalados. Ante pérdida o robo: avisar al administrador para cerrar sesiones.

### A.9 Registro y monitoreo
Se conservan: accesos al sistema (login, IP), cambios en pagos (auditoría completa), cambios sensibles (menú, permisos, usuarios, comprobantes; capa 3), logs de funciones (7 días). Revisión: semanal de accesos fallidos y backups; trimestral de usuarios y permisos. Los registros no se editan.

### A.10 Continuidad
Si cae Vercel o Supabase: el local opera con comandas en papel y factura por Comprobantes en línea de ARCA; al volver, se cargan los pedidos del día. Si falla la PC del local: los celulares siguen operando el dashboard y los tickets se encolan hasta que vuelva la impresora. Contactos y pasos en `CONTEXTO.md`.

---

## Anexo B — Evidencia que pedirá un auditor (dónde está)

| Evidencia | Ubicación |
|---|---|
| Políticas firmadas | Carpeta de evidencia (Drive) — pendiente fase 2 |
| Matriz de permisos vigente | Dashboard → Personal → Permisos; tablas `roles`/`rol_permisos` |
| Registro de accesos | Dashboard → Personal → Usuarios → Últimos accesos |
| Auditoría de pagos | `egresos_auditoria`; Historial en Caja → Pagos |
| Backups y pruebas de restauración | GitHub Actions → `backup-diario`; registro de restauraciones (fase 2) |
| Cambios y verificación | Historial de commits; `CONTEXTO.md` "Últimos cambios"; `SQL-CIERRES/` |
| Configuración de seguridad | `vercel.json` (ambos repos), migraciones `202610*`/`202611*`, `docs/SEGURIDAD_*.md` |
| Informes de proveedores | Trust Centers de Supabase, Vercel, GitHub (descargar a la carpeta) |
| Registro de tratamientos | §7 de este documento |
| Pedidos ARCO atendidos | Registro (fase 2) |
