# QA Fixed Issues — Tracking

| Issue ID | Module | Status | Fix Tested | Reason (if not fixed) |
|---|---|---|---|---|
| BUG-AUTH-001 | Authentication | Fixed | Yes |  |
| BUG-AUTH-002 | Authentication | Fixed | Yes |  |
| BUG-AUTH-003 | Authentication | Fixed | Yes |  |
| BUG-AUTH-005 | Authentication | Fixed | Yes |  |
| BUG-AUTH-006 | Authentication | Fixed | Yes |  |
| BUG-AUTH-007 | Authentication | Fixed | Yes |  |
| BUG-AUTH-008 | Authentication | Fixed | Yes |  |
| BUG-AUTH-009 | Authentication | Fixed | Yes |  |
| BUG-AUTH-010 | Authentication | Fixed | Yes |  |
| BUG-AUTH-011 | Authentication | Pending | N/A | Partly fixed. Inactive, locked and vendor accounts no longer reveal their state before the password is checked. The "Multiple accounts found. Please specify tenant." message still appears before the password check because the login screen's tenant prompt depends on it; keeping or removing it needs a product decision. |
| BUG-AUTH-012 | Authentication | Fixed | Yes |  |
| BUG-AUTH-013 | Authentication | Fixed | Yes |  |
| BUG-AUTH-014 | Authentication | Fixed | Yes |  |
| BUG-AUTH-015 | Authentication | Fixed | Yes |  |
| BUG-AUTH-016 | Authentication | Fixed | Yes |  |
| BUG-AUTH-017 | Authentication | Pending | N/A | Not changed. Replacing the "name contains admin" rule could remove access from existing admin roles in production; needs the product owner to confirm the intended rule (e.g. exact `ADMIN` role tag) and a review of existing role names. |
| BUG-AUTH-018 | Authentication | Fixed | Yes |  |
| BUG-AUTH-019 | Authentication | Fixed | Yes |  |
| BUG-AUTH-020 | Authentication | Fixed | Yes |  |
| BUG-BANK-001 | Bank Master | Fixed | Yes |  |
| BUG-BANK-002 | Bank Master | Fixed | Yes |  |
| BUG-BANK-003 | Bank Master | Fixed | Yes |  |
| BUG-BANK-004 | Bank Master | Fixed | Yes |  |
| BUG-BANK-005 | Bank Master | Pending | N/A | Partly fixed. Detail, save and global search now return only the masked number, and the Show button uses a new site-checked, audit-logged reveal endpoint. Encryption at rest is not done: it needs a key-management decision (key storage and rotation) and a one-time migration of existing rows, and every reader of `BankMaster.AccountNo` (check printing, payments) would have to decrypt. |
| BUG-BANK-006 | Bank Master | Fixed | Yes |  |
| BUG-BANK-007 | Bank Master | Fixed | Yes |  |
| BUG-BANK-008 | Bank Master | Fixed | Yes |  |
| BUG-BANK-009 | Bank Master | Fixed | Yes |  |
| BUG-BANK-010 | Bank Master | Fixed | Yes |  |
| BUG-BANK-011 | Bank Master | Fixed | Yes |  |
| BUG-CAT-002 | Category Master | Fixed | Yes |  |
| BUG-CAT-003 | Category Master | Fixed | Yes |  |
| BUG-CAT-004 | Category Master | Fixed | Yes |  |
| BUG-CAT-005 | Category Master | Fixed | Yes |  |
| BUG-COA-001 | Chart of Accounts Master | Fixed | Yes |  |
| BUG-COA-002 | Chart of Accounts Master | Fixed | Yes |  |
| BUG-COA-003 | Chart of Accounts Master | Fixed | Yes |  |
| BUG-COA-004 | Chart of Accounts Master | Fixed | Yes |  |
| BUG-COA-005 | Chart of Accounts Master | Fixed | Yes |  |
| BUG-COA-006 | Chart of Accounts Master | Fixed | Yes |  |
| BUG-COA-007 | Chart of Accounts Master | Fixed | Yes |  |
| BUG-COA-008 | Chart of Accounts Master | Fixed | Yes |  |
| BUG-COA-009 | Chart of Accounts Master | Fixed | Yes |  |
| BUG-CUST-001 | Customer Master | Fixed | Yes |  |
| BUG-CUST-002 | Customer Master | Fixed | Yes |  |
| BUG-CUST-003 | Customer Master | Fixed | Yes |  |
| BUG-CUST-004 | Customer Master | Fixed | Yes |  |
| BUG-CUST-005 | Customer Master | Fixed | Yes |  |
| BUG-CUST-006 | Customer Master | Fixed | Yes |  |
| BUG-CUST-007 | Customer Master | Fixed | Yes |  |
| BUG-CUST-008 | Customer Master | Fixed | Yes |  |
| BUG-CUST-009 | Customer Master | Fixed | Yes |  |
| BUG-CUST-010 | Customer Master | Fixed | Yes |  |
| BUG-CC-001 | Credit Card Master | Fixed | Yes |  |
| BUG-CC-002 | Credit Card Master | Fixed | Yes |  |
| BUG-CC-003 | Credit Card Master | Fixed | Yes |  |
| BUG-CC-004 | Credit Card Master | Fixed | Yes |  |
| BUG-CC-005 | Credit Card Master | Fixed | Yes |  |
| BUG-JT-001 | Job Template Master | Fixed | Yes |  |
| BUG-JT-002 | Job Template Master | Fixed | Yes |  |
| BUG-JT-003 | Job Template Master | Fixed | Yes |  |
| BUG-JT-004 | Job Template Master | Fixed | Yes |  |
| BUG-JT-005 | Job Template Master | Fixed | Yes |  |
| BUG-JT-006 | Job Template Master | Fixed | Yes |  |
| BUG-JT-007 | Job Template Master | Fixed | Yes |  |
| BUG-JT-008 | Job Template Master | Fixed | Yes |  |
| BUG-JT-009 | Job Template Master | Fixed | Yes |  |
| BUG-NCRCODE-001 | NCR Code Master | Fixed | Yes |  |
| BUG-NCRCODE-002 | NCR Code Master | Fixed | Yes |  |
| BUG-NCRCODE-003 | NCR Code Master | Fixed | Yes |  |
| BUG-LOC-001 | Location Master | Fixed | Yes |  |
| BUG-LOC-002 | Location Master | Fixed | Yes |  |
| BUG-LOC-003 | Location Master | Fixed | Yes |  |
| BUG-LOC-004 | Location Master | Fixed | Yes |  |
| BUG-LOC-005 | Location Master | Fixed | Yes |  |
| BUG-LOC-006 | Location Master | Fixed | Yes |  |
| BUG-LOC-007 | Location Master | Fixed | Yes |  |
| BUG-NOTIF-001 | Notifications | Fixed | No |  |
| BUG-PB-001 | Price Breakdown Master | Fixed | No |  |
| BUG-PB-004 | Price Breakdown Master | Fixed | No |  |
| BUG-PB-006 | Price Breakdown Master | Fixed | No |  |
| BUG-PROCESS-001 | Process Master | Fixed | No |  |
| BUG-PROCESS-002 | Process Master | Fixed | No |  |
| BUG-PROCESS-004 | Process Master | Fixed | No |  |
| BUG-PROCESS-005 | Process Master | Fixed | No |  |
| BUG-PROCESS-006 | Process Master | Fixed | No |  |
| BUG-PROD-002 | Product Master | Fixed | No |  |
| BUG-PROD-004 | Product Master | Fixed | No |  |
| BUG-RM-001 | Raw Material Master | Fixed | No |  |
| BUG-RM-003 | Raw Material Master | Fixed | No |  |
| BUG-SUPP-002 | Support Portal | Fixed | No |  |
| BUG-SET-001 | System Settings | Fixed | No |  |
| BUG-SET-004 | System Settings | Fixed | No |  |
| BUG-SET-005 | System Settings | Fixed | No |  |
| BUG-SET-007 | System Settings | Fixed | No |  |
| BUG-WS-001 | Workstation Master | Fixed | No |  |
| BUG-WS-002 | Workstation Master | Fixed | No |  |
| BUG-WS-004 | Workstation Master | Fixed | No |  |
| BUG-WS-006 | Workstation Master | Fixed | No |  |
| BUG-VENDOR-001 | Vendor Master | Fixed | No |  |
| BUG-VENDOR-002 | Vendor Master | Fixed | No |  |
| BUG-VENDOR-005 | Vendor Master | Fixed | No |  |
| BUG-VENDOR-008 | Vendor Master | Fixed | No |  |
| BUG-EMP-001 | Employee Master | Fixed | No | Server validates location/role scope; UI hides all-locations and filters locations for non-admins. |
| BUG-EMP-002 | Employee Master | Fixed | No | GetProfilePic requires auth and tenant-scoped access. |
| BUG-EMP-004 | Employee Master | Fixed | No | Delete removes face enrollment, profile blob, and impact dialog mentions face data. |
| BUG-EMP-005 | Employee Master | Fixed | No | GET returns hasSsn/hasDob only; save omits DOB/SSN on update. |
| BUG-EMP-008 | Employee Master | Fixed | No | Country persisted on UserDetails with schema ensure. |
| BUG-EMP-010 | Employee Master | Fixed | No | Unsaved-changes confirm on cancel/overlay close. |
| BUG-ROLE-001 | Roles & Permissions | Fixed | Partial | Global ErpPermissionAuthorizationFilter maps controllers to permission URLs; exempt auth/user/support and utilities. |
| BUG-ROLE-002 | Roles & Permissions | Fixed | No | Clear/seed reset PermissionRole for caller tenant only. |
| BUG-ROLE-003 | Roles & Permissions | Fixed | No | Admin detection uses role name only, not Description/RoleTag. |
| BUG-ROLE-006 | Roles & Permissions | Fixed | No | UpdateRole applies Description when provided (including empty clear). |
| BUG-USER-002 | User Management | Fixed | No | Status filter resets pageNumber to 1. |
| BUG-USER-003 | User Management | Fixed | No | UpdateUser saves TerminationReason when user already inactive. |
| BUG-USER-004 | User Management | Fixed | No | Role column sorts by name; sort cleared on list reload. |
| BUG-NCR-009 | Quality NCR | Fixed | No | Unlinked NCRs visible when reporter is assigned to filtered site(s). |
| BUG-CONV-006 | Conversations & Comments | Fixed | No | Delete own comments only (UI + EntityComments API); admins may delete any. |
| BUG-SRCH-001 | Global Search | Fixed | No | Search API applies site/location scope via list location filter and category joins. |
| BUG-SRCH-002 | Global Search | Fixed | No | API skips guarded categories without permission; dropdown hides sections user cannot open. |
| BUG-SRCH-003 | Global Search | Fixed | No | Banks excluded from account-number match; API and dropdown show masked account numbers. |
| BUG-SRCH-004 | Global Search | Fixed | No | Vendor receiving results navigate by vendor order id (orderId). |
| BUG-SRCH-005 | Global Search | Fixed | No | Enter opens first result using GLOBAL_SEARCH_CATEGORY_ORDER (matches dropdown order). |
| BUG-SRCH-006 | Global Search | Fixed | No | Customer/vendor invoice status reflects void and partial payment in search results. |
| BUG-SRCH-007 | Global Search | Fixed | No | Partial formatted PO/order numbers match display formatting for CO/CQ/VO/VQ/JO. |
| BUG-INV-004 | Inventory | Fixed | No | AdjustStock rejects quantity that would make on-hand less than reserved. |
| BUG-INV-006 | Inventory | Fixed | No | Movement modal loads full balance list on open so other locations show parts/qty. |
| BUG-INV-008 | Inventory | Fixed | No | Shipment-linked qty validation verifies shipment belongs to tenant before reading lines. |
| BUG-INV-011 | Inventory | Fixed | No | GetMovementDocuments filters jobs, vendor receivings, and shipments by site scope. |
| BUG-PWD-001 | Password Policy | Fixed | No | Change password rejects new = current on server and on change-password screen. |
