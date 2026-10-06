# QA — Notifications

| Module | Matrix section | Bug ID prefix | Tested | Fix Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Notifications | 1.8 | BUG-NOTIF | Yes | No | 5 | 0 | 5 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

Files traced: `Cimmple_UI/src/Common/Components/TopBar.tsx`, `Common/Components/NotifyUserDialog.tsx`, `Common/Services/NotificationService.ts`, `Common/Utils/chatMentions.tsx`, `Common/Utils/settingsRuntime.ts`, `Common/Routes.tsx`, `Common/Components/ProtectedLayout.tsx`, `App.tsx`, `Modules/Settings/SystemSettings.tsx`, `Cimmple_API/CimmpleAPI/Controllers/NotificationsController.cs`, `Services/NotificationService.cs`, `Services/DomainNotificationHelper.cs`, `Services/ConversationService.cs`, `Services/CommentMentionHelper.cs`, `Data/Models/Notification.cs`, `Services/NotificationSchemaService.cs`, `Controllers/UserManagementController.cs`, and the generators in `QuotationController.cs`, `OrderController.cs`, `ShippingController.cs`, `VendorInvoiceController.cs`, `JobOrderController.cs`, `QualityController.cs`, `EntityCommentsController.cs`, `Services/SupportTicketService.cs`.

## Confirmed Bugs

### BUG-NOTIF-001 — The "Open in Cimmple" link in chat-message emails opens an empty page

**Severity:** Low. The email link is broken, but the message can still be found in the Messages panel.

**Status:** Confirmed

**Test Area:** Navigation / Email

**Description:**
When a direct message is sent with "Also send email", `ConversationService` creates a `ChatMessage` notification with `LinkPath = "/messages?open={conversationId}"`. `NotificationService.CreateAsync` turns `LinkPath` into the email's "Open in Cimmple" link. The ERP UI has no `/messages` route and no code that reads it: `App.tsx` sends every non-login path to `ProtectedLayout`, whose `Switch` has no matching route and no fallback, so the user sees the TopBar and sidebar with an empty content area, and the conversation is not opened.

**Steps to Reproduce:**
1. Configure SMTP and enable email notifications in System Settings.
2. From the TopBar "Notify user" dialog, send a message to another user with "Also send email" ticked.
3. As the recipient, click "Open in Cimmple" in the email.

**Expected:** The link opens the conversation (or at least the Messages panel).

**Actual:** The app loads `/messages?open=<id>` and shows a blank content area.

**Evidence:**
* Frontend: `Cimmple_UI/src/App.tsx` line 55 (`/` → `ProtectedLayout`); `Common/Components/ProtectedLayout.tsx` lines 45–65 (no route for `/messages`, no catch-all); `Common/Routes.tsx` (no `/messages` path; no other reference to `/messages` in `src`).
* Backend: `Cimmple_API/CimmpleAPI/Services/ConversationService.cs` line 629 (`LinkPath = $"/messages?open={convo.Id}"`); `Services/NotificationService.cs` lines 155–161 (link built from `LinkPath`).
* Database: `Notifications.LinkPath`, `EmailOutbox` body.

**Root Cause:** The chat email link targets a route that was never added to the UI; the conversation panel is opened only from the TopBar.

**Business Impact:** Users who act on email notifications land on an empty page and may think the message was lost.

**Affected Areas:** Notifications (email), Conversations (1.9).

**Recommended Fix:** Use a link the UI understands (for example a query parameter on the landing page that TopBar reads to open `ConversationPanel` with the conversation), or add a `/messages` route that does so.

---

### BUG-NOTIF-002 — Notification and comment-mention titles show raw document numbers that do not match the numbers on screen

**Severity:** Low. Titles reference a number users cannot find in the UI.

**Status:** Confirmed

**Test Area:** Business logic / Display

