-- Quick start after deploying auth:
-- 1) Run AddAuthAndLocationColumns.sql
-- 2) In Development, set a password for an existing user:
--
-- POST http://localhost:5172/api/Auth/BootstrapPassword
-- {
--   "username": "admin",
--   "newPassword": "Admin@12345",
--   "tenantId": 1,
--   "force": true,
--   "canAccessAllLocations": true
-- }
--
-- 3) Login via UI with that username/password
-- 4) Assign role permissions in User Management → seed permissions if empty
-- 5) For vendor portal: open Vendor Master → Enable Portal + set password,
--    then sign in at /vendor/login with vendor code + that password.

SELECT TOP 20 User_UniqueID, UserName, TenantID, Status, Role,
       CASE WHEN Password IS NULL OR Password = '' THEN 'EMPTY'
            WHEN Password LIKE '%.%.%' THEN 'HASHED'
            ELSE 'PLAINTEXT' END AS PasswordState,
       DefaultLocationId, CanAccessAllLocations, FailedLoginCount, LockoutEndUtc
FROM dbo.UserDetails
ORDER BY User_UniqueID;
