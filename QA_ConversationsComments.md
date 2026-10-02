# QA — Conversations & Entity Comments

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Conversations & Entity Comments | 1.9 | BUG-CONV | Yes | 5 | 2 | 5 |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

Files traced: `Cimmple_UI/src/Common/Components/ConversationPanel.tsx` (+ `.scss`), `Common/Components/CommentsSection.tsx`, `Common/Services/ConversationService.ts`, `Common/Services/EntityCommentService.ts`, `Common/Utils/chatMentions.tsx`, the comment usages in `CustomerOrderSlideout.tsx`, `CustomerQuotationSlideout.tsx`, `VendorOrderSlideout.tsx`, `VendorQuotationSlideout.tsx`, `JobOrderSlideout.tsx`; `Cimmple_API/CimmpleAPI/Controllers/ConversationsController.cs`, `Services/ConversationService.cs`, `Controllers/EntityCommentsController.cs`, `Services/CommentMentionHelper.cs`, `Controllers/NotificationsController.cs` (`Send`), `Data/Models/Conversation.cs`, `Data/CimmpleDbContext.cs`, `Services/ConversationSchemaService.cs`, and the document save paths in `OrderController.cs`, `QuotationController.cs`, `JobOrderController.cs`.

## Confirmed Bugs

### BUG-CONV-001 — After a third user is @mentioned in a chat, later direct messages between the original two users go into the shared group thread

**Severity:** Medium. Messages the sender believes are private 1:1 messages are disclosed to a third person.

**Status:** Confirmed

**Test Area:** Business logic / Permissions

**Description:**
`Conversation` is documented as a "DM conversation container (1:1 for Option A)". When a reply contains an @mention of a user who is not a participant, `PostMessageInternalAsync` adds that user as a participant, giving them the full history. That is the intended mention behaviour. The problem is in `FindDmConversationIdAsync`, which `POST /Notifications/Send` (the TopBar "Notify user" dialog) uses to find the DM between two users: it returns a conversation with exactly two participants if one exists, **otherwise the smallest shared conversation with two or more participants**. Once A and B's only conversation has gained C through a mention, every later "Notify user" message from A to B (or B to A) is posted into the three-person thread, and C can read it. The sender gets "Message sent." with no indication that the thread is no longer private. In the conversation list, the thread is labelled with only one other participant's name (`ListMineAsync` picks the first other participant), so the sender can't tell either; only the open thread header shows "2 people".

**Steps to Reproduce:**
1. User A sends user B a message via "Notify user".
2. In the Messages panel, A or B replies "@Carol please check" choosing Carol from the people picker.
3. Carol now sees the conversation, including all earlier messages.
4. Days later, A uses "Notify user" to send B a private message.
5. Carol sees the new message in the same thread.

**Expected:** A direct message from A to B is delivered to a conversation that only A and B can read (create a new 1:1 conversation if the existing one has more participants).

**Actual:** The message is posted to the group conversation that includes C.