**Description:**
The UI shows CO/CQ/VO/VQ numbers as `PONumber + 999` when `PONumber < 1000` (for example PONumber 5 → "CO#1004"), and global search also returns "CO#1004". Notification titles and comment-mention labels use the raw stored number with a different format: "CQ-5 accepted", "VQ-5 accepted", "CO-5 shipped", "VO-5 fully received", "VO-5 assigned to you", and comment mentions "Customer Order CO-5", "Customer Quotation CQ-5", "Vendor Order VO-5", "Vendor Quotation VQ-5". The slideouts send the same raw label as `entityLabel` when saving comments.

**Steps to Reproduce:**
1. Open customer order CO#1004 (stored PONumber 5).
2. Ship it (or @mention a colleague in its comments).
3. The recipient's bell shows "CO-5 shipped" / "… mentioned you on Customer Order CO-5".
4. Searching "CO-5" or "CO#5" does not find CO#1004.

**Expected:** Notification text uses the same document number the UI displays (consistent with the slideout header and search).

**Actual:** Raw PONumber with a dash format.

**Evidence:**
* Frontend: `Cimmple_UI/src/Modules/Orders/CustomerOrderSlideout.tsx` line 1605 (displays `CO#${PONumber + 999}`) vs line 2871 (`entityLabel` = `Customer Order CO-${formData.PONumber}`); `Modules/Quotations/CustomerQuotationSlideout.tsx` line 2592; `Modules/Quotations/VendorQuotationSlideout.tsx` line 2579; `Modules/Purchasing/VendorOrderSlideout.tsx` line 2688.
* Backend: `Controllers/QuotationController.cs` lines 450 and 1849; `Controllers/ShippingController.cs` line 223; `Controllers/OrderController.cs` lines 646, 2633, 2658, 3920; `Controllers/EntityCommentsController.cs` lines 67, 88, 131, 151. Compare `Controllers/GlobalSearchController.cs` line 348 (search shows `CO#{PONumber + 999}`).
* Database: `Notifications.Title`, `Notifications.Body`.

**Root Cause:** Notification text formats the stored number directly instead of using the shared display-number rule.

**Business Impact:** Users cannot match notifications to documents by number; support calls quoting "CO-5" are ambiguous.

**Affected Areas:** Notifications, Entity Comments (1.9), Quotations, Orders, Shipping, Vendor Orders.

