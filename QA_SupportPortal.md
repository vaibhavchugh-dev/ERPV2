# QA — Support Tickets & Support Portal

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Support Tickets & Support Portal | 1.10 | BUG-SUPP | Yes | 4 | 1 | 4 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Carried-Over Concerns (from `QA_Authentication.md`)

Observed while testing Authentication; root cause is in this module. Verify and log formally when this module is tested.

- The support-staff token has `tenantId = "0"` and a negative `userId`. `GetTenantId()`/`GetUserId()` ignore values ≤ 0 and fall back to the client-supplied `tenantId`/`userId` headers, so support staff could act in any tenant as any user (`SupportStaffController.cs` lines 50–60, 181–188; `ApiBaseController.cs` lines 13–46).
  - **Verified → BUG-SUPP-001.** The support token is signed with the same key, issuer and audience as ERP tokens (`JwtTokenService.cs` lines 45–46, 67–72), so it passes `Program.cs` JWT validation on every endpoint. Credential handling for this token is logged as **BUG-SUPP-002**.

## Confirmed Bugs

### BUG-SUPP-001 — Support-staff token works on every ERP endpoint with a client-chosen tenant and user

**Severity:** Critical — a support-staff session (or a stolen staff token) can read and change any tenant's ERP data while impersonating any user, including client ticket endpoints and password reset.
**Status:** Confirmed
**Test Area:** Authorization / Tenant (matrix 1.10 Backend "Authorization")

**Description:** `SupportStaffController.Login` issues a normal application JWT with `tenantId = "0"`, a negative `userId` and `portalType = "support"`. Only `SupportStaffController` checks `IsSupportStaff()`; no ERP endpoint rejects support tokens. Because `GetTenantId()` and `GetUserId()` accept a claim only when it is greater than 0, both fall back to the `tenantId` and `userId` request headers for support tokens. The staff member therefore chooses the tenant and the acting user per request.

**Steps to Reproduce:**
1. Log in at `/support/login` and copy the `supportToken`.
2. Call `GET /api/SupportTickets/ListMine` with headers `tenantId: <T>` and `userId: <U>` → returns user U's private tickets; `POST /api/SupportTickets/Reply` posts as user U.
3. Call any ERP endpoint that uses `GetTenantId()`, for example `GET /api/Documents/...`, with header `tenantId: <T>` → returns tenant T's data.
4. Call `POST /api/UserManagement/ResetPassword` with body `TenantId = T` and tenant T's administrator id → the password is reset.

**Expected:** A support token is restricted to `SupportStaffController` (matrix: "`portalType=support`, `tenantId=0`") and is never resolved to a tenant or user from headers.

**Actual:** The support token is accepted everywhere, and the tenant and user come from headers. The normal support UI sends `tenantId: 0` and an empty `userId`, so the attacker must set the headers manually; this is trivial with any HTTP client.

**Evidence:**
- Frontend: `Cimmple_UI/src/SupportStaff/SupportStaffAuth.ts` lines 44–54 (stores `supportToken`; `supportStorage` has userId 0 and tenantID 0); `Common/Services/Axios-config.ts` lines 54–63 and 71–121 (headers are taken from storage and can be replaced by any client).
- Backend: `Controllers/SupportStaffController.cs` lines 50–62 (claims, 480-minute token); `Controllers/ApiBaseController.cs` lines 13–25 (`GetTenantId` header fallback) and 34–46 (`GetUserId` header fallback); `Services/Auth/JwtTokenService.cs` lines 45–46 and 67–72 (same key/issuer/audience); `Program.cs` lines 114–147 (single JWT scheme, authenticated-user fallback policy only); `Controllers/SupportTicketsController.cs` lines 17–186 (client endpoints trust `GetTenantId`/`GetUserId`); `Controllers/UserManagementController.cs` line 316.
- Database: `SupportTickets`, `SupportTicketMessages` and every tenant table become reachable.

**Root Cause:** A shared JWT scheme with no portal-type restriction, combined with the header fallback in `GetTenantId`/`GetUserId` for non-positive claims.

**Business Impact:** Any support staff member, or anyone holding a leaked support token, has unrestricted, unaudited cross-tenant access with user impersonation.

**Affected Areas:** All ERP modules; client support tickets; User Management. Same root cause as BUG-AUTH-014 (integration token) and contributes to BUG-TEN-001.

