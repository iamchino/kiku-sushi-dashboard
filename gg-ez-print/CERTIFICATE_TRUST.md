# Certificado de confianza local — GG EZ Print

## ¿Por qué aparecía la advertencia del navegador?

El servidor local usa HTTPS para comunicarse de forma segura con el navegador. Anteriormente, el certificado era **auto-firmado** — el navegador no podía verificar quién lo emitió y mostraba la advertencia *"Tu conexión no es privada"*.

## ¿Cómo funciona ahora?

La aplicación ahora usa un esquema de **dos capas**:

1. **CA local (Autoridad Certificadora)** — Se genera una vez y se instala en el almacén de confianza de Windows. Todos los navegadores (Chrome, Edge, Firefox*) confían automáticamente en cualquier certificado emitido por esta CA.
2. **Certificado de servidor** — Firmado por la CA local. Cubre la IP LAN actual y `127.0.0.1`.

Cuando cambia la IP de red, solo se regenera el certificado de servidor — la CA ya está instalada y no se necesita ninguna acción adicional.

> *Firefox usa su propio almacén de certificados. Ver sección al final.

---

## Primera vez — flujo de instalación

Al iniciar la aplicación por primera vez (o después de borrar `%APPDATA%\GGEZPrint\`):

1. La app genera la CA local y el certificado de servidor automáticamente.
2. Aparece el **diálogo estándar de Windows** preguntando si deseas instalar el certificado *"GG EZ Print CA"*.
3. Haz clic en **Sí**.
4. Desde ese momento, los navegadores mostrarán el candado verde sin advertencias.

Este diálogo solo aparece **una vez** por usuario de Windows, a menos que reinstales la aplicación.

---

## Archivos generados

Todos los archivos se guardan en `%APPDATA%\GGEZPrint\`:

| Archivo | Descripción |
|---|---|
| `ca.pem` | Certificado de la CA local (instalado en Windows) |
| `ca-key.pem` | Clave privada de la CA (nunca sale del equipo) |
| `cert.pem` | Certificado del servidor (firmado por la CA) |
| `key.pem` | Clave privada del servidor |

---

## Menú de la bandeja del sistema

**"Instalar certificado CA"** — Reabre el diálogo de instalación de Windows. Útil si:
- Rechazaste el diálogo al iniciar.
- Cambiaste de usuario de Windows.
- Reinstalaste la aplicación y se generó una nueva CA.

---

## Firefox

Firefox no usa el almacén de certificados de Windows por defecto. Para confiar en la CA desde Firefox:

1. Abre Firefox → Configuración → Privacidad y seguridad → Ver certificados
2. En la pestaña **Autoridades**, haz clic en **Importar**
3. Selecciona `%APPDATA%\GGEZPrint\ca.pem`
4. Marca *"Confiar en esta CA para identificar sitios web"*
5. Aceptar

O activa la opción para que Firefox use el almacén de Windows:
- Navega a `about:config`
- Busca `security.enterprise_roots.enabled`
- Ponlo en `true`

---

## Restablecer certificados

Para forzar la regeneración de todos los certificados:

1. Cierra GG EZ Print desde la bandeja del sistema.
2. Elimina la carpeta `%APPDATA%\GGEZPrint\`.
3. Vuelve a abrir la aplicación — se generarán nuevos certificados y aparecerá el diálogo de instalación.
