<#
.SYNOPSIS
  Imports Chart of Accounts rows from COA.csv into SQL Server (ChartofAccounts table).

  Alternative (no PowerShell): from repo root, stop any running API, then run:
    dotnet run --project Cimmple_API/CimmpleAPI -- import-coa "C:\Users\N. Singh\Desktop\COA.csv"

.PARAMETER CsvPath
  Full path to COA.csv (default: current user's Desktop\COA.csv).

.PARAMETER ConnectionString
  Override connection string (default: LocalDB CimmpleDb from appsettings.Development.json).
#>
param(
    [string] $CsvPath = (Join-Path ([Environment]::GetFolderPath("Desktop")) "COA.csv"),
    [string] $ConnectionString = "Data Source=(localdb)\MSSQLLocalDB;Initial Catalog=CimmpleDb;Integrated Security=True;TrustServerCertificate=True;"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $CsvPath)) {
    throw "CSV not found: $CsvPath"
}

Add-Type -AssemblyName System.Data

function Normalize-AccountType([string] $t) {
    $x = if ($null -eq $t) { "" } else { $t.Trim() }
    if ($x -eq "Liabilities") { return "Liability" }
    return $x
}

function Parse-NullableInt([string] $s) {
    if ($null -eq $s) { return $null }
    $t = $s.Trim()
    if ($t -eq "" -or $t -eq "NULL") { return $null }
    $n = 0
    if (-not [int]::TryParse($t, [ref]$n)) { return $null }
    if ($n -eq -1 -or $n -eq -2) { return $null }
    return [int]$n
}

function Parse-Bool([string] $s) {
    $t = if ($null -eq $s) { "" } else { $s.Trim() }
    return ($t -eq "1" -or $t -eq "true" -or $t -eq "True")
}

