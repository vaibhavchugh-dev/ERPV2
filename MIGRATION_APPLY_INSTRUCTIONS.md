# How to Apply Database Migration

## ⚠️ Connection Issue

The automatic migration application failed due to SQL Server connection issues. Here are your options:

---

## Option 1: Generate and Run SQL Script Manually (Recommended)

### Step 1: Generate SQL Script
```bash
cd C:\Narinder\Cimmple\CursorERP\Cimmple_API\CimmpleAPI
dotnet tool run dotnet-ef migrations script --output migration.sql
```

This creates a `migration.sql` file with all the SQL commands.

### Step 2: Run SQL Script
1. Open SQL Server Management Studio (SSMS)
2. Connect to your SQL Server instance
3. Create database: `CREATE DATABASE CimmpleDB;`
4. Open `migration.sql` file
5. Execute the script

---

## Option 2: Fix Connection String and Retry

### Update Connection String in `appsettings.json`

**For LocalDB:**
```json
"DB": "Data Source=(localdb)\\MSSQLLocalDB;Initial Catalog=CimmpleDB;Integrated Security=True;TrustServerCertificate=True;"
```

**For SQL Express:**
```json
"DB": "Data Source=.\\SQLEXPRESS;Initial Catalog=CimmpleDB;Integrated Security=True;TrustServerCertificate=True;"
```

**For Default Instance:**
```json
"DB": "Data Source=.;Initial Catalog=CimmpleDB;Integrated Security=True;TrustServerCertificate=True;"
```

### Then Apply Migration:
```bash
cd C:\Narinder\Cimmple\CursorERP\Cimmple_API\CimmpleAPI
dotnet tool run dotnet-ef database update
```

---

## Option 3: Use Visual Studio

1. Open the project in Visual Studio
2. Open **Package Manager Console**
3. Run: `Update-Database`
4. This will use the connection string from `appsettings.json`

---

## Option 4: Check SQL Server Status

### Check if SQL Server is running:
```powershell
Get-Service -Name "*SQL*"
```

### Check LocalDB status:
```powershell
sqllocaldb info MSSQLLocalDB
sqllocaldb start MSSQLLocalDB
```

### List available SQL Server instances:
```powershell
Get-Service | Where-Object {$_.DisplayName -like "*SQL*"}
```

---

## Troubleshooting Connection Strings

### Common Issues:

1. **Backslash Escaping in JSON:**
   - Use double backslash: `(localdb)\\MSSQLLocalDB`
   - NOT single backslash: `(localdb)\MSSQLLocalDB`

2. **Instance Name:**
   - LocalDB: `(localdb)\\MSSQLLocalDB`
   - SQL Express: `.\\SQLEXPRESS` or `localhost\\SQLEXPRESS`
   - Default: `.` or `localhost`

3. **Database Name:**
   - Will be created automatically if it doesn't exist
   - Or create manually: `CREATE DATABASE CimmpleDB;`

---

## Verify Connection

### Test connection string using PowerShell:
```powershell
$connectionString = "Data Source=(localdb)\\MSSQLLocalDB;Initial Catalog=CimmpleDB;Integrated Security=True;TrustServerCertificate=True;"
$connection = New-Object System.Data.SqlClient.SqlConnection($connectionString)
try {
    $connection.Open()
    Write-Host "Connection successful!"
    $connection.Close()
} catch {
    Write-Host "Connection failed: $_"
}
```

---

## Next Steps After Database Creation

Once the database is created:

1. ✅ Verify tables were created
2. ✅ Start building modules
3. ✅ Test API endpoints
4. ✅ Connect frontend to backend

---

**Note:** The migration file is ready at `Cimmple_API/CimmpleAPI/Data/Migrations/20251223153944_InitialCreate.cs`

You can review it to see exactly what will be created in the database.