**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Components/NotifyUserDialog.tsx` lines 97–103 (`NotificationService.Send`); `Common/Components/ConversationPanel.tsx` lines 286–322 (reply with encoded mention tokens).
* Backend: `Cimmple_API/CimmpleAPI/Services/ConversationService.cs` lines 486–516 (`FindDmConversationIdAsync` falls back to a conversation with more than two participants at 500–515), 57–73 (`FindOrCreateDmAsync` reuses it), 560–588 (mentioned users added as participants), 280–288 (list shows the first other participant's name only), 360–364 (thread header "N people"); `Data/Models/Conversation.cs` (doc comment "1:1 for Option A").
* Database: `ConversationParticipants` (3 rows for the conversation), `ConversationMessages`.

**Root Cause:** The DM lookup treats any shared conversation as a DM when no exact 1:1 conversation exists.

**Business Impact:** Confidential messages (pricing, HR, disciplinary) are exposed to colleagues who were only mentioned once.

**Affected Areas:** Conversations, Notifications (Send), chat email notifications.

**Recommended Fix:** Return only conversations with exactly two participants from the DM lookup (otherwise create a new 1:1 conversation), and show all participant names in the list.

---

### BUG-CONV-002 — The comments API trusts the client for the whole comment list, the comment authors and the mention notification text

**Severity:** Medium. Any user who can open a document can silently rewrite or delete other users' comments and send mention notifications that appear to come from someone else.

**Status:** Confirmed

**Test Area:** Permissions / API / Data integrity

**Description:**
`PUT /EntityComments` (matrix: "replaces full list") stores whatever comment array the client sends: text, `CreatedBy` and `CreatedAt` for every comment, including comments written by other people. There is no server-side check that existing comments are unchanged or that only the caller's own comments are removed. `CommentMentionHelper.NotifyAsync` builds the notification title as "`{CreatedBy}` mentioned you" from the client-supplied `CreatedBy`, and uses the client-supplied `entityLabel` and `linkPath` when present. On Job Orders, the UI deliberately hides Delete (`allowDelete={false}`, documented as "job order read-only list"), but the same API removes job order comments when they are left out of the list.

**Steps to Reproduce:**
1. User A adds a comment on customer order CO#1004.
2. User B (who can open CO#1004) sends `PUT /api/EntityComments` with `entityType: "customerorder"`, `entityId` of the order, and a `comments` array where A's comment text is changed (keeping `createdBy: "A"`), or omitted.
3. Reload the order: A's comment shows the new text under A's name, or is gone.
4. B sends a new comment with `createdBy: "CEO"` and `mentionedUserIds: [<C's id>]`; C's bell shows "CEO mentioned you".
5. Repeat step 2 with `entityType: "joborder"`; the job order comment disappears although the UI offers no Delete for job orders.

**Expected:** The server records the author and time of new comments from the token, does not allow editing or removing other users' comments (or at least not on Job Orders, where the UI marks the list as read-only), and builds notification text from server data.

**Actual:** The full list, authorship and notification wording are client-controlled.

**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Components/CommentsSection.tsx` lines 115–130 (sends the full list), 190–196 (`createdBy` from `localStorage`), 34–35 (`allowDelete` "job order read-only list"); `Modules/JobOrders/JobOrderSlideout.tsx` line 3944 (`allowDelete={false}`).
* Backend: `Cimmple_API/CimmpleAPI/Controllers/EntityCommentsController.cs` lines 43–47 (comments, `LinkPath` and `EntityLabel` from the request), 62–64 / 146–148 / 163–165 (`CommentsJson` replaced), 103–127 (VO comments deleted and re-inserted with client `CreatedBy`/`CreatedAt`), 179–190 (notify); `Services/CommentMentionHelper.cs` lines 54–58 (title from `comment.CreatedBy`, body from `entityLabel`).
* Database: `CustomerOrder.CommentsJson`, `QuotationOrder.CommentsJson`, `VendorQuotations.CommentsJson`, `JobOrderMaster.CommentsJson`, `VendorOrderComments`, `Notifications`.

**Root Cause:** Comments are stored as a client-owned blob, without per-comment server identity.

**Business Impact:** Comments cannot be relied on as an audit trail of who said what; mention notifications can be used for impersonation.

**Affected Areas:** CO, CQ, VO, VQ, JO comments; Notifications (comment mentions).

**Recommended Fix:** Move to add/delete endpoints per comment (or diff the submitted list against the stored one on the server), stamp author and time from the token, restrict deletion to the author or an admin (and disallow it for Job Orders), and build notification titles from the actor's user record.

---

### BUG-CONV-003 — Concurrent comment edits, or saving a document with a stale comment list, overwrite other users' comments

**Severity:** Medium. Comments are lost without any error.

**Status:** Confirmed

**Test Area:** Data integrity / Concurrency

**Description:**
Every comment add or delete sends the full list currently held in that user's browser, and the server replaces the stored list with it (no version or merge). The parent document save (CO, CQ, VO, VQ, JO) also sends `Comments: comments` from the slideout state, and the server replaces `CommentsJson` with it (CO sets it to null when the list is empty). So:
- If users A and B have the same order open and each adds a comment, the second save removes the first user's comment.
- If user A has the order open, user B adds a comment (persisted immediately), and A then clicks Save on the order, B's comment is erased.
New comment IDs are generated in the browser from the local maximum, so two users can also create comments with the same ID; deleting one by ID in a later save removes both.

**Steps to Reproduce:**
1. Users A and B open customer order CO#1004 in separate browsers.
2. B adds the comment "Ship Friday" (saved immediately).
3. A changes the order's notes and clicks Save.
4. Reopen the order: B's comment is gone.

**Expected:** A comment saved by one user is not removed by another user's unrelated save (merge, or reject with a "reload" message).

**Actual:** Last writer wins for the whole comment list.

**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Components/CommentsSection.tsx` lines 63–70 and 191 (client-side IDs), 198–210 (`[...comments, newComment]` sent in full), 221–232 (delete by ID, full list sent); `Modules/Orders/CustomerOrderSlideout.tsx` line 1104 (`Comments: comments || []` in the order save); same pattern in `CustomerQuotationSlideout.tsx` lines 861, 1203, `VendorOrderSlideout.tsx` line 1378, `VendorQuotationSlideout.tsx` line 1492, `JobOrderSlideout.tsx` lines 757, 1043.
* Backend: `Controllers/OrderController.cs` lines 628–637 (CO `CommentsJson` replaced or set to null on order save); `Controllers/EntityCommentsController.cs` lines 62–64, 103–127, 146–148, 163–165 (replace).
* Database: `CommentsJson` columns; `VendorOrderComments`.

**Root Cause:** Comments are saved as a whole list with no concurrency token, and document saves carry the comment list along.

**Business Impact:** Team communication on orders and jobs disappears silently, including mentions that were already notified.

**Affected Areas:** CO, CQ, VO, VQ, JO slideouts; Entity Comments.

**Recommended Fix:** Stop sending comments with the parent document once it has an ID, persist comments per item with server-generated IDs, or add a concurrency check (row version) and reload on conflict.

---

### BUG-CONV-004 — Chat replies longer than 4000 characters are silently cut off

**Severity:** Low. Part of a message is lost without warning.

**Status:** Confirmed

**Test Area:** Validation

**Description:**
The matrix requires "≤4000 chars". The conversation reply box has no `maxLength` and no length check, and before sending, each friendly mention ("@Alice Smith", "@CO#1004") is expanded into a longer token (`@[Alice Smith](user:12)`, document tokens with type and ID). The server does not reject long messages; it truncates the body to 4000 characters when saving. The sender's own view shows the full text (it is appended locally from the draft), so the sender only sees the cut-off message after the next refresh, and the recipient never sees the end.

**Steps to Reproduce:**
1. Open a conversation and paste a 4,100-character message (or a 3,950-character message with several @mentions).
2. Send it. The message appears complete in your own panel.
3. Close and reopen the conversation (or view it as the recipient): the message ends at 4,000 characters, possibly in the middle of a mention token.

**Expected:** The UI prevents or warns about messages over 4000 characters (after token expansion), or the API rejects them with an error.

**Actual:** The message is truncated silently.

**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Components/ConversationPanel.tsx` lines 379–418 (textarea without `maxLength`), 286–309 (`encodePendingMentionsInBody`, optimistic message uses the full `text`); `Common/Utils/chatMentions.tsx` (`formatChatMentionToken` / `encodePendingMentionsInBody` expand mentions).
* Backend: `Services/ConversationService.cs` line 536 (`Body = Truncate(body, 4000)`); `Data/Models/Conversation.cs` line 59 (message body max length 4000).
* Database: `ConversationMessages.Body` (nvarchar(4000)).

**Root Cause:** Length is enforced only by silent server truncation.

**Business Impact:** Long instructions lose their ending; a cut mention token renders as raw text.

**Affected Areas:** Conversations; Notifications (Send uses the same path, but its dialog has `maxLength` 4000 before mention expansion).

**Recommended Fix:** Add a character limit and counter in the reply box that accounts for token expansion, and return 400 from the API when the encoded body exceeds 4000 characters.

---

### BUG-CONV-005 — Pressing Esc while the chat mention picker shows "Searching…" or "No matches" closes the whole conversation panel

**Severity:** Low. Trying to dismiss the picker closes the conversation and discards the unsent draft.

**Status:** Confirmed

**Test Area:** Keyboard / Esc layering

**Description:**
The matrix requires the mention picker to close with Esc and nested popups to close before their overlay. In `ConversationPanel`, the picker is displayed whenever `mentionOpen` is true, including the "Searching…", "No matches" and "Type a name or document number" states, but the keyboard handler only handles Esc (and calls `preventDefault`) when `pickerItems.length > 0`. With an empty picker on screen, Esc is not prevented, so the global Esc handler presses the panel's close button and the whole conversation panel closes instead of just the picker.

**Steps to Reproduce:**
1. Open the Messages panel and a conversation.
2. Type "@zzzz" so the picker shows "No matches" (or "@CO#" while it shows "Searching…").
3. Press Esc.

**Expected:** Only the picker closes; the panel and draft remain.

**Actual:** The conversation panel closes and the draft is cleared.

**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Components/TopBar.tsx` lines 1042–1047 (closing sets the conversation to null); `Common/Components/ConversationPanel.tsx` lines 82–88 (draft cleared when the conversation is null), 390–412 (Esc handled only inside `if (mentionOpen && pickerItems.length > 0)`), 419–473 (picker rendered for any `mentionOpen`, with "Searching…" at 444–446 and "No matches" at 464–471); `Common/Utils/escapeToClose.ts` lines 156–159 (acts when not prevented) and line 23 (`.conversation-panel-close` is a known close control). Compare `CommentsSection.tsx` line 290, which renders its list only when it has items, so Esc there is correct.
* Backend: n/a.
* Database: n/a.

**Root Cause:** The Esc branch is gated on the item count rather than on the picker being visible.

**Business Impact:** Minor; the user has to reopen the panel and conversation.

**Affected Areas:** Conversations; Esc layering (1.7).

**Recommended Fix:** Handle Esc (with `preventDefault`) whenever `mentionOpen` is true, regardless of item count.

---

## Potential Bugs

### BUG-CONV-006 — Any user can delete other users' comments on CO, CQ, VO and VQ from the UI

**Severity:** Low

**Status:** Potential

**Test Area:** Permissions

**Description:** `CommentsSection` shows a Delete button on every comment (not only the current user's) whenever `allowDelete` is true, which is the default for CO, CQ, VO and VQ. Deleting persists immediately. There is no author or role check in the UI or the API.

**Steps to Reproduce:**
1. User A comments on a vendor order.
2. User B opens the vendor order; A's comment shows a Delete button.
3. B clicks Delete; A's comment is removed for everyone.

**Expected:** If comments are meant to be an audit trail, only the author (or an administrator) can delete a comment.

**Actual:** Anyone who can open the document can delete any comment.

**Evidence:**
* Frontend: `Cimmple_UI/src/Common/Components/CommentsSection.tsx` lines 406–423 (Delete rendered for each comment), 221–239 (`handleDelete`).
* Backend: `Controllers/EntityCommentsController.cs` lines 25–193 (no ownership check).
* Database: `CommentsJson`, `VendorOrderComments`.

**Root Cause:** No ownership rule exists for comments.

**Business Impact:** Comment history can be erased by any colleague.

**Affected Areas:** CO, CQ, VO, VQ comments.

**Recommended Fix:** Show Delete only on the current user's comments (and enforce it server-side; see BUG-CONV-002).

**Why further verification is needed:** The matrix and UI do not state an ownership rule for CO/CQ/VO/VQ comments; whether deleting others' comments is allowed is a product decision.

---

### BUG-CONV-007 — Simultaneous first messages or mentions can create duplicate DM threads or fail with a server error

**Severity:** Low

**Status:** Potential

**Test Area:** Concurrency / Database

**Description:** `FindOrCreateDmAsync` checks for an existing DM and then creates one in separate statements without a transaction or unique constraint on the user pair. If A and B message each other for the first time at the same moment, two separate 1:1 conversations can be created. Adding mentioned users follows the same check-then-insert pattern against the unique (ConversationId, UserId) index, so two replies mentioning the same new user at the same time can cause a unique-index violation (HTTP 500) for one of them after its message was already saved.

**Steps to Reproduce:**
1. Using two API clients, send `POST /Notifications/Send` from A to B and from B to A at the same moment (no prior conversation).
2. Check `Conversations`/`ConversationParticipants` for two 1:1 conversations between A and B.
3. Similarly, send two replies mentioning the same new user simultaneously and observe the responses.

**Expected:** One DM per user pair; concurrent mentions do not fail.

**Actual (by code trace):** Duplicate DMs or a 500 are possible.

**Evidence:**
* Frontend: n/a.
* Backend: `Services/ConversationService.cs` lines 57–103 (find, then create), 566–587 (participant existence check, then insert, then `SaveChangesAsync`).
* Database: `ConversationParticipants` unique (ConversationId, UserId) (`Data/CimmpleDbContext.cs` line 833); no uniqueness for the user pair.

**Root Cause:** No transaction or pair-level constraint around DM creation and participant adds.

**Business Impact:** Split conversation history; occasional error toast after the message was actually sent.

**Affected Areas:** Conversations, Notifications (Send).

**Recommended Fix:** Wrap find-or-create in a serializable transaction (or add a pair key), and treat a duplicate participant insert as success.

**Why further verification is needed:** Timing-dependent; needs a concurrent load test to reproduce.

---

## Needs Manual Verification

1. **Area:** Long threads
   - **What to Test:** Open a conversation with more than 100 messages.
   - **Expected:** Older messages remain reachable (scroll or load more).
   - **Why Manual Testing Is Required:** `GetThreadAsync` returns the latest 100 messages by default (max 200) and the panel has no "load older" control; whether this is acceptable is a product decision (`ConversationService.cs` lines 338–343, 383).

2. **Area:** Polling load
   - **What to Test:** Keep the Messages panel open for several users with many conversations and monitor API/database load.
   - **Expected:** Acceptable response times.
   - **Why Manual Testing Is Required:** The panel polls every 5 seconds and `ListMineAsync` loads message IDs for all listed conversations to compute unread counts; cost depends on data volume.

3. **Area:** Comments on unsaved documents
   - **What to Test:** In each of the five slideouts (CO, CQ, VO, VQ, JO), add comments on a new document before the first save, then save; also add comments after the first save and confirm they persist immediately without saving the document.
   - **Expected:** Comments on new documents are saved with the document; comments on saved documents persist immediately; the helper text matches.
   - **Why Manual Testing Is Required:** Behaviour depends on each slideout passing `persistContext` with the new ID after the first save (`CommentsSection.tsx` lines 65, 241–243).

4. **Area:** Comment timestamps across save paths
   - **What to Test:** Add a VO comment, then save the VO document; compare the comment time before and after, and with a user in a different time zone.
   - **Expected:** The time shown does not shift.
   - **Why Manual Testing Is Required:** The PUT path normalises `CreatedAt` to UTC (`EntityCommentsController.cs` lines 111–118) while the document save path stores comments through `OrderController`; the display depends on the stored kind.

5. **Area:** Responsive panel and comments
   - **What to Test:** Conversation panel, mention picker and comment sections at 375–430 px.
   - **Expected:** Usable layout; picker not clipped.
   - **Why Manual Testing Is Required:** Visual.

## No Issues Found

- `Get/{id}`, `Reply` and `MarkRead` require the caller to be a participant and filter by tenant; non-participants get "Conversation not found." (`ConversationService.cs` lines 160–209, 334–421, 423–484; `ConversationsController.cs` lines 42–66, 68–101, 103–115).
- Opening a thread marks it read (`markRead: true`), and the unread total is computed from `LastReadMessageId` (`ConversationService.cs` lines 309–332).
- Self-messaging is blocked in both the API (`NotificationsController.cs` line 186; `FindOrCreateDmAsync` line 59) and the UI (current user excluded from pickers).
- Empty bodies are rejected (UI `handleSend` returns on an empty draft; `ConversationService.cs` lines 124 and 169 return an error).
- Conversation list and thread `take` values are clamped (list 1–100, thread 1–200).
- Comments save immediately only when `entityId > 0`; otherwise they are kept in the slideout state and saved with the parent document, matching the matrix (`CommentsSection.tsx` lines 65, 205, 241–243).
- @mentions in comments create `CommentMention` notifications for each mentioned user except the actor; failures do not block the save (`CommentMentionHelper.cs` lines 28–87); mention IDs are stripped before storage.
- `EntityComments` checks the document exists in the tenant and applies `CanAccessLocation` for CO, CQ, VO and VQ (`EntityCommentsController.cs` lines 55–60, 96–101, 142–144); unsupported entity types return 400 (line 174).
- Comment save failures roll back the optimistic UI and restore the draft with an error toast (`CommentsSection.tsx` lines 211–216).
- Mention pickers support Arrow Up/Down, Enter/Tab to insert and Esc to close in both comments and chat (when items are present).
- Job order comments hide Delete as documented (`JobOrderSlideout.tsx` line 3944).
- Unique (ConversationId, UserId) index exists in both the EF model and the runtime schema service (`CimmpleDbContext.cs` line 833; `ConversationSchemaService.cs`).

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | Yes | Pass (mention links permission-checked via `navigateToMentionDocument`) |
| CRUD | Yes | Fail (BUG-CONV-002, BUG-CONV-003); Potential (BUG-CONV-006) |
| Search | Yes | Pass for the mention pickers; 200-user limit is BUG-NOTIF-004 |
| Filters | N/A | None |
| Sorting | Yes | Pass (conversations by last message, messages chronological) |
| Pagination | Yes | Manual (item 1, thread limited to the latest 100) |
| Validation | Yes | Fail (BUG-CONV-004) |
| Permissions | Yes | Fail (BUG-CONV-001, BUG-CONV-002); Potential (BUG-CONV-006) |
| API | Yes | Fail (BUG-CONV-002) |
| Database | Yes | Potential (BUG-CONV-007); unique participant index present |
| Business Logic | Yes | Fail (BUG-CONV-001, BUG-CONV-003) |
| Location | Yes | Pass for CO/CQ/VO/VQ; JobOrder excluded as documented (cross-module concern) |
| Tenant | Yes | Pass for query filters; tenant fallback to the request body is a cross-module concern |
| Cross-Module | Yes | Fail (BUG-CONV-003 across five slideouts); BUG-NOTIF-002 labels |
| Responsive/PWA | No | Manual (item 5) |

## Matrix Checklist

| Matrix Row | Result | Notes |
| --- | --- | --- |
| FE — Conversation list: `ConversationPanel.tsx`, GET `ListMine`, `GetUnreadCount` | Fail | List works; group threads are labelled with one name and DMs fall into them (BUG-CONV-001). |
| FE — View thread: marks read, GET `Get/{id}` | Pass | Participant-checked; marks read; history limit Manual item 1. |
| FE — Reply: @ people / documents, POST `Reply`, `MarkRead` | Fail | Silent truncation (BUG-CONV-004); mention adds participants that later receive DMs (BUG-CONV-001). |
| FE — Comments: `CommentsSection.tsx` in CO, CQ, VO, VQ, JO slideouts, PUT `/EntityComments` | Fail | BUG-CONV-002, BUG-CONV-003; Potential BUG-CONV-006; Manual item 3. |
| FE — Mentions: picker (arrow keys, Enter/Tab, Esc), `SearchDocuments`, user list | Fail | Keys work when items exist; Esc on an empty picker closes the panel (BUG-CONV-005). User list limited to 200 (BUG-NOTIF-004). Document search not site-filtered (BUG-SRCH-001). |
| FE — Validation: body required; ≤4000 chars; cannot message self | Fail | Body and self checks pass; 4000 limit not enforced in the UI (BUG-CONV-004). |
| BE — List/Get: `ListMine`, `GetUnreadCount`, `Get/{id}` | Pass | Tenant and participant filtered; `take` clamped. |
| BE — Create: POST `Reply`, `MarkRead` | Fail | Truncation (BUG-CONV-004); concurrency Potential (BUG-CONV-007). |
| BE — Update comments: PUT `/EntityComments` (replaces full list) | Fail | Replacement trusts client authorship and list (BUG-CONV-002) and loses concurrent edits (BUG-CONV-003). |
| BE — Authorization: participant check; `CanAccessLocation` (except JobOrder) | Pass (with concerns) | Participant and location checks present as documented; JobOrder exception and tenant fallback listed below. |
| BL — Comments save immediately only when `entityId > 0`, otherwise with the parent document | Pass | Implemented; parent saves also overwrite later comments (BUG-CONV-003). |
| BL — @mentions create `CommentMention` notifications | Pass | Created per mentioned user; sender name is client-supplied (BUG-CONV-002). |

## Cross-Module Concerns

| Concern | Root-cause module/file | Evidence |
| --- | --- | --- |
| `EntityComments` falls back to `request.TenantId` when the token tenant is 0 (support-staff tokens), so a support token can write comments in any tenant. Conversations use the `tenantId`/`userId` header fallback (see BUG-AUTH-014). | Support Portal — `QA_SupportPortal.md` | `Controllers/EntityCommentsController.cs` lines 31–33; `Controllers/ApiBaseController.cs` lines 13–25, 34–46. |
| Vendor-portal tokens are accepted on `/Conversations/*` and `/EntityComments` (vendor users can read/write internal comments on documents in their tenant). | Vendor Portal — `QA_VendorPortal.md` | No `IsVendorPortal()` check in `ConversationsController.cs` or `EntityCommentsController.cs`. |
| Job order comments skip `CanAccessLocation` (documented exception); `JobOrderController` has no per-record location check at all. | Manufacturing (Job Orders) — `QA_Manufacturing.md` | `Controllers/EntityCommentsController.cs` lines 156–171. |
| No server-side permission check on comment writes (any authenticated user who knows an ID can write comments on any document type at an allowed site). | Roles & Permissions — `QA_RolesPermissions.md` | `Controllers/EntityCommentsController.cs` lines 25–193. |
| Document @mention search is not site- or permission-filtered. | Global Search — `QA_GlobalSearch.md` (BUG-SRCH-001, BUG-SRCH-002) | `Controllers/GlobalSearchController.cs` lines 104–228. |
| Comment-mention labels use raw document numbers. | Notifications — `QA_Notifications.md` (BUG-NOTIF-002) | `Controllers/EntityCommentsController.cs` lines 67, 88, 131, 151. |
