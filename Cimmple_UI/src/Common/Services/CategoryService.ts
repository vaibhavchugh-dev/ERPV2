import Instense from "./Axios-config";

export interface CategoryValue {
  id: number;
  categoryTypeId: number;
  categoryTypeName: string;
  code: string;
  name: string;
  description: string;
  displayOrder: number;
  isSystem: boolean;
  isActive: boolean;
  usageCount?: number;
}

export interface CategoryType {
  id: number;
  code: string;
  name: string;
  description: string;
  displayOrder: number;
  allowUserValues: boolean;
  isSystem: boolean;
  isActive: boolean;
  values: CategoryValue[];
}

export interface CategoryTypeReq {
  Id: number;
  Tenantid: number;
  Name: string;
  Code: string;
  Description: string;
  DisplayOrder: number;
  AllowUserValues: boolean;
  IsActive: boolean;
}

export interface CategoryValueReq {
  Id: number;
  Tenantid: number;
  CategoryTypeId: number;
  Name: string;
  Code: string;
  Description: string;
  DisplayOrder: number;
  IsActive: boolean;
}

const resolveTenantId = (): number => {
  const storage = JSON.parse(localStorage.getItem("storage") || "{}");
  let tenantID = storage?.tenantID || 0;
  if (tenantID === 0 && process.env.NODE_ENV === "development") {
    tenantID = 1;
  }
  return tenantID;
};

export class CategoryService {
  public static GetCategoryTypes = async (
    includeValues: boolean = true
  ): Promise<CategoryType[]> => {
    const tenantID = resolveTenantId();

    const url = `/Category/GetCategoryTypes`;
    return Instense.get(url, {
      params: { tenantid: tenantID, includeValues },
    }).then((response) => {
      const result = response.data.result as CategoryType[];
      return result || [];
    });
  };

  /** Provisions the starter set of category types for a tenant that has none yet. */
  public static EnsureDefaultCategoryTypes = async (): Promise<{
    typesCreated: number;
    valuesCreated: number;
  }> => {
    const tenantID = resolveTenantId();

    const url = `/Category/EnsureDefaultCategoryTypes`;
    return Instense.post(url, { Tenantid: tenantID }).then((response) => {
      const raw = response.data.result || {};
      return {
        typesCreated: raw.typesCreated ?? 0,
        valuesCreated: raw.valuesCreated ?? 0,
      };
    });
  };

  public static SaveCategoryType = async (
    request: CategoryTypeReq
  ): Promise<any> => {
    request.Tenantid = resolveTenantId();

    const url = `/Category/SaveCategoryType`;
    return Instense.post(url, request).then((response) => response.data.result);
  };

  public static DeleteCategoryType = async (
    categoryTypeId: number
  ): Promise<any> => {
    const tenantID = resolveTenantId();

    const url = `/Category/DeleteCategoryType`;
    return Instense.delete(url, {
      params: { categoryTypeId, tenantId: tenantID },
    }).then((response) => response.data.result);
  };

  public static GetCategoryValues = async (
    categoryTypeId?: number,
    search?: string
  ): Promise<CategoryValue[]> => {
    const tenantID = resolveTenantId();

    const url = `/Category/GetCategoryValues`;
    return Instense.get(url, {
      params: { tenantid: tenantID, categoryTypeId, search },
    }).then((response) => {
      const result = response.data.result as CategoryValue[];
      return result || [];
    });
  };

  public static SaveCategoryValue = async (
    request: CategoryValueReq
  ): Promise<{ id: number; existed: boolean }> => {
    request.Tenantid = resolveTenantId();

    const url = `/Category/SaveCategoryValue`;
    return Instense.post(url, request).then((response) => {
      const raw = response.data.result || {};
      return { id: raw.id ?? 0, existed: raw.existed ?? false };
    });
  };

  public static DeleteCategoryValue = async (
    categoryValueId: number
  ): Promise<any> => {
    const tenantID = resolveTenantId();

    const url = `/Category/DeleteCategoryValue`;
    return Instense.delete(url, {
      params: { categoryValueId, tenantId: tenantID },
    }).then((response) => response.data.result);
  };
}

export {};
