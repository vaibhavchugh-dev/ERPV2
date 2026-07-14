# System Settings Table Setup

## Issue
The SystemSettings table doesn't exist in the database, causing a 500 error when trying to load system settings.

## Solution

### Step 1: Run the SQL Script
Execute the SQL script to create the SystemSettings table:

**File:** `Cimmple_API/CimmpleAPI/create_systemsettings_table.sql`

You can run this script using:
1. **SQL Server Management Studio (SSMS):**
   - Open SSMS
   - Connect to your database server
   - Open the SQL script file
   - Execute it against your database (CimmpleDb)

2. **Command Line (sqlcmd):**
   ```bash
   sqlcmd -S (localdb)\MSSQLLocalDB -d CimmpleDb -i create_systemsettings_table.sql
   ```

3. **Visual Studio:**
   - Open SQL Server Object Explorer
   - Right-click on your database
   - Select "New Query"
   - Paste the SQL script content
   - Execute

### Step 2: Verify Table Creation
After running the script, verify the table was created:
```sql
SELECT * FROM SystemSettings;
```

### Step 3: Test the API
The System Settings page should now work correctly. The API will:
- Return default settings if no settings exist for a tenant
- Allow you to save settings which will be stored in the database

## Temporary Workaround
The controller has been updated to handle the missing table gracefully. It will return default settings even if the table doesn't exist, but **settings cannot be saved** until the table is created.

## Table Structure
The SystemSettings table includes:
- Date & Time settings (format, timezone, locale)
- Currency & Number formatting
- Security settings (password requirements, session timeout)
- Email/SMTP configuration
- System preferences (page size, notifications)

All fields have appropriate default values.

