**Recommended Fix:** Reject `portalType=support` (and `vendor`, `integration`) tokens outside their allowed controllers with a global policy or filter; remove the header fallback from `GetTenantId`/`GetUserId` entirely, or allow it only for explicitly whitelisted integration endpoints.

---

### BUG-SUPP-002 — Support-staff credentials are stored and compared in plaintext, with no lockout or rate limit

**Severity:** Medium — the credential that unlocks cross-tenant access (BUG-SUPP-001) is weaker than the ERP password controls.
**Status:** Confirmed
**Test Area:** Authorization (matrix 1.10 "staff list from config `Support:Staff`")

**Description:** Staff accounts are read from configuration `Support:Staff` and compared with `e.Password == password` (plaintext, non-constant-time). The login endpoint is anonymous and has no lockout, attempt counter or rate limiting, unlike ERP login. The example configuration ships the predictable username `support`.

**Steps to Reproduce:**
1. Send repeated `POST /api/SupportStaff/Login` requests with `username: support` and candidate passwords.
2. Observe that every attempt is evaluated with no lockout or delay.

**Expected:** Staff passwords are hashed and the login applies lockout/throttling comparable to ERP login.

**Actual:** Plaintext storage and comparison; unlimited attempts.

**Evidence:**
- Frontend: `Cimmple_UI/src/SupportStaff/SupportStaffLogin.tsx` (plain username/password form).
- Backend: `Controllers/SupportStaffController.cs` lines 30–43 (`[AllowAnonymous]` login, no throttling) and 171–179 (`FindStaff` plaintext compare); `appsettings.example.json` lines 28–39 (`Support:Staff` with `Password` field).
- Database: not applicable (configuration only).

**Root Cause:** A minimal config-based staff login was implemented without the hashing and lockout used for ERP users.

**Business Impact:** Brute force or configuration disclosure yields a cross-tenant support session.

**Affected Areas:** Support Staff Portal.

**Recommended Fix:** Store PBKDF2/bcrypt hashes in configuration or a table, use constant-time comparison, and add lockout/rate limiting.

---

### BUG-SUPP-003 — Staff can reply to a Closed ticket

**Severity:** Low — the client receives an email and notification for a ticket they cannot answer.
**Status:** Confirmed
**Test Area:** Validation (matrix 1.10 Backend "Validation — both: reply to Closed rejected")

**Description:** The matrix states that a reply to a Closed ticket is rejected by both controllers. `ClientReplyAsync` rejects it, but `StaffReplyAsync` has no Closed check. The inbox shows the reply panel for Closed tickets, and the reply status defaults to the current status, so the ticket stays Closed while an email and `SupportReply` notification are still sent.

**Steps to Reproduce:**
1. In `/support`, open a ticket with status Closed.
2. Type a reply and send it with the default status.

**Expected:** The reply is rejected ("This ticket is closed.").

**Actual:** The message is saved, `ClientHasUnread` is set, an email is queued and a notification is sent; the client sees the reply but the follow-up box is hidden because the ticket is Closed.

**Evidence:**
- Frontend: `Cimmple_UI/src/SupportStaff/SupportInboxPage.tsx` lines 81–82 (status defaults to current) and 308–336 (reply panel always rendered); `Common/Components/ContactSupportDialog.tsx` line 461 (client follow-up hidden when Closed).
- Backend: `Services/SupportTicketService.cs` lines 412–416 (client check) versus 446–523 (`StaffReplyAsync`, no Closed check; sets status at 488–489, email at 500–504, notification at 507–517).
- Database: `SupportTicketMessages` row inserted for a Closed ticket.

**Root Cause:** The Closed guard was implemented only in the client reply path.

**Business Impact:** Confusing customer experience; replies on closed tickets cannot be answered.

**Affected Areas:** Support Staff Portal, Notifications, Email outbox.

**Recommended Fix:** Reject staff replies on Closed tickets (or require an explicit reopen status) and hide or disable the reply panel for Closed tickets.

---

### BUG-SUPP-004 — Attachment type restrictions are enforced only in the browser

**Severity:** Low — any file type (for example `.exe` or `.html`) can be attached by calling the API directly and is later downloaded by staff.
**Status:** Confirmed
**Test Area:** Validation (matrix 1.10 "attachment ≤8MB, allowed types")

**Description:** `ContactSupportDialog` limits types with the file input `accept` attribute only. `SupportTicketService.CreateAsync` checks size (8 MB) but not extension or content type.

