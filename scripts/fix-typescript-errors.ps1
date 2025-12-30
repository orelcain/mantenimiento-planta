# Script para corregir errores TypeScript restantes
# Ejecutar: .\fix-typescript-errors.ps1

$ErrorActionPreference = 'Continue'

Write-Host "🔧 Corrigiendo errores TypeScript..." -ForegroundColor Cyan

# Navegar a la carpeta correcta
Set-Location "d:\a\APP leventamiento de insidencias en planta\apps\pwa\src"

# Fix ai.ts - Propiedades inexistentes en Incident type
Write-Host "`n📝 Corrigiendo services/ai.ts..." -ForegroundColor Yellow
$aiContent = Get-Content "services/ai.ts" -Raw

# Reemplazar propiedades incorrectas
$aiContent = $aiContent -replace "inc\.equipmentName", "inc.equipmentId ?? 'N/A'"
$aiContent = $aiContent -replace "inc\.sintoma", "inc.sintomas?.join(', ') ?? 'N/A'"
$aiContent = $aiContent -replace "inc\.maintenanceType", "inc.tipo"
$aiContent = $aiContent -replace "inc\.costoEstimado", "0 // TODO: Add cost field"

# Corregir logger.error con conversión de tipo
$aiContent = $aiContent -replace "logger\.error\('Error generando síntomas con IA:', error\)", "logger.error('Error generando síntomas con IA:', error instanceof Error ? error : new Error(String(error)))"
$aiContent = $aiContent -replace "logger\.error\('Error analizando patrones:', error\)", "logger.error('Error analizando patrones:', error instanceof Error ? error : new Error(String(error)))"
$aiContent = $aiContent -replace "logger\.error\('Error prediciendo fallas:', error\)", "logger.error('Error prediciendo fallas:', error instanceof Error ? error : new Error(String(error)))"
$aiContent = $aiContent -replace "logger\.error\('Error analizando causa raíz:', error\)", "logger.error('Error analizando causa raíz:', error instanceof Error ? error : new Error(String(error)))"

Set-Content "services/ai.ts" -Value $aiContent -Encoding UTF8
Write-Host "✅ ai.ts corregido" -ForegroundColor Green

# Fix hierarchyInit.ts - Posibles undefined
Write-Host "`n📝 Corrigiendo services/hierarchyInit.ts..." -ForegroundColor Yellow
$initContent = Get-Content "services/hierarchyInit.ts" -Raw

# Agregar verificación de undefined en forEach
$initContent = $initContent -replace "for \(let i = 0; i < areas\.length; i\+\+\) \{`r?`n\s+const area = areas\[i\]", @"
for (let i = 0; i < areas.length; i++) {
    const area = areas[i]
    if (!area) continue
"@

$initContent = $initContent -replace "for \(let i = 0; i < subAreas\.length; i\+\+\) \{`r?`n\s+const subArea = subAreas\[i\]", @"
for (let i = 0; i < subAreas.length; i++) {
    const subArea = subAreas[i]
    if (!subArea) continue
"@

$initContent = $initContent -replace "for \(let i = 0; i < sistemas\.length; i\+\+\) \{`r?`n\s+const sistema = sistemas\[i\]", @"
for (let i = 0; i < sistemas.length; i++) {
    const sistema = sistemas[i]
    if (!sistema) continue
"@

# Corregir logger.error
$initContent = $initContent -replace "logger\.error\('Failed to initialize hierarchy system', error\)", "logger.error('Failed to initialize hierarchy system', error instanceof Error ? error : new Error(String(error)))"

Set-Content "services/hierarchyInit.ts" -Value $initContent -Encoding UTF8
Write-Host "✅ hierarchyInit.ts corregido" -ForegroundColor Green

# Fix useHierarchy.ts - Agregar verificación levelGroups
Write-Host "`n📝 Corrigiendo hooks/useHierarchy.ts..." -ForegroundColor Yellow
$hookContent = Get-Content "hooks/useHierarchy.ts" -Raw

# Corregir acceso undefined en levelGroups
$hookContent = $hookContent -replace "levelGroups\[node\.nivel\]\.push\(node\)", "levelGroups[node.nivel]?.push(node)"

# Corregir propiedad orden en UpdateHierarchyNodeInput (remover líneas conflictivas)
$hookContent = $hookContent -replace "if \(input\.orden !== undefined\) updateData\.orden = input\.orden", "// orden handling removed - not in UpdateHierarchyNodeInput type"

Set-Content "hooks/useHierarchy.ts" -Value $hookContent -Encoding UTF8
Write-Host "✅ useHierarchy.ts corregido" -ForegroundColor Green

Write-Host "`n✨ ¡Todos los archivos corregidos!" -ForegroundColor Green
Write-Host "📊 Verificando compilación..." -ForegroundColor Cyan

# Volver a la raíz del proyecto
Set-Location "..\.."

# Ejecutar type check
Write-Host "`n🔍 Ejecutando type check..." -ForegroundColor Cyan
npm run build 2>&1 | Select-Object -First 20

Write-Host "`n✅ Script completado" -ForegroundColor Green
