# Accounting unit tests

Service-level tests for Accounting rules (no database / API server required).

## Run

**Important:** If Visual Studio / `CimmpleAPI` is running, it locks `bin\Debug\...\CimmpleAPI.exe` and `dotnet test` fails with MSB3027.

### Option A — Keep API running (recommended while developing)

Build/test into a separate folder so the locked exe is not overwritten:

```powershell
cd C:\Narinder\Cimmple\ERPV2
dotnet test Cimmple_API\CimmpleAPI.Tests\CimmpleAPI.Tests.csproj -o Cimmple_API\_test_out
```

### Option B — Stop the API first

1. Stop debugging / close the running CimmpleAPI process in Visual Studio.  
2. Then:

```powershell
cd C:\Narinder\Cimmple\ERPV2
dotnet test Cimmple_API\CimmpleAPI.Tests\CimmpleAPI.Tests.csproj
```

Look for: `Passed!  - Failed: 0, Passed: 36, ...`

The NU1603 Serilog warning is harmless and can be ignored.


## What is covered

| Area | Class |
|------|--------|
| Fiscal year bounds (calendar + Apr FY) | `AccountingRules` |
| Open balance / fully paid | `AccountingRules` |
| AP approval limit gate | `AccountingRules` |
| Bank tx sign (Payment/Deposit/Withdrawal) | `AccountingRules` |
| Aging buckets | `AccountingRules` |
| Payment term due date | `AccountingRules` |
| Period key normalize / format | `GlWorkflowService` |

Helpers live in `CimmpleAPI/Services/AccountingRules.cs` and are used by Accounting / VendorInvoice controllers.