**Steps to Reproduce:**
1. Call `POST /api/SupportTickets/Create` (multipart) with a valid subject/description and an attachment named `payload.html`.

**Expected:** Disallowed types are rejected server-side.

**Actual:** The attachment is stored and is downloadable from the staff inbox.

**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Components/ContactSupportDialog.tsx` line 356 (`accept` only) and lines 144–156 (size check only).
- Backend: `Services/SupportTicketService.cs` line 90 (`MaxAttachmentBytes`) and lines 335–367 (size check, no type check); `Controllers/SupportTicketsController.cs` line 61 (`RequestSizeLimit` 10 MB).
- Database: `SupportTickets` attachment columns / blob.

**Root Cause:** Allowed types are not defined or enforced on the server.

**Business Impact:** Staff may download and open malicious files submitted through the support channel.

**Affected Areas:** Support tickets (client create), staff attachment download.

**Recommended Fix:** Enforce an extension/content-type allow-list in `CreateAsync` matching the client `accept` list, and serve downloads with `Content-Disposition: attachment`.

---

## Potential Bugs

### BUG-SUPP-005 — Ticket location from the form is not validated against the user's sites or tenant

**Severity:** Low — a ticket can carry an arbitrary location id, which mislabels the location shown to staff.
**Status:** Potential
**Test Area:** Location (matrix 1.10 Create ticket)

**Description:** `SupportTicketsController.Create` uses `locationId` from the form when present and only falls back to `GetActiveLocationId(out _)`. The form value is not checked with `CanAccessLocation` or against the tenant.

**Steps to Reproduce:**
1. Call `POST /api/SupportTickets/Create` with `locationId` set to a location of another site or tenant.
2. Open the ticket in the staff inbox.

**Expected:** The location is validated or derived from the working site.

**Actual (from code):** The supplied id is stored as-is.

**Evidence:**
- Frontend: `Cimmple_UI/src/Common/Services/SupportTicketService.ts` lines 98–130 (multipart create).
- Backend: `Controllers/SupportTicketsController.cs` lines 85–86 and 98–99.
- Database: `SupportTickets.LocationId`.

**Root Cause:** Missing validation of an optional metadata field.

**Business Impact:** Misleading triage information; possible display of another tenant's location name in the staff inbox.

**Affected Areas:** Support ticket create, staff inbox.

**Recommended Fix:** Validate with `CanAccessLocation` and tenant ownership, or always use the validated active location.

**Why further verification is needed:** Whether the staff inbox resolves the location name without a tenant filter (and so shows another tenant's site name) needs a runtime check.

---

## Needs Manual Verification

1. **Area:** Responsive (matrix 1.10 "Breakpoint 900px")
   **What to Test:** Contact Support dialog and staff inbox at widths below and above 900px.
   **Expected:** Layout switches to the stacked/mobile layout at 900px.
   **Why Manual Testing Is Required:** Breakpoints exist (`ContactSupportDialog.scss` line 531, `SupportInbox.scss` line 304); visual result requires a browser.
2. **Area:** Email and notification delivery (matrix 1.10 Business Logic / Cross-Module)
   **What to Test:** Staff reply → email arrives at the ticket creator; in-app `SupportReply` notification opens `/?supportTicket=<id>`.
   **Expected:** One email and one notification per staff reply; the deep link opens the ticket.
   **Why Manual Testing Is Required:** Depends on SMTP/outbox configuration and the notification background flow (`SupportTicketService.cs` lines 500–517; `TopBar.tsx` lines 448–466).
3. **Area:** Unread badge
   **What to Test:** Staff reply → client unread count increments; opening the ticket clears it.
   **Expected:** Badge reflects `ClientHasUnread`.
   **Why Manual Testing Is Required:** Polling timing (`TopBar.tsx` lines 370–377, 424–446) needs a running app.
4. **Area:** Staff session expiry
   **What to Test:** Leave the staff inbox open beyond 480 minutes, then act.
   **Expected:** Redirect to `/support/login`, clearing only support keys.
   **Why Manual Testing Is Required:** Token lifetime and redirect timing (`Axios-config.ts` lines 13–52, 141–159) are runtime behaviour.

## No Issues Found

- Client ticket isolation: `Get`, `Reply`, `DownloadAttachment` and `GetUnreadCount` filter by tenant and creator (`SupportTicketService.cs` lines 130–173, 540–584) for normal ERP tokens.
- Client replies to Closed tickets are rejected (`SupportTicketService.cs` lines 412–416) and the client UI hides follow-up for Closed tickets.
- Subject (required, ≤200) and description (required, ≤4000) are validated on the client (`ContactSupportDialog.tsx` lines 144–156, 336, 347) and server (`CreateAsync`, lines 262–376).
- The 8 MB attachment limit is enforced on both client (line 153) and server (line 90).
- Every `SupportStaffController` action except `Login` checks `IsSupportStaff()` (lines 79–169).
- Status flow: client reply sets Open (line 435); staff reply defaults to WaitingOnUser for Open tickets (UI lines 81–82, service line 489) and sends the `SupportReply` notification and email.
- Staff inbox search is debounced 300 ms and loads up to 150 tickets with product/status filters (`SupportInboxPage.tsx` lines 46, 63–68); server clamps `take` to 1–200.
- On `/support` paths a 401 clears only the support keys and skips ERP refresh (`Axios-config.ts` lines 13–52, 141–159).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass |
| CRUD | Yes | Pass |
| Search | Yes | Pass |
| Filters | Yes | Pass |
| Sorting | N/A | N/A |
| Pagination | Yes | Pass |
| Validation | Yes | Fail (BUG-SUPP-003, BUG-SUPP-004) |
| Permissions | Yes | Fail (BUG-SUPP-001, BUG-SUPP-002) |
| API | Yes | Fail (BUG-SUPP-001) |
| Database | Yes | Pass |
| Business Logic | Yes | Pass; Fail (BUG-SUPP-003) |
| Location | Yes | Potential (BUG-SUPP-005) |
| Tenant | Yes | Fail (BUG-SUPP-001) |
| Cross-Module | Partial | Manual |
| Responsive/PWA | No | Manual |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE — Create ticket (`ContactSupportDialog`, `?supportTicket=`) | Pass | Multipart create; deep link handled in `TopBar`. Location metadata Potential (BUG-SUPP-005). |
| FE — List / view (`ListMine`, `GetUnreadCount`, `Get/{id}`) | Pass | Scoped by tenant and creator for ERP tokens. |
| FE — Reply (`Reply`) | Pass | Closed rejected for clients. |
| FE — Attachment download | Pass | Creator-scoped for clients; staff via `IsSupportStaff()`. |
| FE — Staff login (`SupportStaffLogin`, `SupportStaffAuth`) | Fail (BUG-SUPP-002) | Plaintext config credentials, no lockout. |
| FE — Staff inbox (search `q`, product, status, take 150) | Pass / Fail (BUG-SUPP-003) | Filters and search OK; reply panel shown for Closed. |
| FE — Validation (subject, description, 8 MB, allowed types) | Fail (BUG-SUPP-004) | Types client-only; other rules enforced on both sides. |
| FE — Responsive (900px) | Manual | — |
| BE — Client CRUD (`SupportTicketsController`) | Pass (ERP tokens) / Fail (BUG-SUPP-001) | Support token can impersonate via headers. |
| BE — Staff (inbox, reply, status, `IsSupportStaff()`) | Pass | Every action checks `IsSupportStaff()`. |
| BE — Validation (reply to Closed rejected, both) | Fail (BUG-SUPP-003) | Staff path not guarded. |
| BE — Authorization (`portalType=support`, `tenantId=0`, `Support:Staff`) | Fail (BUG-SUPP-001, BUG-SUPP-002) | Token accepted by all endpoints. |
| BL — Open → WaitingOnUser after staff reply | Pass | — |
| BL — → Resolved → Closed | Pass | Any transition allowed via `UpdateStatus`; not restricted by the matrix. |
| BL — Client reply sets Open | Pass | — |
| BL — Staff reply triggers `SupportReply` notification and email | Pass / Manual | Code path present; delivery manual. |

## Cross-Module Concerns

| Concern | Owner Module | Evidence |
| --- | --- | --- |
| Header fallback in `GetTenantId`/`GetUserId` also affects the integration token. | BUG-AUTH-014 | `ApiBaseController.cs` lines 13–46. |
| Support token can call `UserManagement/ResetPassword` for any tenant. | BUG-TEN-001 / User Management | `UserManagementController.cs` line 316. |
| No server-side role/permission enforcement for ERP endpoints. | QA_RolesPermissions.md | `Program.cs` lines 142–147. |
