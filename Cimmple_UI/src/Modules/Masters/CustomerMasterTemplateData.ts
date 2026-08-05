export interface CustomerTemplateRow {
  code: string;
  companyName: string;
  companyAlias: string;
  email: string;
  phone: string;
  address: string;
  apartment: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  shippingAddress: string;
  shippingApartment: string;
  shippingCity: string;
  shippingState: string;
  shippingZip: string;
  shippingCountry: string;
  contactTitle: string;
  contactFirstName: string;
  contactLastName: string;
  contactPhone: string;
  contactEmail: string;
}

/** Sample rows for the Customer Master CSV import template. */
export const CUSTOMER_TEMPLATE_ROWS: CustomerTemplateRow[] = [
  {
    code: "",
    companyName: "Acme Manufacturing LLC",
    companyAlias: "Acme",
    email: "orders@acmemfg.example",
    phone: "555-0100",
    address: "100 Industrial Parkway",
    apartment: "Suite 200",
    city: "Detroit",
    state: "MI",
    zip: "48201",
    country: "US",
    shippingAddress: "100 Industrial Parkway",
    shippingApartment: "Dock B",
    shippingCity: "Detroit",
    shippingState: "MI",
    shippingZip: "48201",
    shippingCountry: "US",
    contactTitle: "Purchasing Manager",
    contactFirstName: "Jane",
    contactLastName: "Smith",
    contactPhone: "555-0101",
    contactEmail: "jane.smith@acmemfg.example",
  },
  {
    code: "",
    companyName: "Precision Parts Co",
    companyAlias: "PPC",
    email: "info@precisionparts.example",
    phone: "555-0200",
    address: "450 Commerce Blvd",
    apartment: "",
    city: "Cleveland",
    state: "OH",
    zip: "44114",
    country: "US",
    shippingAddress: "450 Commerce Blvd",
    shippingApartment: "",
    shippingCity: "Cleveland",
    shippingState: "OH",
    shippingZip: "44114",
    shippingCountry: "US",
    contactTitle: "Buyer",
    contactFirstName: "Mark",
    contactLastName: "Johnson",
    contactPhone: "555-0201",
    contactEmail: "mark.johnson@precisionparts.example",
  },
];
