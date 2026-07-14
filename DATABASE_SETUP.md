# Database Setup Guide

## ⚠️ SQL Server Connection Issue

The migration failed because SQL Server is not accessible at `localhost`.

---

## Solution Options

### Option 1: Use SQL Server LocalDB (Recommended for Development)

**Update `appsettings.json` connection string:**

```json
"ConnectionStrings": {
  "DB": "Data Source=(localdb)\\MSSQLLocalDB;Initial Catalog=CimmpleDB;Integrated Security=True;TrustServerCertificate=True;"
}
```

**Then apply migration:**
```bash
cd C:\Narinder\Cimmple\CursorERP\Cimmple_API\CimmpleAPI
dotnet tool run dotnet-ef database update
```

---

### Option 2: Use Full SQL Server Instance

**If you have SQL Server installed, update connection string:**

```json
"ConnectionStrings": {
  "DB": "Data Source=YOUR_SERVER_NAME\\INSTANCE_NAME;Initial Catalog=CimmpleDB;Integrated Security=True;TrustServerCertificate=True;"
}
```

**Common examples:**
- `Data Source=localhost\\SQLEXPRESS;Initial Catalog=CimmpleDB;Integrated Security=True;TrustServerCertificate=True;`
- `Data Source=.;Initial Catalog=CimmpleDB;Integrated Security=True;TrustServerCertificate=True;` (default instance)

---

### Option 3: Use SQL Server Authentication

**If using SQL Server authentication:**

```json
"ConnectionStrings": {
  "DB": "Data Source=YOUR_SERVER;Initial Catalog=CimmpleDB;User ID=sa;Password=YOUR_PASSWORD;TrustServerCertificate=True;"
}
```

---

## Check SQL Server Status

### Check if SQL Server is running:
```powershell
Get-Service -Name "*SQL*"
```

### Check LocalDB instances:
```powershell
sqllocaldb info
```

### Start LocalDB:
```powershell
sqllocaldb start MSSQLLocalDB
```

---

## Steps to Apply Migration

1. **Update connection string** in `appsettings.json`
2. **Verify SQL Server is running**
3. **Apply migration:**
   ```bash
   cd C:\Narinder\Cimmple\CursorERP\Cimmple_API\CimmpleAPI
   dotnet tool run dotnet-ef database update
   ```

---

## Connection String Examples

### LocalDB (Default):
```
Data Source=(localdb)\\MSSQLLocalDB;Initial Catalog=CimmpleDB;Integrated Security=True;TrustServerCertificate=True;
```

### SQL Express:
```
Data Source=localhost\\SQLEXPRESS;Initial Catalog=CimmpleDB;Integrated Security=True;TrustServerCertificate=True;
```

### Default Instance:
```
Data Source=.;Initial Catalog=CimmpleDB;Integrated Security=True;TrustServerCertificate=True;
```

### Named Instance:
```
Data Source=YOUR_COMPUTER_NAME\\INSTANCE_NAME;Initial Catalog=CimmpleDB;Integrated Security=True;TrustServerCertificate=True;
```

---

## Troubleshooting

### Error: "Server not found"
- SQL Server is not running
- Wrong server/instance name
- SQL Server Browser service not running

### Error: "Cannot open database"
- Database doesn't exist (will be created by migration)
- Insufficient permissions

### Error: "Login failed"
- Wrong credentials
- SQL Server authentication not enabled

---

**Next Steps:** Update the connection string and try again!







