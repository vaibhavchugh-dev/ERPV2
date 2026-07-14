import React from "react";
import { FormField } from "./MasterSlideout";
import { validateEmail, validatePhone, validateZipCode } from "../../Utils/validation";

// US States list (sorted alphabetically)
export const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" }, { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" }, { code: "CO", name: "Colorado" }, { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" }, { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" }, { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" }, { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
].sort((a, b) => a.name.localeCompare(b.name));

// Countries list (sorted alphabetically, with US first as default)
const COUNTRIES_UNSORTED = [
  { code: "US", name: "United States" }, { code: "CA", name: "Canada" }, { code: "MX", name: "Mexico" }, { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" }, { code: "DE", name: "Germany" }, { code: "FR", name: "France" }, { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" }, { code: "NL", name: "Netherlands" }, { code: "BE", name: "Belgium" }, { code: "CH", name: "Switzerland" },
  { code: "AT", name: "Austria" }, { code: "SE", name: "Sweden" }, { code: "NO", name: "Norway" }, { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" }, { code: "PL", name: "Poland" }, { code: "IE", name: "Ireland" }, { code: "PT", name: "Portugal" },
  { code: "GR", name: "Greece" }, { code: "CZ", name: "Czech Republic" }, { code: "HU", name: "Hungary" }, { code: "RO", name: "Romania" },
  { code: "BG", name: "Bulgaria" }, { code: "HR", name: "Croatia" }, { code: "SK", name: "Slovakia" }, { code: "SI", name: "Slovenia" },
  { code: "LT", name: "Lithuania" }, { code: "LV", name: "Latvia" }, { code: "EE", name: "Estonia" }, { code: "JP", name: "Japan" },
  { code: "CN", name: "China" }, { code: "IN", name: "India" }, { code: "KR", name: "South Korea" }, { code: "SG", name: "Singapore" },
  { code: "HK", name: "Hong Kong" }, { code: "TW", name: "Taiwan" }, { code: "TH", name: "Thailand" }, { code: "MY", name: "Malaysia" },
  { code: "ID", name: "Indonesia" }, { code: "PH", name: "Philippines" }, { code: "VN", name: "Vietnam" }, { code: "NZ", name: "New Zealand" },
  { code: "ZA", name: "South Africa" }, { code: "BR", name: "Brazil" }, { code: "AR", name: "Argentina" }, { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" }, { code: "PE", name: "Peru" }, { code: "AE", name: "United Arab Emirates" }, { code: "SA", name: "Saudi Arabia" },
  { code: "IL", name: "Israel" }, { code: "TR", name: "Turkey" }, { code: "EG", name: "Egypt" }, { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" }, { code: "RU", name: "Russia" }, { code: "UA", name: "Ukraine" },
];

export const COUNTRIES = [
  COUNTRIES_UNSORTED.find(c => c.code === "US")!,
  ...COUNTRIES_UNSORTED.filter(c => c.code !== "US").sort((a, b) => a.name.localeCompare(b.name))
];

// Common Icons
export const Icons = {
  Building: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
      <polyline points="9 22 9 12 15 12 15 22"></polyline>
    </svg>
  ),
  Document: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
    </svg>
  ),
  Mail: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
      <polyline points="22,6 12,13 2,6"></polyline>
    </svg>
  ),
  Phone: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
    </svg>
  ),
  Location: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
      <circle cx="12" cy="10" r="3"></circle>
    </svg>
  ),
  Activity: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
    </svg>
  ),
};

// Shared Field Factory Functions
export const createCompanyNameField = (name: string = "company_name", required: boolean = true): FormField => ({
  name,
  label: "Company Name",
  type: "text",
  required,
  placeholder: "Enter company name",
  icon: Icons.Building,
  validation: (value) => {
    if (required && (!value || value.trim() === "")) {
      return "Company Name is required";
    }
    return null;
  },
});

export const createCompanyAliasField = (name: string = "companyAlias"): FormField => ({
  name,
  label: "Company Alias",
  type: "text",
  placeholder: "Enter company alias",
  icon: Icons.Document,
});

export const createEmailField = (name: string = "email"): FormField => ({
  name,
  label: "Email",
  type: "email",
  placeholder: "Enter email",
  icon: Icons.Mail,
  validation: (value) => {
    if (value && !validateEmail(value)) {
      return validateEmail(value);
    }
    return null;
  },
});

export const createPhoneField = (name: string = "phone_number"): FormField => ({
  name,
  label: "Phone Number",
  type: "phone",
  placeholder: "(555) 123-4567",
  icon: Icons.Phone,
  validation: (value) => {
    if (value && !validatePhone(value)) {
      return validatePhone(value);
    }
    return null;
  },
});

