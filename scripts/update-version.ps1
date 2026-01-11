# Script de actualización de versiones
# Uso: .\update-version.ps1 -NewVersion "2.13.3" -Type "minor"
# Tipos: major (1.0.0 -> 2.0.0), minor (1.0.0 -> 1.1.0), patch (1.0.0 -> 1.0.1)

param(
    [Parameter(Mandatory=$false)]
    [string]$NewVersion,
    
    [Parameter(Mandatory=$false)]
    [ValidateSet('major', 'minor', 'patch')]
    [string]$Type = 'patch'
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Actualizador de Versiones - Sistema de Mantenimiento" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Gray

# Detectar versión actual
$currentVersion = (Get-Content "package.json" | ConvertFrom-Json).version
Write-Host "📌 Versión actual: $currentVersion" -ForegroundColor Yellow

# Calcular nueva versión si no se especificó
if (-not $NewVersion) {
    $parts = $currentVersion.Split('.')
    $major = [int]$parts[0]
    $minor = [int]$parts[1]
    $patch = [int]$parts[2]
    
    switch ($Type) {
        'major' { $major++; $minor = 0; $patch = 0 }
        'minor' { $minor++; $patch = 0 }
        'patch' { $patch++ }
    }
    
    $NewVersion = "$major.$minor.$patch"
}

Write-Host "✨ Nueva versión: $NewVersion" -ForegroundColor Green
Write-Host ""

# Confirmar con el usuario
$confirm = Read-Host "¿Continuar con la actualización? (s/n)"
if ($confirm -ne 's') {
    Write-Host "❌ Operación cancelada" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📝 Actualizando archivos..." -ForegroundColor Cyan

# Archivos a actualizar
$files = @(
    @{Path="package.json"; Pattern='"version":\s*"[^"]+"'; Replace="`"version`": `"$NewVersion`""},
    @{Path="apps/pwa/package.json"; Pattern='"version":\s*"[^"]+"'; Replace="`"version`": `"$NewVersion`""},
    @{Path="apps/pwa/vite.config.ts"; Pattern="version:\s*'[^']+'"; Replace="version: '$NewVersion'"},
    @{Path="apps/pwa/public/version.json"; Pattern='"version":\s*"[^"]+"'; Replace="`"version`": `"$NewVersion`""},
    @{Path="iot/esp32-sensor/src/main.cpp"; Pattern='firmwareVersion",\s*"[^"]+"'; Replace="firmwareVersion`", `"$NewVersion`""},
    @{Path="VERSION.md"; Pattern='Versión Actual:\s*\*\*v[^\*]+\*\*'; Replace="Versión Actual: **v$NewVersion**"}
)

$updated = 0
foreach ($file in $files) {
    if (Test-Path $file.Path) {
        $content = Get-Content $file.Path -Raw
        $newContent = $content -replace $file.Pattern, $file.Replace
        
        if ($content -ne $newContent) {
            Set-Content $file.Path -Value $newContent -NoNewline
            Write-Host "  ✅ $($file.Path)" -ForegroundColor Green
            $updated++
        } else {
            Write-Host "  ⚠️  $($file.Path) (sin cambios)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ❌ $($file.Path) (no encontrado)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "✨ Actualizados: $updated archivos" -ForegroundColor Green

# Verificar versiones
Write-Host ""
Write-Host "🔍 Verificando sincronización..." -ForegroundColor Cyan
$versions = @()
$versions += (Get-Content "package.json" | ConvertFrom-Json).version
$versions += (Get-Content "apps/pwa/package.json" | ConvertFrom-Json).version
$versions += ((Get-Content "apps/pwa/vite.config.ts" -Raw) -match "version:\s*'([^']+)'") ? $Matches[1] : "ERROR"
$versions += (Get-Content "apps/pwa/public/version.json" | ConvertFrom-Json).version
$versions += ((Get-Content "iot/esp32-sensor/src/main.cpp" -Raw) -match 'firmwareVersion",\s*"([^"]+)"') ? $Matches[1] : "ERROR"

$allSame = ($versions | Select-Object -Unique).Count -eq 1

if ($allSame -and $versions[0] -eq $NewVersion) {
    Write-Host "  ✅ Todas las versiones sincronizadas en v$NewVersion" -ForegroundColor Green
} else {
    Write-Host "  ❌ ERROR: Versiones desincronizadas!" -ForegroundColor Red
    Write-Host "  package.json (raíz): $($versions[0])"
    Write-Host "  apps/pwa/package.json: $($versions[1])"
    Write-Host "  apps/pwa/vite.config.ts: $($versions[2])"
    Write-Host "  apps/pwa/public/version.json: $($versions[3])"
    Write-Host "  ESP32 firmware: $($versions[4])"
    exit 1
}

Write-Host ""
Write-Host "🏗️  Compilando PWA..." -ForegroundColor Cyan
pnpm -C apps/pwa build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error en build" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Build exitoso!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Siguientes pasos:" -ForegroundColor Cyan
Write-Host "  1. Actualiza VERSION.md con el changelog"
Write-Host "  2. git add -A"
Write-Host "  3. git commit -m `"chore: bump version to v$NewVersion`""
Write-Host "  4. git push"
Write-Host ""
Write-Host "🎉 Versión $NewVersion lista!" -ForegroundColor Green
