# QA — Password Change / Reset / Policy

| Module | Matrix section | Bug ID prefix | Tested | Confirmed Bugs | Potential Bugs | Manual Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Password Change / Reset / Policy | 1.2 | BUG-PWD | No | — | — | — |

Source of test cases: `QA_TEST_MATRIX.md`. Method: static trace of the actual implementation (React UI → service → Axios → .NET controller → service/repository → EF Core → SQL Server, and back). No application code, configuration or database is changed during QA. Findings that depend on deployed configuration, data or a real browser go under **Needs Manual Verification**.

Severity scale:
- **Critical**: security breach, data corruption, financial corruption, or a blocked core workflow.
- **High**: a major feature is broken or a significant security control is bypassed, with a workaround that is hard or unavailable.
- **Medium**: a feature works incorrectly in specific conditions, or a security control is weaker than configured.
- **Low**: cosmetic, minor UX, or an informational/hardening issue.

---

## Confirmed Bugs
_Not tested yet._

## Potential Bugs
_Not tested yet._

## Needs Manual Verification
_Not tested yet._

## No Issues Found
_Not tested yet._

## QA Coverage

| Test Area | Tested | Result |
| --- | --- | --- |
| Navigation | No | Not Tested |
| CRUD | No | Not Tested |
| Search | No | Not Tested |
| Filters | No | Not Tested |
| Sorting | No | Not Tested |
| Pagination | No | Not Tested |
| Validation | No | Not Tested |
| Permissions | No | Not Tested |
| API | No | Not Tested |
| Database | No | Not Tested |
| Business Logic | No | Not Tested |
| Location | No | Not Tested |
| Tenant | No | Not Tested |
| Cross-Module | No | Not Tested |
| Responsive/PWA | No | Not Tested |