export const createStreetAddressField = (name: string = "address", label: string = "Street Address"): FormField => ({
  name,
  label,
  type: "text",
  placeholder: "Enter street address",
  icon: Icons.Location,
});

export const createApartmentField = (name: string = "apartment", label: string = "Unit/Suite"): FormField => ({
  name,
  label,
  type: "text",
  placeholder: "Apt, Suite, etc.",
  icon: Icons.Building,
});

export const createCityField = (name: string = "City", label: string = "City"): FormField => ({
  name,
  label,
  type: "text",
  placeholder: "Enter city",
  icon: Icons.Location,
});

export const createStateField = (
  name: string = "states",
  countryField: string = "country",
  label: string = "State"
): FormField => ({
  name,
  label,
  type: "select",
  showWhen: (formData) => formData[countryField] === "US",
  getOptions: (formData) => {
    if (formData[countryField] === "US") {
      return US_STATES.map(state => ({ value: state.code, label: state.name }));
    }
    return [];
  },
  icon: Icons.Location,
});

export const createStateInputField = (
  name: string = "states",
  countryField: string = "country",
  label: string = "State"
): FormField => ({
  name,
  label,
  type: "text",
  showWhen: (formData) => formData[countryField] !== "US",
  placeholder: "Enter state",
  icon: Icons.Location,
});

export const createZipField = (name: string = "zip", label: string = "Zip Code"): FormField => ({
  name,
  label,
  type: "text",
  placeholder: "Enter zip code",
  icon: Icons.Location,
  validation: (value) => {
    if (value && !validateZipCode(value)) {
      return validateZipCode(value);
    }
    return null;
  },
});

export const createCountryField = (name: string = "country", label: string = "Country"): FormField => ({
  name,
  label,
  type: "select",
  options: COUNTRIES.map(country => ({ value: country.code, label: country.name })),
  icon: Icons.Location,
});

// Chart of Accounts field - Text input version (for Bank Master - 4 character code)
export const createCOATextField = (name: string = "coa", label: string = "Chart of Accounts", required: boolean = true): FormField => ({
  name,
  label,
  type: "text",
  required,
  placeholder: "Enter COA (4 characters)",
  icon: Icons.Document,
  validation: (value) => {
    if (required && (!value || value.trim() === "")) {
      return "Chart of Accounts is required";
    }
    if (value && value.length !== 4) {
      return "COA must be exactly 4 characters";
    }
    return null;
  },
});

// Chart of Accounts field - Dropdown version (for Vendor Master - from API)
// Note: This function expects COA options to be loaded separately and passed in
// The options should be loaded in the component's useEffect and passed to this function
export const createCOADropdownField = (
  name: string = "coaAccountId",
  label: string = "Chart of Accounts",
  coaOptions: Array<{ AccountID: number; AccountCode: string; AccountName: string }> = [],
  required: boolean = false
): FormField => ({
  name,
  label,
  type: "select",
  required,
  icon: Icons.Document,
  options: coaOptions.map(coa => ({
    value: coa.AccountID.toString(),
    label: `${coa.AccountCode} - ${coa.AccountName}`
  })),
});

// Address field group (for billing/shipping)
export const createAddressFields = (
  prefix: string = "",
  labelPrefix: string = ""
): FormField[] => {
  const streetName = prefix ? `${prefix}Address` : "address";
  const apartmentName = prefix ? `${prefix}Apartment` : "apartment";
  const cityName = prefix ? `${prefix}City` : "City";
  const stateName = prefix ? `${prefix}States` : "states";
  const zipName = prefix ? `${prefix}ZipCode` : "zip";
  const countryName = prefix ? `${prefix}Country` : "country";

  const streetLabel = labelPrefix ? `${labelPrefix} Street Address` : "Street Address";
  const cityLabel = labelPrefix ? `${labelPrefix} City` : "City";
  const stateLabel = labelPrefix ? `${labelPrefix} State` : "State";
  const zipLabel = labelPrefix ? `${labelPrefix} Zip Code` : "Zip Code";
  const countryLabel = labelPrefix ? `${labelPrefix} Country` : "Country";

  return [
    createStreetAddressField(streetName, streetLabel),
    createApartmentField(apartmentName, labelPrefix ? `${labelPrefix} Unit/Suite` : "Unit/Suite"),
    createCityField(cityName, cityLabel),
    createStateField(stateName, countryName, stateLabel),
    createStateInputField(stateName, countryName, stateLabel),
    createZipField(zipName, zipLabel),
    createCountryField(countryName, countryLabel),
  ];
};

