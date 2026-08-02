export interface VendorTemplateRow {
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
  term: string;
  shipVia: string;
  contactTitle: string;
  contactFirstName: string;
  contactLastName: string;
  contactPhone: string;
  contactEmail: string;
}

/** Sample rows for the Vendor Master CSV import template. */
export const VENDOR_TEMPLATE_ROWS: VendorTemplateRow[] = [
  {
    code: "",
    companyName: "Midwest Tool Supply",
    companyAlias: "MTS",
    email: "orders@midwesttool.example",
    phone: "555-1100",
    address: "220 Supply Drive",
    apartment: "",
    city: "Chicago",
    state: "IL",
    zip: "60601",
    country: "US",
    shippingAddress: "220 Supply Drive",
    shippingApartment: "Receiving",
    shippingCity: "Chicago",
    shippingState: "IL",
    shippingZip: "60601",
    shippingCountry: "US",
    term: "Net 30",
    shipVia: "UPS Ground",
    contactTitle: "Account Manager",
    contactFirstName: "Alex",
    contactLastName: "Rivera",
    contactPhone: "555-1101",
    contactEmail: "alex.rivera@midwesttool.example",
  },
  {
    code: "",
    companyName: "Summit Fasteners Inc",
    companyAlias: "Summit",
    email: "sales@summitfast.example",
    phone: "555-1200",
    address: "88 Industrial Way",
    apartment: "Bldg 3",
    city: "Milwaukee",
    state: "WI",
    zip: "53202",
    country: "US",
    shippingAddress: "88 Industrial Way",
    shippingApartment: "Bldg 3",
    shippingCity: "Milwaukee",
    shippingState: "WI",
    shippingZip: "53202",
    shippingCountry: "US",
    term: "Net 15",
    shipVia: "FedEx",
    contactTitle: "Sales Rep",
    contactFirstName: "Sam",
    contactLastName: "Nguyen",
    contactPhone: "555-1201",
    contactEmail: "sam.nguyen@summitfast.example",
  },
];