**Recommended Fix:** Format notification labels with the same display rule as the UI ("CO#1004"), centrally (for example a helper used by all generators and by the slideouts' `entityLabel`).

---

### BUG-NOTIF-003 — The Notify User dialog can send to a recipient who is no longer visible in the filtered list

**Severity:** Low. The message may go to a different person than the user believes they selected.

**Status:** Confirmed

**Test Area:** Validation / Send

**Description:**
`NotifyUserDialog` has a search box that filters the `<select>` options, but the selected `recipientUserId` is kept when the filter removes that user from the options. The `<select value>` then points to a value with no matching option, so the browser shows the first option ("Select user") or another visible user, while `handleSend` still posts the hidden user's ID.

**Steps to Reproduce:**
1. Open "Notify user" from the TopBar.
2. Select "Alice Smith" as recipient.
3. Type "bob" in the search box; the dropdown now lists only Bob and does not show Alice.
4. Enter a message and click Send.
5. The message is delivered to Alice.

**Expected:** Changing the filter either keeps the selected user visible or clears the selection, so the recipient shown is the recipient used.

**Actual:** The hidden previous selection is used.

**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Components/NotifyUserDialog.tsx` lines 67–78 (`filteredUsers` from `search`), 186 (search input), 197–223 (`<select value={recipientUserId}>` rendering only `filteredUsers`), 82–103 (`handleSend` uses `recipientUserId` without checking it is in `filteredUsers`).
* Backend: `Controllers/NotificationsController.cs` lines 172–215 (accepts any valid tenant user).
* Database: `ConversationMessages`, `Notifications`.

**Root Cause:** The selection state is not reconciled with the filtered options.

**Business Impact:** Messages with potentially sensitive content can be sent to the wrong colleague.

**Affected Areas:** Notifications (Send).

**Recommended Fix:** Always include the selected user in the options, or clear `recipientUserId` when the filter excludes it.



---

### BUG-NOTIF-005 — The Send API delivers messages to inactive and vendor-portal users that the UI does not offer

**Severity:** Low. Server validation is weaker than the UI's rules; messages can reach accounts that should not receive internal communication.

**Status:** Confirmed

**Test Area:** API / Validation

**Description:**
The UI lists only active, non-vendor users as recipients (`GetUsers` with `status: "Active"`; `GetUsers` excludes vendor-portal users). `POST /Notifications/Send` → `ConversationService.PostDmAsync` only checks that the recipient ID exists in the tenant. It does not check `Status` or `VendorId`, so a direct API call can send internal messages to inactive users or to vendor-portal accounts, and a chat @mention token (`@[Name](user:ID)`) adds such users as conversation participants by the same tenant-only check. The request also accepts `EntityType`, `EntityId` and `LinkPath` fields that are silently ignored.

**Steps to Reproduce:**
1. Find the user ID of a vendor-portal user or an inactive user in your tenant.
2. Call `POST /api/Notifications/Send` with `{ "recipientUserId": <that id>, "body": "Internal pricing details" }`.
3. The API returns success and creates a conversation with that user.

**Expected:** The server applies the same recipient rules as the UI (active, internal users only) and rejects others with a clear error.

**Actual:** Any user row in the tenant is accepted.

**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Components/NotifyUserDialog.tsx` lines 40–57 (active users only, self excluded).
* Backend: `Controllers/NotificationsController.cs` lines 172–215 and 223–232 (unused `EntityType`, `EntityId`, `LinkPath`); `Services/ConversationService.cs` lines 132–138 (tenant-only recipient check) and 572–577 (tenant-only check for mention-added participants); `Controllers/UserManagementController.cs` lines 36–51 (UI source excludes vendor-portal users).
* Database: `UserDetails.Status`, `UserDetails.VendorId`.

**Root Cause:** Recipient validation was implemented as "exists in tenant" only.

**Business Impact:** Internal messages (and email copies) can be delivered to deactivated staff or external vendors.

**Affected Areas:** Notifications (Send), Conversations (mentions).

**Recommended Fix:** Require `Status = Active` and `VendorId` null/0 for recipients and mention-added participants; remove or implement the unused request fields.

---

## Potential Bugs

No potential bugs beyond the confirmed list.

## Needs Manual Verification

1. **Area:** Bell polling and counts
   - **What to Test:** Generate a notification for a user and watch the bell for up to 45 seconds; switch tabs and return; verify the badge drops after clicking an item and after "Mark all read".
   - **Expected:** The badge updates within one poll, pauses while the tab is hidden, and decreases on read.
   - **Why Manual Testing Is Required:** Timing and visibility behaviour (`TopBar.tsx` lines 384–405, 423–446).

2. **Area:** Each generator end to end
   - **What to Test:** Trigger every event listed in the matrix: comment @mention, CQ/VQ accepted, CO shipped, VO fully received, VO assignment, vendor invoice approval, job order completed, NCR assignment, NCR pending approval, NCR approved, NCR closed, support reply.
   - **Expected:** The correct recipient gets one notification with a working link; the actor never notifies themselves.
   - **Why Manual Testing Is Required:** Recipients depend on stored owner/approver fields (`UserId`, approver, reporter) that may be empty on legacy records; the code skips silently in that case (`DomainNotificationHelper.NotifyUserAsync`).

3. **Area:** `EnableInAppNotifications` off
   - **What to Test:** Turn the setting off, trigger a domain event and a comment mention, then turn it back on.
   - **Expected:** No new bell rows while off; the bell shows the "disabled" message; direct messages still reach the Messages panel (the setting label says it controls the TopBar bell inbox).
   - **Why Manual Testing Is Required:** Requires the settings cache in the UI and API to refresh (`settingsRuntime.ts`; `NotificationService.cs` lines 91–107).

4. **Area:** Email delivery
   - **What to Test:** With SMTP configured, send a message with email; check `EmailOutbox` and the received email (subject, preview, link).
   - **Expected:** Email arrives with the title and body preview; link behaviour per BUG-NOTIF-001.
   - **Why Manual Testing Is Required:** Requires SMTP and the outbox worker.

5. **Area:** Responsive bell dropdown and Notify dialog
   - **What to Test:** Bell dropdown and Notify User dialog at 375–430 px.
   - **Expected:** Fits the screen and scrolls.
   - **Why Manual Testing Is Required:** Visual.

## No Issues Found

- Unread count and list exclude chat types (`ChatMessage`, `ChatUserMention`), so chat traffic does not inflate the bell (`NotificationsController.cs` lines 36–41, 61–75).
- `GetMine` clamps `take` to 1–100 (default 30) and returns `unreadCount` with the list; the TopBar requests 20 (`NotificationsController.cs` lines 58–59).
- `MarkRead` only updates rows where `RecipientUserId` is the caller, supports `ids` or `markAll`, and returns 400 when neither is provided (`NotificationsController.cs` lines 134–170).
- Clicking an item marks it read, then navigates through `navigateToMentionDocument`, which blocks with a toast when the user lacks permission for the target path (`TopBar.tsx` lines 496–523; `chatMentions.tsx` lines 77–96). Support replies open the support dialog via `?supportTicket=`.
- `Send` rejects missing recipient, empty body and sending to yourself; recipient must exist in the caller's tenant (`NotificationsController.cs` lines 172–215; `ConversationService.cs` lines 132–138).
- Notify dialog: subject `maxLength` 200, body `maxLength` 4000 (matching `Notification` model lengths 200/4000), Send disabled while sending, email checkbox disabled when email notifications are off (`NotifyUserDialog.tsx` lines 234, 253, 278, 315).
- `CreateAsync` honours `EnableInAppNotifications` and `EnableEmailNotifications`, truncates title (200) and body (4000) and HTML-encodes the email link (`NotificationService.cs` lines 76–196).
- Disabled state: the bell stops polling and the dropdown shows "In-app notifications are disabled in System Settings." (`TopBar.tsx` lines 386 and 860–863).
- A generator exists for every event listed in the matrix: comment mentions (`CommentMentionHelper.NotifyAsync`), CQ/VQ accepted (`QuotationController.cs` lines 441–455, 1840–1854), CO shipped (`ShippingController.cs` lines 214–228), VO fully received (`OrderController.cs` lines 3912–3925), AP approval (`VendorInvoiceController.cs` lines 651–669), job completed (`JobOrderController.cs` lines 520–537), NCR assignment / pending approval / approved / closed (`QualityController.cs` lines 1436–1478, 1540–1552), support replies (`SupportTicketService.cs` lines 507–517).
- The actor is never notified about their own action (`DomainNotificationHelper.NotifyUserAsync`).
- Database index (TenantId, RecipientUserId, IsRead, CreatedAt) matches the list and count queries (`NotificationSchemaService.cs`).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Fail (BUG-NOTIF-001) |
| CRUD | Yes | Pass for list and mark read; Fail for send (BUG-NOTIF-003, BUG-NOTIF-005) |
| Search | Yes | Fail (BUG-NOTIF-004, recipient search limited to the loaded page) |
| Filters | N/A | No filters |
| Sorting | Yes | Pass (newest first) |
| Pagination | Yes | Pass (`take` clamped to 100) |
| Validation | Yes | Fail (BUG-NOTIF-003, BUG-NOTIF-005); Pass for body/self/length checks |
| Permissions | Yes | Pass (navigation permission-checked; mark read scoped to recipient) |
| API | Yes | Fail (BUG-NOTIF-005) |
| Database | Yes | Pass (index and column lengths consistent) |
| Business Logic | Yes | Fail (BUG-NOTIF-002); generators present |
| Location | N/A | Notifications are per user, not per site |
| Tenant | Yes | Pass for query filters; header fallback is a cross-module concern |
| Cross-Module | Yes | Fail (BUG-NOTIF-002 labels across Sales/Procurement); Manual item 2 |
| Responsive/PWA | No | Manual (item 5) |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE — Bell count: `TopBar.tsx` (polls 45 s; excludes chat types), GET `/Notifications/GetUnreadCount` | Pass | TopBar takes the count from `GetMine`'s `unreadCount` (same chat exclusion); polling Manual item 1. |
| FE — List: TopBar dropdown, GET `GetMine?take` (max 100) | Pass | Clamp 1–100; newest first. |
| FE — Mark read: item click / mark all, POST `MarkRead` (`ids` or `markAll`) | Pass | Scoped to recipient. |
| FE — Send: `NotifyUserDialog.tsx` (recipient, message; subject ≤200, body ≤4000), "slideouts" | Fail | Hidden recipient sent (BUG-NOTIF-003); 200-user limit (BUG-NOTIF-004). The dialog is only mounted in the TopBar, not in slideouts (matrix wording). |
| FE — Disabled state: `EnableInAppNotifications` off | Pass | Message shown; server skips in-app rows; Manual item 3. |
| FE — Navigation: link opens record (permission checked) | Fail | Bell links are permission-checked (Pass); chat email link `/messages` is broken (BUG-NOTIF-001). |
| BE — List: GET `GetMine`, `GetUnreadCount` | Pass | Chat types excluded; recipient and tenant filtered. |
| BE — Update: POST `MarkRead` | Pass | — |
| BE — Create: POST `Send` (creates direct message) | Fail | Recipient rules weaker than UI (BUG-NOTIF-005). |
| BE — Authorization: tenant/user from JWT, header fallback | Pass (with concern) | Uses `GetTenantId()`/`GetUserId()`; header fallback is a cross-module concern. |
| BL — Generator: comment @mentions | Fail | Generated, but label uses raw number (BUG-NOTIF-002); sender name is client-supplied (BUG-CONV-002). |
| BL — Generator: quotation accepted | Fail | Generated; raw number "CQ-5"/"VQ-5" (BUG-NOTIF-002). |
| BL — Generator: order shipped | Fail | Generated; raw number "CO-5" (BUG-NOTIF-002). |
| BL — Generator: VO fully received | Fail | Generated; raw number "VO-5" (BUG-NOTIF-002). |
| BL — Generator: AP approval | Pass | `VendorInvoiceController.cs` lines 651–669. |
| BL — Generator: job completed | Pass | Uses the job number or "Job #ID". |
| BL — Generator: NCR assignment | Pass | `QualityController.cs` lines 1540–1552. |
| BL — Generator: NCR pending approval | Pass | Notifies the approver on `Pending_Approval`. |
| BL — Generator: NCR approved | Pass | Notifies the reporter (typed as NCR closed/approved). |
| BL — Generator: NCR closed | Pass | Notifies the reporter. |
| BL — Generator: support replies | Pass | Link `/?supportTicket=` handled by TopBar. |

## Cross-Module Concerns

| Concern | Root-cause module/file | Evidence |
| --- | --- | --- |
| `GetTenantId()`/`GetUserId()` fall back to the `tenantId`/`userId` headers when claims are missing; support-staff tokens (tenant 0) can act as any tenant/user on notification endpoints. (BUG-AUTH-014 covers the general header fallback.) | Support Portal — `QA_SupportPortal.md` | `Controllers/ApiBaseController.cs` lines 13–25, 34–46; used throughout `NotificationsController.cs`. |
| Vendor-portal tokens are accepted on `/Notifications/*`, so vendor users can send direct messages to internal staff through `Send`. | Vendor Portal — `QA_VendorPortal.md` | No `IsVendorPortal()` check in `NotificationsController.cs`. |
| Display-number scheme (`PONumber + 999`) used inconsistently across modules; notifications use raw numbers. | Sales / Procurement — `QA_Sales.md`, `QA_Procurement.md` | See BUG-NOTIF-002 evidence. |

