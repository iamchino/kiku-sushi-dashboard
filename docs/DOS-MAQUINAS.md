# Trabajar desde la PC y la Mac sin que nada quede desactualizado

**La regla única: GitHub es la fuente de verdad.** Nada vive solo en una
máquina. Lo que no está pusheado no existe para la otra máquina ni para Claude.

Por eso, desde el 21/10/2026, dentro de este repo viven también:

- `CONTEXTO.md` — el manual de trabajo (antes estaba suelto en `Desktop\kiku`).
- `SQL-CIERRES/` — los SQL numerados para pegar en Supabase (antes suelto).
- `scripts/kiku-sync.sh` (Mac) y `scripts/kiku-sync.ps1` (Windows) — el
  comando que mantiene los dos repos al día.

Lo único que queda fuera de git son las capturas de `Claude outputs\` (no hacen
falta en la otra máquina) y los `.patch`, que se aplican y se borran
(`*.patch` está en `.gitignore`: aunque te olvides de borrar uno, no se sube).

## Estructura en cada máquina

Una carpeta con los dos repos adentro, uno al lado del otro:

```
Windows:  C:\Users\Juan Manuel\Desktop\kiku\        Mac:  ~/kiku/
            kiku-sushi-dashboard\                           kiku-sushi-dashboard/
            kiku-sushi-web\                                 kiku-sushi-web/
            Claude outputs\   (solo capturas, local)
```

`kiku-sync` busca los repos en la carpeta PADRE del repo donde está el script.
Si los tenés en otro lado: `export KIKU_DIR=/ruta` (Mac) o `$env:KIKU_DIR`.

## Puesta a punto de la Mac (una sola vez)

```bash
# 1. git (viene con las herramientas de Xcode) y Homebrew
xcode-select --install
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. GitHub: logueado como iamchino (abre el navegador)
brew install gh
gh auth login            # GitHub.com → HTTPS → Login with a web browser

# 3. identidad de los commits + fin de línea
git config --global user.name  "Juan Manuel Carreras"
git config --global user.email "juanm.carreras0894@gmail.com"
git config --global core.autocrlf input
git config --global pull.rebase true

# 4. los dos repos
mkdir -p ~/kiku && cd ~/kiku
git clone https://github.com/iamchino/kiku-sushi-dashboard.git
git clone https://github.com/iamchino/kiku-sushi-web.git
chmod +x kiku-sushi-dashboard/scripts/kiku-sync.sh

# 5. comprobar
kiku-sushi-dashboard/scripts/kiku-sync.sh
```

Opcional, solo si querés correr el dashboard o la web en la Mac
(`npm run dev`): `brew install node`, `npm install` en cada repo, y un
`.env.local` con las variables de `.env.example` (los valores están en
Vercel → proyecto → Settings → Environment Variables). Vercel deploya solo
desde GitHub: para publicar NO hace falta nada de esto.

Opcional, para deployar Edge Functions (`supabase functions deploy …`):
`brew install supabase/tap/supabase`, `supabase login`, y en el repo del
dashboard `supabase link --project-ref <ref>` (el ref está en la URL de
Supabase). Hoy eso se hace desde la PC; si no lo necesitás en la Mac, saltealo.

Para que Claude trabaje con la carpeta desde la Mac: en la app de Claude,
"Add folder" → `~/kiku`. Claude lee `CONTEXTO.md` del repo (ya no necesita la
carpeta para eso) y deja los parches en el repo que corresponda.

## Rutina diaria (en cualquiera de las dos máquinas)

```bash
# Mac                                        # Windows (PowerShell)
cd ~/kiku                                    cd "C:\Users\Juan Manuel\Desktop\kiku"
kiku-sushi-dashboard/scripts/kiku-sync.sh pull      .\kiku-sushi-dashboard\scripts\kiku-sync.ps1 pull
# … trabajar / aplicar parches de Claude …
kiku-sushi-dashboard/scripts/kiku-sync.sh push "qué cambió"   .\kiku-sushi-dashboard\scripts\kiku-sync.ps1 push "qué cambió"
```

- **`pull` al empezar, `push` al terminar.** Siempre. Si `pull` se queja de
  cambios sin commitear, es que la vez anterior faltó el `push`.
- `status` (sin argumentos) te dice de un vistazo si hay algo sin subir o si
  GitHub tiene cosas nuevas. Si decís "SIN SUBIR" en rojo, hacé `push`.
- Los parches de Claude: `kiku-sync.sh am archivo.patch` (o
  `kiku-sync.ps1 am archivo.patch`). Hace `pull`, `git am`, `push` y borra
  el `.patch`, todo junto. Si Claude avisa que el parche toca un archivo con
  CRLF: `am archivo.patch --keep-cr` (Mac) / `am archivo.patch -KeepCr` (Win).
- Si `git am` falla con "patch does not apply": casi siempre falta aplicar
  un parche anterior o falta el `pull`. `git am --abort`, `pull`, de nuevo.
- Nunca editar el mismo archivo en las dos máquinas sin pasar por GitHub en
  el medio. Con `pull`/`push` disciplinado no hay conflictos; si aparece
  uno, `git status` dice qué archivo es y Claude lo resuelve.

## Qué cambia para Claude

- Lee `CONTEXTO.md` del clon del repo (GitHub), no de la carpeta de la PC.
- Las actualizaciones de `CONTEXTO.md` y los SQL nuevos de `SQL-CIERRES/`
  **van dentro del parche del dashboard**: al aplicarlo y pushear, la otra
  máquina los recibe con el `pull`.
- Los parches se dejan en la carpeta del repo de la máquina conectada y
  también se adjuntan en el chat, así se pueden bajar desde la otra.
