# Cimmple ERP Application

Complete ERP application built with React + TypeScript frontend and C#/.NET Core backend.

## Tech Stack

### Frontend
- React 18.2.0
- TypeScript 4.9.4
- Redux for state management
- React Router for routing
- Bootstrap 5.3.3 for UI
- React Bootstrap Table for data tables
- Axios for API calls

### Backend
- .NET 7.0
- Entity Framework Core 6.0
- SQL Server Database
- JWT Authentication
- Swagger/OpenAPI

## Getting Started

### Frontend Setup
```bash
cd Cimmple_UI
npm install
npm start
```

### Backend Setup
```bash
cd Cimmple_API
dotnet restore
dotnet run
```

## Project Structure

```
Cimmple_UI/
├── src/
│   ├── Common/          # Shared components, services, utilities
│   ├── Modules/         # Feature modules
│   ├── Redux/           # State management
│   ├── Login/           # Authentication
│   └── App.tsx          # Main app component

Cimmple_API/
├── Controllers/          # API controllers
├── Data/
│   ├── Models/          # Entity models
│   ├── Repositories/    # Data access layer
│   └── Dtos/            # Data transfer objects
└── Utilities/           # Helper classes
```

## Modules

### Masters
- Customer Master
- Vendor Master
- Product Master
- Bank Master
- COA Master
- Location Master
- Workstation Master
- NCR Code Master
- Process Master
- Document Master

### Purchasing
- Vendor Order
- Vendor Receiving
- Vendor Quotations
- Invoice Approval
- Invoice List
- Invoice Payment
- Vendor Inbox

### Accounts
- Receivable
- Invoice
- Journal
- Reconcile
- Register
- Accounting Period
- Bank Sync

### Job Management
- Job Order
- Tracker
- NCR

### Other Modules
- Customer Orders
- Quotations
- Reports
- Dashboard
- User Management
- Settings
- Labor Timesheets
- Import Payroll







