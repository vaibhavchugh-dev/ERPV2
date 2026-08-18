<#
.SYNOPSIS
  Seeds the canonical manufacturing Chart of Accounts for a tenant (idempotent by AccountCode).

  Does not delete or overwrite existing accounts (including legacy codes already in use).

.PARAMETER TenantId
  Tenant to seed (default: 1).

.EXAMPLE
  .\Seed-COA.ps1
  .\Seed-COA.ps1 -TenantId 101
#>
param(
    [int] $TenantId = 1
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Push-Location $repoRoot
try {
    dotnet run --project "Cimmple_API/CimmpleAPI/CimmpleAPI.csproj" -- seed-coa $TenantId
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}
