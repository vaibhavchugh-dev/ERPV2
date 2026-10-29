# Tenant login seat limits

Design for a per-tenant login seat limit based on the client's subscription. This document is the plan to review. Do not implement until it is approved.

## Goal

A tenant may have many employees. Only employees who can sign in consume a seat. When the subscription limit is reached, no additional employee can be given login access until a seat is released or a platform administrator raises the limit.

Employee records can still be created with no login. The limit is stored per tenant. It is not hardcoded and it is not derived from the free-text Plan label.

## What occupies a seat

Employees and login users are the same `UserDetails` row. Today, login access means a non-blank username and a non-blank password (`EmployeeController.GetEmployees`). Sign-in also requires an active account (`AuthService.IsUserActive`: blank, `Active`, or `A`).

A row occupies one seat only when all of these are true:

- It belongs to that tenant.
- It is not a vendor-portal account (`VendorId` is null or 0). This is the same filter Employee Master and User Management already use.
- Username and password are both set.
- Status is active under the existing sign-in rule.

These do not use a seat:

- An employee saved with Login Access off.
- An import row that has a name but no password.
- A vendor-portal account.

A seat is released when:

- Login Access is turned off on Employee Master (username and password are cleared).
- Status is set to Inactive from Employee Master, User Management update, or User Management delete.
- The employee is deleted.

Existing admin-protection rules still run first. The last administrator still cannot be deactivated. The seat check runs only after those rules allow the save.

The limit is not checked at login or token refresh. People who already occupy a seat keep signing in if the subscription is later lowered. New enables and reactivations stop until usage is back within the limit.

## Database

Add one nullable integer on the existing tenant registry. Do not add a new table. Do not map the number from `Plan`.

| Column | Table | Meaning |
| --- | --- | --- |
| `LoginSeatLimit` `int NULL` | `CimmpleFlow.Tenant` | Subscription cap. `NULL` means no cap has been set. |

Apply it the same way other tenant columns are added:

- `TenantSchemaService.UpgradeSql` uses a `COL_LENGTH` check, then `ALTER TABLE`.
- Mirror the statement in `Cimmple_API/Scripts/AddTenantRegistry.sql`.
- Add the property on `Tenant` and map it in `CimmpleDbContext`.

### Migration

Existing tenant rows stay `NULL`. Do not change passwords, statuses, or sessions. Current accounts keep working, and they are not capped by an invented number. A platform administrator sets the real subscription count afterward.

New clients must supply a positive limit on the create-client form. That number is stored as entered. Provisioning the first administrator uses one seat, so a limit below 1 is rejected.

Backfilling existing tenants to their current occupied count is not part of this plan. That would block new logins immediately. Do that only if it is explicitly requested later. It still would not sign anyone out.

## Enforcement

One service, `LoginSeatService`, owns the rule. Callers pass the tenant, the user being saved (`0` for a new row), and whether the saved row will occupy a seat.

The service:

1. Opens a transaction, or joins one that is already open. Import and provisioning already use a transaction.
2. Takes `sp_getapplock` on `cimmple-login-seats-{tenantId}` for that transaction. This matches tenant provisioning and NCR code locks.
3. Reads `LoginSeatLimit`. `NULL` allows the save.
4. Counts other occupied seats for that tenant only.
5. If this save would newly occupy a seat and `used >= limit`, returns **409** and does not save.

Saving someone who already occupies a seat, or turning login off, does not need a free seat. The lock is held through `SaveChanges` and commit, so two simultaneous enables cannot both pass a 2-of-3 check.

Conflict response:

```json
{
  "error": "Login seat limit reached (3 of 3 in use). Deactivate another login or ask Cimmple to increase the seat limit.",
  "loginSeatLimit": 3,
  "usedSeats": 3,
  "availableSeats": 0
}
```

| Path | When the check runs |
| --- | --- |
| `POST api/Employee/SaveEmployee` | New login, enabling login, or Inactive to Active while credentials remain |
| `POST api/Employee/ImportEmployees` | A row that would newly occupy a seat. That row fails. Seats reserved earlier in the same file count. |
| `PUT api/UserManagement/UpdateUser` | Status back to Active while username and password exist |
| `POST api/UserManagement/ResetPassword` | The account had no password and will become able to sign in |
| `TenantProvisioningService.ProvisionAsync` | The new administrator always takes one seat |
| `POST api/Auth/BootstrapPassword` | Development-only password bootstrap, so a local call cannot bypass the cap |

These stay unchanged:

- Login and refresh.
- Vendor-portal user create.
- Password reset for someone who already has a password.
- Attendance password-hash upgrade.
- Hard delete. The row is gone, so the seat is free.

Tenant isolation stays on `TenantScopeFilter`. A tenant token cannot name another tenant. `PlatformTenants` stays `SkipTenantScope` and requires `IsPlatformAdmin()`.

## Who can change the limit

Only support staff with `PlatformAdmin = true`, the same gate as `PlatformTenantsController`.

