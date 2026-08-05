# Listing column chooser — code reference

Canonical source: `Cimmple_UI/src/Modules/Masters/JobTemplateMaster.tsx`.

## 1. Column model

```tsx
interface ColumnDefinition {
  key: string;
  label: string;
  sortKey?: string;
  /** Columns the user cannot hide, so a row is never blank. */
  locked?: boolean;
}

const COLUMNS: ColumnDefinition[] = [
  { key: "code", label: "Code", sortKey: "code", locked: true },
  { key: "name", label: "Name", sortKey: "name", locked: true },
  { key: "status", label: "Status", sortKey: "status" },
  // ...page-specific columns
];

const DEFAULT_HIDDEN_COLUMNS = ["optionalFieldA", "optionalFieldB"];
const COLUMN_PREFERENCE_KEY = "entityMaster.hiddenColumns"; // unique per page
```

## 2. State + persistence

```tsx
const [hiddenColumns, setHiddenColumns] = useState<string[]>(() => {
  try {
    const stored = localStorage.getItem(COLUMN_PREFERENCE_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_HIDDEN_COLUMNS;
  } catch {
    return DEFAULT_HIDDEN_COLUMNS;
  }
});
const [showColumnChooser, setShowColumnChooser] = useState(false);
const columnChooserRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!showColumnChooser) return;

  const handleClickOutside = (event: MouseEvent) => {
    if (
      columnChooserRef.current &&
      !columnChooserRef.current.contains(event.target as Node)
    ) {
      setShowColumnChooser(false);
    }
  };

  document.addEventListener("mousedown", handleClickOutside);
  return () => document.removeEventListener("mousedown", handleClickOutside);
}, [showColumnChooser]);

const toggleColumn = (key: string) => {
  setHiddenColumns((prev) => {
    const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
    try {
      localStorage.setItem(COLUMN_PREFERENCE_KEY, JSON.stringify(next));
    } catch {
      // Preference persistence is best-effort
    }
    return next;
  });
};

const visibleColumns = useMemo(
  () => COLUMNS.filter((c) => c.locked || !hiddenColumns.includes(c.key)),
  [hiddenColumns]
);
```

## 3. Header control (inside `.page-actions`)

```tsx
<div className="column-chooser" ref={columnChooserRef}>
  <button
    className="btn-secondary"
    onClick={() => setShowColumnChooser(!showColumnChooser)}
    type="button"
  >
    <span>Columns</span>
  </button>
  {showColumnChooser && (
    <div className="column-chooser-menu">
      {COLUMNS.map((column) => (
        <label className="column-chooser-option" key={column.key}>
          <input
            type="checkbox"
            checked={column.locked || !hiddenColumns.includes(column.key)}
            disabled={column.locked}
            onChange={() => toggleColumn(column.key)}
          />
          <span>{column.label}</span>
        </label>
      ))}
    </div>
  )}
</div>
```

Typical order in `.page-actions`: Export (optional) → **Columns** → Add (primary).

## 4. Table driven by `visibleColumns`

```tsx
<thead>
  <tr>
    {visibleColumns.map((column) => (
      <th
        key={column.key}
        className={column.sortKey ? "sortable" : ""}
        onClick={() => column.sortKey && handleSort(column.sortKey)}
      >
        <div className="th-content">
          {column.label}
          {getSortIcon(column.sortKey)}
        </div>
      </th>
    ))}
  </tr>
</thead>
<tbody>
  {loading ? (
    <tr>
      <td colSpan={visibleColumns.length} className="empty-state">
        <p>Loading...</p>
      </td>
    </tr>
  ) : rows.length === 0 ? (
    <tr>
      <td colSpan={visibleColumns.length} className="empty-state">
        <p>No records found</p>
      </td>
    </tr>
  ) : (
    rows.map((row) => (
      <tr key={row.id} onClick={() => handleRowClick(row)}>
        {visibleColumns.map((column) => (
          <td key={column.key}>{renderCell(row, column.key)}</td>
        ))}
      </tr>
    ))
  )}
</tbody>
```

`renderCell` / `renderCellText` should `switch (key)` over every `COLUMNS[].key`.

## 5. Export (optional)

If the page exports CSV, build headers/rows from `visibleColumns` so the file matches what the user sees:

```tsx
const headers = visibleColumns.map((c) => c.label);
const csvRows = items.map((row) =>
  visibleColumns.map((column) => renderCellText(row, column.key))
);
```

## 6. SCSS

Prefer once in `CustomerMaster.scss` (shared). Until then, copy from
`JobTemplateMaster.scss`:

```scss
.column-chooser {
  position: relative;
}

.column-chooser-menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + 0.375rem);
  right: 0;
  width: 15rem;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
  padding: 0.5rem;
  max-height: 20rem;
  overflow-y: auto;
}

.column-chooser-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4375rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  color: #374151;
  cursor: pointer;
}

.column-chooser-option:hover {
  background: #f3f4f6;
}

.column-chooser-option input {
  width: 15px;
  height: 15px;
  cursor: pointer;
}
```

When promoting styles to `CustomerMaster.scss`, remove the duplicate block from
`JobTemplateMaster.scss` so one definition remains.