function Add-NullableParam($command, [string] $name, $value) {
    $p = $command.Parameters.Add($name, [System.Data.SqlDbType]::Int)
    if ($null -eq $value) {
        $p.Value = [DBNull]::Value
    }
    else {
        $p.Value = $value
    }
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

$lines = Get-Content -LiteralPath $CsvPath -Encoding UTF8
$conn = New-Object System.Data.SqlClient.SqlConnection $ConnectionString
$conn.Open()
$tx = $conn.BeginTransaction()

try {
    $updated = 0
    $inserted = 0
    $skipped = 0

    $updSql = @"
UPDATE dbo.ChartofAccounts SET
  AccountCode = @AccountCode,
  AccountName = @AccountName,
  AccountType = @AccountType,
  IsActive = @IsActive,
  Groupid = @Groupid,
  Subgroupid = @Subgroupid,
  Subgroupid2 = @Subgroupid2,
  Subgroupid3 = @Subgroupid3,
  Linegroupid = @Linegroupid,
  Tenantid = @Tenantid,
  MainGroup = @MainGroup
WHERE AccountID = @AccountID
"@

    foreach ($line in $lines) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $cols = Parse-CsvLine $line
        if ($cols.Count -gt 0 -and $cols[0].Trim() -eq "AccountID") { continue }
        if ($cols.Count -lt 12) {
            $skipped++
            continue
        }

        $accountId = 0
        if (-not [int]::TryParse($cols[0].Trim(), [ref]$accountId) -or $accountId -le 0) {
            $skipped++
            continue
        }

        $tenantId = 0
        if (-not [int]::TryParse($cols[10].Trim(), [ref]$tenantId)) {
            $skipped++
            continue
        }

        $accountCode = $cols[1].Trim()
        $accountName = $cols[2].Trim().Trim('"').Trim()
        $accountType = Normalize-AccountType $cols[3]
        $isActive = Parse-Bool $cols[4]
        $groupId = Parse-NullableInt $cols[5]
        $subId = Parse-NullableInt $cols[6]
        $subId2 = Parse-NullableInt $cols[7]
        $subId3 = Parse-NullableInt $cols[8]
        $lineGroupId = Parse-NullableInt $cols[9]
        $mainGroup = $cols[11].Trim().Trim('"').Trim()

        $cmdUpd = $conn.CreateCommand()
        $cmdUpd.Transaction = $tx
        $cmdUpd.CommandText = $updSql
        [void]$cmdUpd.Parameters.AddWithValue("@AccountID", $accountId)
        [void]$cmdUpd.Parameters.AddWithValue("@AccountCode", $accountCode)
        [void]$cmdUpd.Parameters.AddWithValue("@AccountName", $accountName)
        [void]$cmdUpd.Parameters.AddWithValue("@AccountType", $accountType)
        [void]$cmdUpd.Parameters.AddWithValue("@IsActive", $isActive)
        Add-NullableParam $cmdUpd "Groupid" $groupId
        Add-NullableParam $cmdUpd "Subgroupid" $subId
        Add-NullableParam $cmdUpd "Subgroupid2" $subId2
        Add-NullableParam $cmdUpd "Subgroupid3" $subId3
        Add-NullableParam $cmdUpd "Linegroupid" $lineGroupId
        [void]$cmdUpd.Parameters.AddWithValue("@Tenantid", $tenantId)
        [void]$cmdUpd.Parameters.AddWithValue("@MainGroup", $mainGroup)

        $n = $cmdUpd.ExecuteNonQuery()
        if ($n -gt 0) {
            $updated++
            continue
        }

        $cmdOn = $conn.CreateCommand()
        $cmdOn.Transaction = $tx
        $cmdOn.CommandText = "SET IDENTITY_INSERT dbo.ChartofAccounts ON"
        [void]$cmdOn.ExecuteNonQuery()

        $insSql = @"
INSERT INTO dbo.ChartofAccounts (
  AccountID, AccountCode, AccountName, AccountType, IsActive,
  Groupid, Subgroupid, Subgroupid2, Subgroupid3, Linegroupid, Tenantid, MainGroup
) VALUES (
  @AccountID, @AccountCode, @AccountName, @AccountType, @IsActive,
  @Groupid, @Subgroupid, @Subgroupid2, @Subgroupid3, @Linegroupid, @Tenantid, @MainGroup
)
"@
        $cmdIns = $conn.CreateCommand()
        $cmdIns.Transaction = $tx
        $cmdIns.CommandText = $insSql
        [void]$cmdIns.Parameters.AddWithValue("@AccountID", $accountId)
        [void]$cmdIns.Parameters.AddWithValue("@AccountCode", $accountCode)
        [void]$cmdIns.Parameters.AddWithValue("@AccountName", $accountName)
        [void]$cmdIns.Parameters.AddWithValue("@AccountType", $accountType)
        [void]$cmdIns.Parameters.AddWithValue("@IsActive", $isActive)
        Add-NullableParam $cmdIns "Groupid" $groupId
        Add-NullableParam $cmdIns "Subgroupid" $subId
        Add-NullableParam $cmdIns "Subgroupid2" $subId2
        Add-NullableParam $cmdIns "Subgroupid3" $subId3
        Add-NullableParam $cmdIns "Linegroupid" $lineGroupId
        [void]$cmdIns.Parameters.AddWithValue("@Tenantid", $tenantId)
        [void]$cmdIns.Parameters.AddWithValue("@MainGroup", $mainGroup)
        try {
            [void]$cmdIns.ExecuteNonQuery()
            $inserted++
        }
        catch {
            throw
        }
        finally {
            $cmdOff = $conn.CreateCommand()
            $cmdOff.Transaction = $tx
            $cmdOff.CommandText = "SET IDENTITY_INSERT dbo.ChartofAccounts OFF"
            [void]$cmdOff.ExecuteNonQuery()
        }
    }

    $tx.Commit()
    Write-Host "COA import finished. Updated: $updated, Inserted: $inserted, Skipped: $skipped"
}
catch {
    $tx.Rollback()
    throw
}
finally {
    $conn.Close()
}
