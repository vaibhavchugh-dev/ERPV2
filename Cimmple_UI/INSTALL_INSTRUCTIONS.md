# Installation Instructions

## Dependency Conflict Resolution

The `react-bootstrap-table-next` package requires React 16, but we're using React 18. This is resolved using npm overrides.

## Installation Steps

### Option 1: Using npm overrides (Recommended)
The `package.json` has been updated with overrides to handle the conflict:

```bash
cd C:\Narinder\Cimmple\CursorERP\Cimmple_UI
npm install
```

### Option 2: Using --legacy-peer-deps flag
If Option 1 doesn't work, use:

```bash
cd C:\Narinder\Cimmple\CursorERP\Cimmple_UI
npm install --legacy-peer-deps
```

### Option 3: Using --force flag
As a last resort:

```bash
cd C:\Narinder\Cimmple\CursorERP\Cimmple_UI
npm install --force
```

## After Installation

Once installation completes successfully:

```bash
npm start
```

The application will open at `http://localhost:3000`

## Note

The `react-bootstrap-table-next` library will work with React 18 despite the peer dependency warning. The overrides ensure npm uses React 18 for all packages.







