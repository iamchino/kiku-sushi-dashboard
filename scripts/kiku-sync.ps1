# ─────────────────────────────────────────────────────────────────────────────
# kiku-sync (Windows / PowerShell) — mismo comportamiento que kiku-sync.sh.
#
#   .\scripts\kiku-sync.ps1                 → estado de cada repo
#   .\scripts\kiku-sync.ps1 pull            → trae lo último de GitHub
#   .\scripts\kiku-sync.ps1 push "mensaje"  → commitea lo que cambió y sube
#   .\scripts\kiku-sync.ps1 am archivo.patch [-KeepCr] → aplica un parche y sube
#
# Si PowerShell no deja correr scripts:  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
# ─────────────────────────────────────────────────────────────────────────────
param(
  [string]$Cmd = "status",
  [string]$Arg = "",
  [switch]$KeepCr
)
$ErrorActionPreference = "Stop"
$Aqui = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Base = if ($env:KIKU_DIR) { $env:KIKU_DIR } else { Split-Path -Parent $Aqui }
$Repos = @("kiku-sushi-dashboard", "kiku-sushi-web")

function Estado($r) {
  $d = Join-Path $Base $r
  if (-not (Test-Path (Join-Path $d ".git"))) { Write-Host "✗ No encuentro $d — cloná: git clone https://github.com/iamchino/$r.git" -ForegroundColor Red; return }
  git -C $d fetch -q origin
  $sucios  = (git -C $d status --porcelain | Measure-Object -Line).Lines
  $ahead   = [int](git -C $d rev-list --count origin/master..master)
  $behind  = [int](git -C $d rev-list --count master..origin/master)
  $parches = (Get-ChildItem -Path $d -Filter *.patch -ErrorAction SilentlyContinue | Measure-Object).Count
  Write-Host ("{0,-22} " -f $r) -NoNewline
  if ($sucios -eq 0) { Write-Host "limpio  " -NoNewline -ForegroundColor Green } else { Write-Host "$sucios sin commitear  " -NoNewline -ForegroundColor Yellow }
  if ($ahead -eq 0)  { Write-Host "nada por subir  " -NoNewline -ForegroundColor Green } else { Write-Host "$ahead commit(s) SIN SUBIR  " -NoNewline -ForegroundColor Red }
  if ($behind -eq 0) { Write-Host "al día" -NoNewline -ForegroundColor Green } else { Write-Host "$behind commit(s) nuevos en GitHub → pull" -NoNewline -ForegroundColor Yellow }
  if ($parches -gt 0) { Write-Host "  ($parches .patch sin aplicar o sin borrar)" -NoNewline -ForegroundColor Yellow }
  Write-Host ""
}

function Pull($r) {
  $d = Join-Path $Base $r
  if (-not (Test-Path (Join-Path $d ".git"))) { Write-Host "✗ No encuentro $d" -ForegroundColor Red; return }
  if (git -C $d status --porcelain) {
    Write-Host "✗ $r tiene cambios sin commitear: hacé 'kiku-sync.ps1 push ""mensaje""' primero." -ForegroundColor Red
    git -C $d status --short | Select-Object -First 20
    return
  }
  git -C $d pull --rebase -q origin master
  Write-Host "✓ $r al día ($(git -C $d log --oneline -1))" -ForegroundColor Green
}

function Push($r, $msg) {
  $d = Join-Path $Base $r
  if (-not (Test-Path (Join-Path $d ".git"))) { Write-Host "✗ No encuentro $d" -ForegroundColor Red; return }
  if (git -C $d status --porcelain) {
    git -C $d add -A
    git -C $d commit -q -m $msg
    Write-Host "  ${r}: commit '$msg'" -ForegroundColor DarkGray
  }
  $ahead = [int](git -C $d rev-list --count origin/master..master)
  if ($ahead -gt 0) {
    git -C $d pull --rebase -q origin master
    git -C $d push -q origin master
    Write-Host "✓ $r subido ($(git -C $d log --oneline -1))" -ForegroundColor Green
  } else {
    Write-Host "  ${r}: nada que subir" -ForegroundColor DarkGray
  }
}

function Am($archivo) {
  if (-not (Test-Path $archivo)) { Write-Host "✗ no existe $archivo" -ForegroundColor Red; exit 1 }
  $full = (Resolve-Path $archivo).Path
  $r = if ($full -like "*kiku-sushi-web*" -or (Split-Path -Leaf $full) -like "*web*") { "kiku-sushi-web" } else { "kiku-sushi-dashboard" }
  $d = Join-Path $Base $r
  Write-Host "Aplicando $(Split-Path -Leaf $full) en $r…" -ForegroundColor DarkGray
  git -C $d pull --rebase -q origin master
  if ($KeepCr) { git -C $d am --keep-cr $full } else { git -C $d am $full }
  if ($LASTEXITCODE -ne 0) { Write-Host "✗ git am falló. Mirá el mensaje de arriba; 'git -C $d am --abort' para deshacer." -ForegroundColor Red; exit 1 }
  git -C $d push -q origin master
  Remove-Item $full
  Write-Host "✓ ${r}: $(git -C $d log --oneline -1) — subido, parche borrado." -ForegroundColor Green
}

switch ($Cmd) {
  "status" { Write-Host "Repos en $Base" -ForegroundColor DarkGray; foreach ($r in $Repos) { Estado $r } }
  "pull"   { foreach ($r in $Repos) { Pull $r } }
  "push"   { $msg = if ($Arg) { $Arg } else { "Actualizacion desde $env:COMPUTERNAME $(Get-Date -Format yyyy-MM-dd)" }; foreach ($r in $Repos) { Push $r $msg } }
  "am"     { Am $Arg }
  default  { Write-Host "uso: kiku-sync.ps1 [status|pull|push ""mensaje""|am archivo.patch [-KeepCr]]" }
}