- `POST api/PlatformTenants/SetLoginSeatLimit/{tenantId}` with `{ "loginSeatLimit": 3 }`.
- Minimum is 1.
- Lowering the limit below current usage is allowed. Existing seats stay until they are released. `availableSeats` is 0 while usage is over the cap.
- Create-client (`ProvisionTenantRequest`) gains a required `loginSeatLimit`. The Plan text box stays a label and does not set the number.

Tenant administrators get a read-only call, scoped to the token tenant. No new permission is added.

`GET api/UserManagement/LoginSeatUsage`

```json
{
  "loginSeatLimit": 5,
  "usedSeats": 2,
  "availableSeats": 3,
  "configured": true
}
```

When the column is `NULL`, `configured` is false and `loginSeatLimit` is null.

## UI flow

The seat number is edited in one place: **Support → Clients**, by a platform administrator. Tenant administrators see usage only. They use or free a seat by turning login on or off.

| Who | Screen | What they can do |
| --- | --- | --- |
| Platform admin | Support → Clients, New client | Enter Login seats before the client is created. The first administrator uses 1 of those seats. |
| Platform admin | Support → Clients, open a client, Details | See `2 of 5 used` and change the number. Save updates only that client. |
| Tenant admin | User Management | See `2 of 5 used, 3 available`. Cannot edit the number. |
| Tenant admin | Employee Master, Login Access | Turns a seat on or off for one employee. |

A tenant user never gets a field that raises the limit. If they need more seats, they ask Cimmple, and a platform administrator changes the client record.

### New client

On the New client form, put **Login seats** next to Plan. Leave it empty. There is no hardcoded default. Create stays disabled until the number is at least 1. After create, the client detail shows `1 of N used` because the new administrator already has a login.

### Change a subscription later

Details currently shows a single Users count. Replace that line with login seats: used, limit, and available. An inline number and Save is enough. No new page.

- Raising 3 to 5 applies immediately. The next time that tenant opens User Management, two more logins can be enabled.
- Lowering below current usage needs a confirm step: "4 people can still sign in. No one is signed out. New logins stay blocked until usage is back to 3." Existing sessions keep working.

The client list card can show the same ratio next to the plan label, for example `2/5 seats`.

### What the tenant sees

Put the meter on the User Management header, next to the existing subtitle:

`Login seats: 2 of 5 used · 3 available`

Reload that line after each status change or delete. If the limit has not been set, show `Login seats: not set` and do not block anyone.

### Turning a seat on or off

This stays on the employee. There is no separate seat screen.

1. Save the person in Employee Master with Login Access off. That never uses a seat.
2. Check Login Access and set the password. That uses one seat on save.
3. Uncheck Login Access, or set the employee Inactive in User Management. That frees the seat on save.
4. Set them Active again. That uses a seat again, if one is free.

If the tenant is already at the limit, the employee form stays usable. Disable only the Login Access checkbox, with:

`Login seat limit reached (5 of 5 in use). Deactivate another login or ask Cimmple to increase the seat limit.`

Show the same line on User Management when someone tries to move a login account from Inactive back to Active. Saving the employee without login still works.

The checkbox can warn early. The server is what stops the extra login, including a direct API call.

## Affected files

- `Cimmple_API/CimmpleAPI/Data/Models/Tenant.cs`
- `Cimmple_API/CimmpleAPI/Data/CimmpleDbContext.cs`
- `Cimmple_API/CimmpleAPI/Services/TenantSchemaService.cs`
- `Cimmple_API/Scripts/AddTenantRegistry.sql`
- New `Cimmple_API/CimmpleAPI/Services/LoginSeatService.cs`
- `Cimmple_API/CimmpleAPI/Controllers/EmployeeController.cs`
- `Cimmple_API/CimmpleAPI/Controllers/UserManagementController.cs`
- `Cimmple_API/CimmpleAPI/Controllers/AuthController.cs` (development bootstrap only)
- `Cimmple_API/CimmpleAPI/Controllers/PlatformTenantsController.cs`
- `Cimmple_API/CimmpleAPI/Services/Tenancy/TenantProvisioningService.cs`
- `Cimmple_UI/src/SupportStaff/SupportClientsPage.tsx`
- `Cimmple_UI/src/SupportStaff/PlatformTenantService.ts`
- `Cimmple_UI/src/Modules/UserManagement/UserManagement.tsx`
- `Cimmple_UI/src/Modules/UserManagement/UserManagementSlideout.tsx`
- `Cimmple_UI/src/Modules/Masters/EmployeeMasterSlideout.tsx`

Do not change unrelated permissions, vendor-portal login, or authentication for people who already have a seat.

## Tests

- Occupancy predicate: vendor accounts, missing password, and Inactive do not count. Active username plus password does.
- A null limit allows a new login.
- The next enable at the cap returns 409 with limit, used, and available.
- Re-saving someone who already has a seat succeeds.
- Deactivate, remove login, and delete each release a seat. Reactivation consumes one.
- Two concurrent enables with one seat left: one succeeds and one is rejected.
- Tenant A cannot consume tenant B.
- A tenant token cannot call `SetLoginSeatLimit`. A platform admin can.
- Import and provisioning respect the cap.
- Existing rows with `NULL` are not blocked.
- Lowering the limit below current usage does not sign existing users out.
