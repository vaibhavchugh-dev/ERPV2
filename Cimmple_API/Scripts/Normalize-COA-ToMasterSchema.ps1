<#
.SYNOPSIS
  Converts a legacy COA export into a CSV that matches dbo.ChartofAccounts columns (for SSMS import or dotnet import-coa).

.PARAMETER InputPath
  Source CSV path (no header; 12 columns in legacy order).

.PARAMETER OutputPath
  Destination path (UTF-8 with BOM optional; RFC 4180 quoting).

.NOTES
  Legacy column order: AccountID, AccountCode, AccountName, AccountType, IsActive,
    Groupid, Subgroupid, Subgroupid2, Subgroupid3, Linegroupid, Tenantid, MainGroup

  Output header matches SQL/EF: AccountID, AccountCode, AccountName, AccountType, IsActive,
    Groupid, Subgroupid, Subgroupid2, Subgroupid3, Linegroupid, Tenantid, MainGroup

  Transformations: Liabilities -> Liability; NULL / -1 / -2 in nullable int columns -> empty (NULL in DB).
#>
param(
    [Parameter(Mandatory = $true)]
    [string] $InputPath,
    [Parameter(Mandatory = $true)]
    [string] $OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $InputPath)) {
    throw "Input not found: $InputPath"
}

function Parse-CsvLine([string] $line) {
    $fields = New-Object System.Collections.Generic.List[string]
    $sb = New-Object System.Text.StringBuilder
    $inQuotes = $false
    for ($i = 0; $i -lt $line.Length; $i++) {
        $c = $line[$i]
        if ($c -eq '"') {
            $inQuotes = -not $inQuotes
            continue
        }
        if ($c -eq ',' -and -not $inQuotes) {
            [void]$fields.Add($sb.ToString())
            [void]$sb.Clear()
            continue
        }
        [void]$sb.Append($c)
    }
    [void]$fields.Add($sb.ToString())
    return ,$fields.ToArray()
}

function Escape-CsvField([string] $s) {
    if ($null -eq $s) { $s = "" }
    $mustQuote = $s.Contains('"') -or $s.Contains(',') -or $s.Contains("`r") -or $s.Contains("`n")
    $s = $s.Replace('"', '""')
    if ($mustQuote) { return '"' + $s + '"' }
    return $s
}

function Normalize-AccountType([string] $t) {
    $x = if ($null -eq $t) { "" } else { $t.Trim() }
    if ($x -eq "Liabilities") { return "Liability" }
    return $x
}

function Format-NullableIntCell([string] $s) {
    if ($null -eq $s) { return "" }
    $t = $s.Trim()
    if ($t -eq "" -or $t -eq "NULL") { return "" }
    $n = 0
    if (-not [int]::TryParse($t, [ref]$n)) { return "" }
    if ($n -eq -1 -or $n -eq -2) { return "" }
    return $n.ToString()
}

$header = "AccountID,AccountCode,AccountName,AccountType,IsActive,Groupid,Subgroupid,Subgroupid2,Subgroupid3,Linegroupid,Tenantid,MainGroup"
$outDir = Split-Path -Parent $OutputPath
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$sbOut = New-Object System.Text.StringBuilder
[void]$sbOut.AppendLine($header)

$lines = Get-Content -LiteralPath $InputPath -Encoding UTF8
foreach ($line in $lines) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $cols = Parse-CsvLine $line
    if ($cols.Count -lt 12) { continue }

    $accountId = $cols[0].Trim()
    $accountCode = $cols[1].Trim()
    $accountName = $cols[2].Trim().Trim('"').Trim()
    $accountType = Normalize-AccountType $cols[3]
    $isActive = $cols[4].Trim()
    $g = Format-NullableIntCell $cols[5]
    $sg = Format-NullableIntCell $cols[6]
    $sg2 = Format-NullableIntCell $cols[7]
    $sg3 = Format-NullableIntCell $cols[8]
    $lg = Format-NullableIntCell $cols[9]
    $tenantId = $cols[10].Trim()
    $mainGroup = $cols[11].Trim().Trim('"').Trim()

    $row = @(
        (Escape-CsvField $accountId),
        (Escape-CsvField $accountCode),
        (Escape-CsvField $accountName),
        (Escape-CsvField $accountType),
        (Escape-CsvField $isActive),
        (Escape-CsvField $g),
        (Escape-CsvField $sg),
        (Escape-CsvField $sg2),
        (Escape-CsvField $sg3),
        (Escape-CsvField $lg),
        (Escape-CsvField $tenantId),
        (Escape-CsvField $mainGroup)
    ) -join ","
    [void]$sbOut.AppendLine($row)
}

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($OutputPath, $sbOut.ToString(), $utf8NoBom)
Write-Host "Wrote $OutputPath ($($lines.Count) source lines processed)."
