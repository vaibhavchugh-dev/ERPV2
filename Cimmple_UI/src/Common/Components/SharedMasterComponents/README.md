# Shared Master Components

This directory contains reusable components for building master data management pages (like CustomerMaster, VendorMaster, etc.).

## Components

### 1. MasterSlideout
A flexible slideout form component that supports:
- Multiple tabs
- Different field types (text, email, phone, select, textarea, number, custom)
- Field validation
- Conditional field rendering
- Custom field rendering
- Dynamic options for select fields

### 2. MasterListPage
A flexible listing page component that supports:
- Search functionality
- Sorting
- Filtering
- Custom column rendering
- Row click handling
- Empty states

## Usage Examples

### Example 1: Simple VendorMaster using shared components

```typescript
import React, { useState } from 'react';
import MasterListPage, { ColumnConfig } from '../../Common/Components/MasterListPage';
import MasterSlideout, { TabConfig, FormField } from '../../Common/Components/MasterSlideout';
import { VendorService } from '../../Common/Services/VendorService';

const VendorMaster: React.FC = () => {
  const [vendors, setVendors] = useState([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState(0);

  // Define columns
  const columns: ColumnConfig[] = [
    { key: 'vendor_code', label: 'Vendor Code', sortable: true },
    { key: 'vendor_name', label: 'Vendor Name', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { 
      key: 'status', 
      label: 'Status', 
      render: (value) => (
        <span className={`badge ${value === 'Active' ? 'badge-success' : 'badge-danger'}`}>
          {value}
        </span>
      )
    },
  ];

  // Define form tabs
  const tabs: TabConfig[] = [
    {
      id: 'vendor',
      label: 'Vendor Info',
      fields: [
        {
          name: 'vendor_name',
          label: 'Vendor Name',
          type: 'text',
          required: true,
          placeholder: 'Enter vendor name',
        },
        {
          name: 'email',
          label: 'Email',
          type: 'email',
          validation: (value) => {
            if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
              return 'Invalid email format';
            }
            return null;
          },
        },
        {
          name: 'payment_terms',
          label: 'Payment Terms',
          type: 'select',
          options: [
            { value: 'NET30', label: 'Net 30' },
            { value: 'NET60', label: 'Net 60' },
            { value: 'COD', label: 'Cash on Delivery' },
          ],
        },
      ],
    },
  ];

  return (
    <>
      <MasterListPage
        title="Vendor Master"
        subtitle="Manage your vendor database"
        addButtonLabel="Add Vendor"
        columns={columns}
        data={vendors}
        onAdd={() => {
          setSelectedVendorId(0);
          setShowSlideout(true);
        }}
        onRowClick={(vendor) => {
          setSelectedVendorId(vendor.vendor_id);
          setShowSlideout(true);
        }}
        onLoadData={loadVendors}
        searchFields={['vendor_code', 'vendor_name', 'email']}
        filters={[
          {
            label: 'Status',
            options: [
              { value: 'all', label: 'All Vendors' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ],
            value: filterValue,
            onChange: setFilterValue,
          },
        ]}
        getRowId={(row) => row.vendor_id}
      />

      {showSlideout && (
        <MasterSlideout
          title="Vendor"
          tabs={tabs}
          initialData={{
            vendor_name: '',
            email: '',
            payment_terms: 'NET30',
          }}
          entityId={selectedVendorId}
          loadData={VendorService.GetVendorById}
          onSave={async (data) => {
            await VendorService.SaveVendorData(data);
            setShowSlideout(false);
            loadVendors();
          }}
          onClose={() => setShowSlideout(false)}
        />
      )}
    </>
  );
};
```

### Example 2: CustomerMaster with custom fields (contacts table)

```typescript
// For complex fields like contacts table, use customContent
const tabs: TabConfig[] = [
  {
    id: 'contacts',
    label: 'Contacts',
    customContent: (formData, handleInputChange) => (
      <ContactsTable
        contacts={formData.contacts}
        onChange={(contacts) => handleInputChange('contacts', contacts)}
      />
    ),
  },
];
```

## Benefits

1. **Consistency**: All master pages look and behave the same
2. **Maintainability**: Fix bugs or update styling in one place
3. **Flexibility**: Each module can have different fields while using the same component
4. **Speed**: Build new master pages quickly by just configuring fields

## Field Types Supported

- `text`: Standard text input
- `email`: Email input with validation
- `phone`: Phone number input
- `select`: Dropdown select
- `textarea`: Multi-line text input
- `number`: Numeric input
- `custom`: Custom render function

## Features

- ✅ Field validation
- ✅ Conditional field rendering
- ✅ Dynamic select options
- ✅ Custom field rendering
- ✅ Tabbed forms
- ✅ Search and filter
- ✅ Sorting
- ✅ Responsive design
- ✅ Loading states
- ✅ Error handling






