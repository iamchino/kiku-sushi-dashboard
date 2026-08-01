# Cómo aplicar la fase 3 — sin instalar nada

Son **tres pasos**. Los dos primeros son obligatorios; sin el segundo la
pantalla guarda los permisos pero no puede cerrar las sesiones.

---

## Paso 1 — La base de datos (SQL Editor)

1. Entrá a [supabase.com](https://supabase.com) → tu proyecto → **SQL Editor**
   (ícono de terminal en la barra izquierda).
2. **New query**.
3. Abrí `supabase/SQL_EDITOR_FASE3.sql` de este repo, copiá **todo** el
   contenido y pegalo.
4. **Run** (o Ctrl+Enter).

Tiene que decir "Success". Es idempotente: si lo corrés de nuevo, no rompe nada.

---

## Paso 2 — La Edge Function (Dashboard)

Esta **no** se puede actualizar por SQL. Tiene el arreglo del cierre de
sesiones, así que sin este paso el cambio de rol y el de permisos siguen sin
aplicarse hasta que expire el token de cada persona.

1. Supabase → **Edge Functions** (barra izquierda).
2. Clic en **`admin-usuarios`** (ya existe, no hay que crearla).
3. Botón de editar / **Code**.
4. Borrá todo lo que haya y pegá el contenido completo de
   `supabase/functions/admin-usuarios/index.ts` de este repo.
5. **Deploy**.

Importante: **no** tildes "Verify JWT off" / no uses `--no-verify-jwt`. La
función necesita el JWT para saber quién la está llamando.

---

## Paso 3 — El front

Mergeá la branch `feat/permisos-fase3` a `master` y esperá el deploy de Vercel.
O si querés probarlo antes en tu máquina, ver más abajo.

---

## Si preferís la línea de comandos

Los comandos `supabase db push` y `supabase functions deploy` son la alternativa
al copy-paste. Requieren instalar el CLI de Supabase, que **no viene con el
proyecto**. En Windows, con PowerShell:

```powershell
# 1. Instalar el CLI (una sola vez)
npm install -g supabase

# 2. Pararte en la carpeta del repo
cd "C:\Users\Juan Manuel\Desktop\kiku\kiku-sushi-dashboard"

# 3. Loguearte y vincular el proyecto (una sola vez)
supabase login
supabase link --project-ref TU_PROJECT_REF

# 4. Ahora sí
supabase db push
supabase functions deploy admin-usuarios
```

El `TU_PROJECT_REF` sale de la URL del dashboard:
`https://supabase.com/dashboard/project/`**`abcdefghijklm`** ← eso.

**Ojo con `db push` si venís pegando SQL a mano:** el CLI lleva su propio
registro de qué migraciones aplicó, y como vos las corriste por el SQL Editor,
va a querer aplicarlas todas de nuevo. Son idempotentes, así que no rompen —
pero la de la fase 0 puede abortar si encuentra usuarios con el rol solo en
`user_metadata`. Si te pasa, seguí con el SQL Editor y listo.

---

## Probar el front en tu máquina antes de mergear

```powershell
cd "C:\Users\Juan Manuel\Desktop\kiku\kiku-sushi-dashboard"
git checkout feat/permisos-fase3
npm ci        # solo la primera vez
npm run dev
```

Abrí la URL que te muestra (suele ser `http://localhost:5173`), entrá como
`finanzas@kikusushi.com.ar` y andá a **Personal → Permisos**.

Qué probar:

- [ ] Aparece el tab **Permisos** en Personal
- [ ] Se ven los 5 roles con su cantidad de usuarios al lado
- [ ] Elegís Mozo, destildás una sección, aparece "hay cambios sin guardar"
- [ ] **Guardar** abre una confirmación que dice qué pierde y a cuánta gente afecta
- [ ] Guardás y sale el mensaje verde
- [ ] Volvés a tildarla y guardás de nuevo, para dejarlo como estaba
- [ ] **Nuevo rol** crea uno y nace sin ninguna sección
- [ ] Elegís ese rol nuevo, tildás dos secciones, guardás
- [ ] Lo eliminás con el tachito

La prueba que más importa, porque es la que no se puede deshacer sola:

- [ ] Con el rol **Finanzas** seleccionado, destildá **Permisos** y dale Guardar.
      Tiene que aparecer una casilla roja pidiéndote que confirmes que entendés
      que te quedás afuera. **Cancelá.** Es solo para verificar que la red está
      puesta.

Si aun así lo guardaras y quedaras afuera: `finanzas@kikusushi.com.ar` tiene
acceso hardcodeado en SQL y siempre puede volver a entrar a esa pantalla.
