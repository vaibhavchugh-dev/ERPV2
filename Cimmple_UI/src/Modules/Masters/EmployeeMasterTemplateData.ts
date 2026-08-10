export interface EmployeeTemplateRow {
  empCode: string;
  firstName: string;
  lastName: string;
  email: string;
  userName: string;
  roleName: string;
  employeeType: string;
  phone1: string;
  phone2: string;
  dateOfHire: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  locationName: string;
  dob: string;
  ssn: string;
}

/**
 * Sample rows for Employee Master CSV import.
 * RoleName / LocationName resolve when those masters already have matching names;
 * unmatched values import with a soft warning and leave the FK blank.
 */
export const EMPLOYEE_TEMPLATE_ROWS: EmployeeTemplateRow[] = [
  {
    empCode: "E1001",
    firstName: "Chris",
    lastName: "Patel",
    email: "chris.patel@example.com",
    userName: "chris.patel",
    roleName: "",
    employeeType: "Regular",
    phone1: "555-2100",
    phone2: "",
    dateOfHire: "2024-01-15",
    address: "12 Oak Street",
    city: "Ann Arbor",
    state: "MI",
    zip: "48104",
    locationName: "",
    dob: "",
    ssn: "",
  },
  {
    empCode: "E1002",
    firstName: "Taylor",
    lastName: "Brooks",
    email: "taylor.brooks@example.com",
    userName: "taylor.brooks",
    roleName: "",
    employeeType: "Contractor",
    phone1: "555-2200",
    phone2: "",
    dateOfHire: "2024-06-01",
    address: "45 Maple Ave",
    city: "Toledo",
    state: "OH",
    zip: "43604",
    locationName: "",
    dob: "",
    ssn: "",
  },
];
