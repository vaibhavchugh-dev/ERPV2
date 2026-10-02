# QA Fixed Issues — Tracking

| Issue ID | Module | Status | Reason (if not fixed) |
|---|---|---|---|
| BUG-AUTH-001 | Authentication | Fixed | |
| BUG-AUTH-002 | Authentication | Fixed | |
| BUG-AUTH-003 | Authentication | Fixed | |
| BUG-AUTH-005 | Authentication | Fixed | |
| BUG-AUTH-006 | Authentication | Fixed | |
| BUG-AUTH-007 | Authentication | Fixed | |
| BUG-AUTH-008 | Authentication | Fixed | |
| BUG-AUTH-009 | Authentication | Fixed | |
| BUG-AUTH-010 | Authentication | Fixed | |
| BUG-AUTH-011 | Authentication | Pending | Partly fixed. Inactive, locked and vendor accounts no longer reveal their state before the password is checked. The "Multiple accounts found. Please specify tenant." message still appears before the password check because the login screen's tenant prompt depends on it; keeping or removing it needs a product decision. |
| BUG-AUTH-012 | Authentication | Fixed | |
| BUG-AUTH-013 | Authentication | Fixed | |
| BUG-AUTH-014 | Authentication | Fixed | |
| BUG-AUTH-015 | Authentication | Fixed | |
| BUG-AUTH-016 | Authentication | Fixed | |
| BUG-AUTH-017 | Authentication | Pending | Not changed. Replacing the "name contains admin" rule could remove access from existing admin roles in production; needs the product owner to confirm the intended rule (e.g. exact `ADMIN` role tag) and a review of existing role names. |
| BUG-AUTH-018 | Authentication | Fixed | |
| BUG-AUTH-019 | Authentication | Fixed | |
| BUG-AUTH-020 | Authentication | Fixed | |
| BUG-BANK-001 | Bank Master | Fixed | |
| BUG-BANK-002 | Bank Master | Fixed | |
| BUG-BANK-003 | Bank Master | Fixed | |
| BUG-BANK-004 | Bank Master | Fixed | |
| BUG-BANK-005 | Bank Master | Pending | Partly fixed. Detail, save and global search now return only the masked number, and the Show button uses a new site-checked, audit-logged reveal endpoint. Encryption at rest is not done: it needs a key-management decision (key storage and rotation) and a one-time migration of existing rows, and every reader of `BankMaster.AccountNo` (check printing, payments) would have to decrypt. |
| BUG-BANK-006 | Bank Master | Fixed | |
| BUG-BANK-007 | Bank Master | Fixed | |
| BUG-BANK-008 | Bank Master | Fixed | |
| BUG-BANK-009 | Bank Master | Fixed | |
| BUG-BANK-010 | Bank Master | Fixed | |
| BUG-BANK-011 | Bank Master | Fixed | |
| BUG-CAT-002 | Category Master | Fixed | |
| BUG-CAT-003 | Category Master | Fixed | |
| BUG-CAT-004 | Category Master | Fixed | |
| BUG-CAT-005 | Category Master | Fixed | |
| BUG-COA-001 | Chart of Accounts Master | Fixed | |
| BUG-COA-002 | Chart of Accounts Master | Fixed | |
| BUG-COA-003 | Chart of Accounts Master | Fixed | |
| BUG-COA-004 | Chart of Accounts Master | Fixed | |
| BUG-COA-005 | Chart of Accounts Master | Fixed | |
| BUG-COA-006 | Chart of Accounts Master | Fixed | |
| BUG-COA-007 | Chart of Accounts Master | Fixed | |
| BUG-COA-008 | Chart of Accounts Master | Fixed | |
| BUG-COA-009 | Chart of Accounts Master | Fixed | |
| BUG-CUST-001 | Customer Master | Fixed | |
| BUG-CUST-002 | Customer Master | Fixed | |
| BUG-CUST-003 | Customer Master | Fixed | |
| BUG-CUST-004 | Customer Master | Fixed | |
| BUG-CUST-005 | Customer Master | Fixed | |
| BUG-CUST-006 | Customer Master | Fixed | |
| BUG-CUST-007 | Customer Master | Fixed | |
| BUG-CUST-008 | Customer Master | Fixed | |
| BUG-CUST-009 | Customer Master | Fixed | |
| BUG-CUST-010 | Customer Master | Fixed | |
| BUG-CC-001 | Credit Card Master | Fixed | |
| BUG-CC-002 | Credit Card Master | Fixed | |
| BUG-CC-003 | Credit Card Master | Fixed | |
| BUG-CC-004 | Credit Card Master | Fixed | |
| BUG-CC-005 | Credit Card Master | Fixed | |
| BUG-JT-001 | Job Template Master | Fixed | |
| BUG-JT-002 | Job Template Master | Fixed | |
| BUG-JT-003 | Job Template Master | Fixed | |
| BUG-JT-004 | Job Template Master | Fixed | |
| BUG-JT-005 | Job Template Master | Fixed | |
| BUG-JT-006 | Job Template Master | Fixed | |
| BUG-JT-007 | Job Template Master | Fixed | |
| BUG-JT-008 | Job Template Master | Fixed | |
| BUG-JT-009 | Job Template Master | Fixed | |
| BUG-NCRCODE-001 | NCR Code Master | Fixed | |
| BUG-NCRCODE-002 | NCR Code Master | Fixed | |
| BUG-NCRCODE-003 | NCR Code Master | Fixed | |
| BUG-LOC-001 | Location Master | Fixed | |
| BUG-LOC-002 | Location Master | Fixed | |
| BUG-LOC-003 | Location Master | Fixed | |
| BUG-LOC-004 | Location Master | Fixed | |
| BUG-LOC-005 | Location Master | Fixed | |
| BUG-LOC-006 | Location Master | Fixed | |
| BUG-LOC-007 | Location Master | Fixed | |
