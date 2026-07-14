import Instense from "./Axios-config";

/** Matches API LocationKind — single-table hierarchy under Locations. */
export const LOCATION_KIND = {
  BusinessSite: 1,
  Warehouse: 2,
  Zone: 3,
  Shelf: 4,
  Bin: 5,
} as const;

export const LOCATION_KIND_LABEL: Record<number, string> = {
  1: "Business site",
  2: "Warehouse / storeroom",
  3: "Zone / rack / aisle",
  4: "Shelf / level",
  5: "Bin / slot",
};

export interface LocationMaster {
  locationId: number;
  code: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  region: string;
  email: string;
  phone: string;
  webaddress: string;
  status: string;
  parentLocationId?: number | null;
  parentName?: string | null;
  locType?: number;
  locTypeName?: string;
  displayPath?: string;
}

export interface LocationMasterReq {
  LocationId: number;
  Code: string;
  Name: string;
  Address: string;
  Apartment: string;
  City: string;
  State: string;
  Zip: string;
  Country: string;
  Region: string;
  Email: string;
  Phone: string;
  WebAddress: string;
  Status: string;
  TenantId: number;
  LogoUrl?: string | null;
  /** Omit or null for a new business site; set to parent row id for warehouse / bin chain. */
  ParentLocationId?: number | null;
  /** LOCATION_KIND; for new child rows, 0 means let API default to parent + 1. */
  LocType?: number;
  /** Read-only from API when editing (not sent on save). */
  ParentName?: string;
  DisplayPath?: string;
}

export class LocationService {
  public static GetLocations = async (
    request: { tenantid: number }
  ): Promise<LocationMaster[] | null> => {
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

    const url = `/Location/GetLocations`;
    return Instense.get(url, {
      params: { tenantid: tenantID },
    }).then((response) => {
      const result = response.data.result as LocationMaster[];
      return result;
    });
  };

  public static GetLocationById = async (
    locationId: number
  ): Promise<LocationMasterReq | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Location/GetLocationById`;
    return Instense.get(url, {
      params: { locationId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result as any;
      return {
        LocationId: result.locationId,
        Code: result.code || "",
        Name: result.name || "",
        Address: result.address || "",
        Apartment: result.apartment || "",
        City: result.city || "",
        State: result.state || "",
        Zip: result.zip || "",
        Country: result.country || "US",
        Region: result.region || "",
        Email: result.email || "",
        Phone: result.phone || "",
        WebAddress: result.webaddress || "",
        Status: result.status || "Active",
        TenantId: tenantID,
        LogoUrl: result.logoUrl || null,
        ParentLocationId: result.parentLocationId ?? null,
        LocType: result.locType ?? LOCATION_KIND.BusinessSite,
        ParentName: result.parentName ?? "",
        DisplayPath: result.displayPath ?? "",
      } as LocationMasterReq & { LogoUrl?: string | null };
    });
  };

  public static SaveLocation = async (
    request: LocationMasterReq
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    request.TenantId = tenantID;

    const url = `/Location/SaveLocation`;
    return Instense.post(url, request).then((response) => {
      const result = response.data.result;
      return result;
    });
  };

  public static UploadLogo = async (
    locationId: number,
    file: File
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const formData = new FormData();
    formData.append("locationId", locationId.toString());
    formData.append("tenantId", tenantID.toString());
    formData.append("file", file);

    const url = `/Location/UploadLogo`;
    console.log("Uploading logo to:", url, "locationId:", locationId, "tenantId:", tenantID);
    
    // Don't set Content-Type header - let axios set it automatically with boundary
    return Instense.post(url, formData, {
      headers: {
        // Remove Content-Type to let axios set it with boundary
      },
      transformRequest: [(data) => data], // Prevent axios from transforming FormData
    }).then((response) => {
      const result = response.data.result;
      return result;
    }).catch((error) => {
      console.error("UploadLogo error:", {
        url: error.config?.url,
        baseURL: error.config?.baseURL,
        fullURL: `${error.config?.baseURL}${error.config?.url}`,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
      throw error;
    });
  };

  public static DeleteLogo = async (locationId: number): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Location/DeleteLogo`;
    return Instense.delete(url, {
      params: { locationId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };

  public static CheckLocationDeletionImpact = async (
    locationId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Location/CheckLocationDeletionImpact`;
    return Instense.get(url, {
      params: { locationId, tenantId: tenantID },
    }).then((response) => {
      return response.data;
    });
  };

  public static DeleteLocation = async (
    locationId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/Location/DeleteLocation`;
    return Instense.delete(url, {
      params: { locationId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result;
      return result;
    });
  };
}

export {};

