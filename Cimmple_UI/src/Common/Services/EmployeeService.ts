import Instense from "./Axios-config";

export interface EmployeeMaster {
  user_UniqueID: number;
  firstName: string;
  lastName: string;
  email: string;
  userName: string;
  status: string;
  role?: number;
  roleName: string;
  employeeType: string;
  empCode: string;
  phone1: string;
  date_of_hire: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

export interface EmployeeMasterReq {
  User_UniqueID: number;
  FirstName: string;
  LastName: string;
  Email: string;
  UserName: string;
  Status: string;
  Role?: number;
  EmployeeType: string;
  EmployeeCategory: string;
  EmpCode: string;
  Department: string;
  Phone1: string;
  Phone2: string;
  Date_of_hire: string;
  Address: string;
  Apartment: string;
  City: string;
  State: string;
  Zip: string;
  Country: string;
  LocationId?: number;
  TenantID: number;
  DOB: string;
  SSN: string;
}

export interface Role {
  roleID: number;
  roleName: string;
}

export class EmployeeService {
  public static GetEmployees = async (
    request: { tenantid: number }
  ): Promise<EmployeeMaster[] | null> => {
    // Use the tenantid from request if provided, otherwise fall back to localStorage
    let tenantID = request.tenantid || 0;
    
    // If still 0, try localStorage
    if (tenantID === 0) {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      tenantID = storage?.tenantID || 0;
    }
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Employee/GetEmployees`;
    return Instense.get(url, {
      params: { tenantid: tenantID },
    }).then((response) => {
      const result = response.data.result as EmployeeMaster[];
      return result;
    });
  };

  public static GetEmployeeById = async (
    employeeId: number
  ): Promise<EmployeeMasterReq | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Employee/GetEmployeeById`;
    return Instense.get(url, {
      params: { employeeId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result as any;
      return {
        User_UniqueID: result.user_UniqueID,
        FirstName: result.firstName,
        LastName: result.lastName,
        Email: result.email,
        UserName: result.userName,
        Status: result.status,
        Role: result.role,
        EmployeeType: result.employeeType,
        EmployeeCategory: result.employeeCategory || "",
        EmpCode: result.empCode,
        Department: result.department || "",
        Phone1: result.phone1,
        Phone2: result.phone2 || "",
        Date_of_hire: result.date_of_hire,
        Address: result.address,
        Apartment: result.apartment || "",
        City: result.city,
        State: result.state,
        Zip: result.zip,
        Country: result.country || "US",
        LocationId: result.locationId,
        TenantID: result.tenantID,
        DOB: result.dob || "",
        SSN: result.ssn || "",
      } as EmployeeMasterReq;
    });
  };

  public static SaveEmployee = async (
    request: EmployeeMasterReq
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    request.TenantID = tenantID;

    const url = `/Employee/SaveEmployee`;
    return Instense.post(url, request).then((response) => {
      const result = response.data.result;
      return result;
    });
  };

  public static SaveEmployeeData = async (
    request: EmployeeMasterReq,
    file?: File | null
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1;
    }
    request.TenantID = tenantID;

    const url = `/Employee/SaveEmployeeData`;
    const formData = new FormData();
    if (file) {
      formData.append("file", file);
    } else {
      formData.append("file", new File([], "", { type: "application/octet-stream" }));
    }
    formData.append("formField", JSON.stringify(request));

    return Instense.post(url, formData).then((response) => {
      return response.data.result;
    });
  };

  public static GetProfilePic = async (
    request: { userId: number; tenantId?: number }
  ): Promise<Blob | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = request.tenantId || storage?.tenantID || 0;
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1;
    }

    const url = `/Employee/GetProfilePic`;
    return Instense.get(url, {
      params: { userId: request.userId, tenantId: tenantID },
      responseType: "blob",
    }).then((response) => {
      return response.data;
    }).catch(() => null);
  };

  public static GetAllRoles = async (
    request: { tenantid: number }
  ): Promise<Role[] | null> => {
    // Use the tenantid from request if provided, otherwise fall back to localStorage
    let tenantID = request.tenantid || 0;
    
    // If still 0, try localStorage
    if (tenantID === 0) {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      tenantID = storage?.tenantID || 0;
    }
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Employee/GetAllRoles`;
    return Instense.get(url, {
      params: { tenantid: tenantID },
    }).then((response) => {
      const result = response.data.result as Role[];
      return result;
    });
  };

  public static CheckEmployeeDeletionImpact = async (
    employeeId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Employee/CheckEmployeeDeletionImpact`;
    return Instense.get(url, {
      params: { employeeId, tenantId: tenantID },
    }).then((response) => {
      return response.data;
    });
  };

  public static DeleteEmployee = async (
    employeeId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Employee/DeleteEmployee`;
    return Instense.delete(url, {
      params: { employeeId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };
}

export {};

