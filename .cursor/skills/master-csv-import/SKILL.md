---
name: master-csv-import
description: >-
  Adds CSV bulk-import to Cimmple ERPV2 master pages (API endpoint, service
  method, import modal, template download, list-page Import button). Use when
  the user asks to add import/CSV upload to a master, clone Process/Workstation
  import, or build an import template for masters.
disable-model-invocation: true
---

# Master CSV Import (ERPV2)

Clone the Process Master / Workstation Master import pattern. Do not invent a
new CSV stack — reuse `Cimmple_UI/src/Common/Utils/CsvImport.ts`.

## Before coding — gather

1. Entity name (e.g. Customer, Item, JobTemplate)
2. Required unique key(s) for match/upsert (name, code, or both)
3. Columns to import (header names + types)
4. Soft lookups (FK by name → warning vs hard error)
5. Whether a sample template (`*TemplateData.ts`) is needed

## Checklist

```
- [ ] API: POST Import{Entities} + DTOs on existing controller
- [ ] UI service: Import{Entities}, IMPORT_HEADERS, result mapping (camel/Pascal)
- [ ] Import modal: parse → preview → validate → import
- [ ] List page: Import button + showImport + modal
- [ ] Optional: *TemplateData.ts for Download Template
- [ ] Footer spacing: form-card > .form-actions (shared SCSS already covers this)
```

## Reference files (read these first)

| Layer | Process example | Workstation example |
|-------|-----------------|---------------------|
| Util | `Cimmple_UI/src/Common/Utils/CsvImport.ts` | same |
| Modal | `Cimmple_UI/src/Modules/Masters/ProcessMasterImportModal.tsx` | `WorkstationMasterImportModal.tsx` |
| List | `Cimmple_UI/src/Modules/Masters/ProcessMaster.tsx` | `WorkstationMaster.tsx` |
| Service | `Cimmple_UI/src/Common/Services/ProcessService.ts` | `WorkstationService.ts` |
| API | `Cimmple_API/.../Controllers/ProcessController.cs` `ImportProcesses` | `WorkstationController.ImportWorkstations` |
| Template | `ProcessMasterTemplateData.ts` | `WorkstationMasterTemplateData.ts` |

For DTO shapes and modal skeleton, see [reference.md](reference.md).

## Shared CSV util (always use)

- `parseCsv` / `mapCsvRows(aliases, requiredKey)` / `buildCsv` / `downloadCsv` / `escapeCsvValue`
- Client must set `RowNumber` from `mapCsvRows` so server messages match the file
- Header aliases: lowercase, whitespace stripped (e.g. `processname`, `name` → `ProcessName`)

## API contract

`POST api/{Controller}/Import{Entities}`

Request:
- `Tenantid`, `UpdateExisting` (default true), `StopOnError` (default false)
- `Rows[]` with optional `RowNumber` + string fields (parse on server)

Per-row result: `RowNumber`, entity id, `Status` (`Created`|`Updated`|`Skipped`|`Error`), `Message`, optional `Warning`

Aggregate: `Created`, `Updated`, `Skipped`, `Failed`, `Rows`

### Server rules

1. Tenant-scope all queries; reject `Tenantid <= 0`
2. Load existing entities once; upsert in a transaction
3. Match by code then name (or the entity’s natural key); case-insensitive
4. Detect duplicates within the batch (`HashSet`)
5. Soft FK lookups → set `Warning`, leave FK null (do not fail the row)
6. Hard validation failures → `Error` + increment `Failed`; honor `StopOnError`
7. If match exists and `!UpdateExisting` → `Skipped`
8. Parsers for Yes/No, Active/Inactive, int/decimal — copy helpers from ProcessController

## UI service

- `*_IMPORT_HEADERS` const matching template column order
- `Import{Entities}(rows, { updateExisting, stopOnError })`
- Map response with both camelCase and PascalCase fallbacks (`raw.created ?? raw.Created`)

## Import modal pattern

1. Props: `onClose`, `onImported`
2. State: `previewRows`, `fileName`, `updateExisting`, `importing`, `result`
3. File → `parseCsv` → `mapCsvRows` → client `_errors` / `_warnings`
4. Preview table: row #, key columns, Issues (errors red, warnings amber)
5. Disable Import while required async lookups are loading (e.g. `workstationsLoaded`) so previews don’t false-warn
6. Download Template via `buildCsv` + `downloadCsv` from headers + template rows
7. Styles: `CustomerMasterSlideout.scss`; footer is direct child of `.form-card` (padding via `.form-card > .form-actions`)

## List page wiring

- `showImport` state
- Secondary **Import** button next to Add
- `{showImport && <XImportModal onClose=… onImported={reloadList} />}`

## Template data (optional)

- `*TemplateData.ts` exporting typed sample rows
- Prefer names that resolve in related masters; soft-lookup FKs if not guaranteed
- Keep Process ↔ Workstation templates coherent when both exist

## Do / Don’t

**Do**
- Reuse `CsvImport.ts` and the Process/Workstation modal structure
- Preserve original CSV line numbers
- Soft-fail optional name→id lookups
- Keep import row DTOs as strings; parse server-side

**Don’t**
- Add a new CSV library
- Treat missing optional FK as a hard import error
- Compute client warnings against empty lookup lists
- Put import footer inside `.airframe-form` (modals use card-level footer)

## Implementation order

1. API endpoint + DTOs
2. Service method + headers
3. Modal (copy closest existing modal, rename fields)
4. List-page button
5. Template data if requested
