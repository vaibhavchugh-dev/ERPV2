# Master CSV Import — Reference

Copy shapes from Process/Workstation; rename fields for the target entity.

## API DTOs (C#)

```csharp
public class {Entity}ImportRequest
{
    public int Tenantid { get; set; }
    public bool UpdateExisting { get; set; } = true;
    public bool StopOnError { get; set; } = false;
    public List<{Entity}ImportRow> Rows { get; set; } = new();
}

public class {Entity}ImportRow
{
    public int? RowNumber { get; set; }
    // All importable fields as string? — parse inside the endpoint
    public string? Name { get; set; }
    // ...
}

public class {Entity}ImportResult
{
    public int Created { get; set; }
    public int Updated { get; set; }
    public int Skipped { get; set; }
    public int Failed { get; set; }
    public List<{Entity}ImportRowResult> Rows { get; set; } = new();
}

public class {Entity}ImportRowResult
{
    public int RowNumber { get; set; }
    public int? {Entity}Id { get; set; }
    public string Status { get; set; } = "";
    public string Message { get; set; } = "";
    public string? Warning { get; set; }
}
```

Row number: `var rowNumber = row.RowNumber ?? (i + 2);`

## UI service types (TypeScript)

```typescript
export interface {Entity}ImportRow {
  RowNumber?: number;
  // PascalCase keys matching API row DTO (strings)
}

export interface {Entity}ImportRowResult {
  rowNumber: number;
  /* entityId */?: number | null;
  status: string;
  message: string;
  warning?: string | null;
}

export interface {Entity}ImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  rows: {Entity}ImportRowResult[];
}

export const {ENTITY}_IMPORT_HEADERS = [/* ordered headers */] as const;
```

Map API response with camel + Pascal fallbacks:

```typescript
created: raw.created ?? raw.Created ?? 0,
// ...
rows: (raw.rows || raw.Rows || []).map((r: any) => ({
  rowNumber: r.rowNumber ?? r.RowNumber,
  status: r.status ?? r.Status ?? "",
  message: r.message ?? r.Message ?? "",
  warning: r.warning ?? r.Warning ?? null,
})),
```

## Modal skeleton

```tsx
import { buildCsv, downloadCsv, mapCsvRows, parseCsv } from "../../Common/Utils/CsvImport";
import "./CustomerMasterSlideout.scss";

type PreviewRow = {Entity}ImportRow & { _errors: string[]; _warnings: string[] };

const HEADER_ALIASES: Record<string, string> = {
  // lowercased, no spaces → canonical PascalCase key
  name: "Name",
};

// mapCsvRows(..., "Name") — requiredKey must be a mapped canonical key

// Layout:
// <div className="slideout-overlay">
//   <div className="form-card">
//     <div className="form-header">…</div>
//     <div className="tab-content" style={{ padding: "0 1.5rem 1rem" }}>…</div>
//     <div className="form-actions" style={{ flexShrink: 0 }}>Cancel / Import</div>
//   </div>
// </div>
```

### Soft-lookup warnings

If validating FK-by-name against a list loaded async:

1. Track `lookupsLoaded` (set true in `finally`)
2. Derive warnings in `useMemo` only when `lookupsLoaded`
3. Show “checking …” until loaded — never warn against an empty list

### Template download

```typescript
downloadCsv(
  "{entity}-import-template.csv",
  buildCsv({ENTITY}_IMPORT_HEADERS, templateRows.map(/* ordered cells */))
);
```

## List page snippet

```tsx
const [showImport, setShowImport] = useState(false);
// button: onClick={() => setShowImport(true)}
{showImport && (
  <{Entity}ImportModal
    onClose={() => setShowImport(false)}
    onImported={loadList}
  />
)}
```

## Parser helpers (copy from ProcessController)

- `ParseYesNo` — Yes/Y/1/True → 1; No/N/0/False → 0; else null/default
- `ParseStatus` — Active/1 → 1; Inactive/0 → 0
- `ParseNullableInt` / `ParseNullableDecimal`
- Normalize enums/categories to a known allow-list when present
