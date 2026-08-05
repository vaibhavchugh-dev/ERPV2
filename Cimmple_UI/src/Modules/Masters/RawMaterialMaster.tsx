import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import ColumnChooser from "../../Common/Components/ColumnChooser";
import { ColumnDefinition, useColumnChooser } from "../../Common/Hooks/useColumnChooser";
import {
  InventoryService,
  RawMaterial,
  getTenantId,
} from "../../Common/Services/InventoryService";
import { LocationService, LocationMaster } from "../../Common/Services/LocationService";
import { VendorService, VendorMaster } from "../../Common/Services/VendorService";
import {
  CUSTOM_UOM_SELECT_VALUE,
  STANDARD_MATERIAL_GRADES,
  STANDARD_STOCK_FORMS,
  STANDARD_UOM_CODES,
  canonicalUomCode,
  isCustomUom,
  picklistSelectValue,
  normalizeUnitForSave,
} from "../../Common/Constants/unitsOfMeasure";
import "./CustomerMaster.scss";
import "./RawMaterialMaster.scss";
import "../Inventory/Inventory.scss";

function unitSelectValue(unit: string): string {
  const c = canonicalUomCode(unit);
  return c ?? CUSTOM_UOM_SELECT_VALUE;
}

type RawMaterialForm = {
  id?: number;
  partNo: string;
  partName: string;
  sku: string;
  description: string;
  unit: string;
  unitCost: string;
  vendorId: string;
  reorderPoint: string;
  reorderQuantity: string;
  warehouseLocation: string;
  bin: string;
  box: string;
  materialGrade: string;
  specification: string;
  stockForm: string;
  thicknessMm: string;
  widthMm: string;
  lengthMm: string;
  isRemnant: boolean;
  parentRawMaterialId: string;
  defaultLocationId: string;
};

const emptyForm = (): RawMaterialForm => ({
  partNo: "",
  partName: "",
  sku: "",
  description: "",
  unit: "EA",
  unitCost: "0",
  vendorId: "",
  reorderPoint: "",
  reorderQuantity: "",
  warehouseLocation: "",
  bin: "",
  box: "",
  materialGrade: "",
  specification: "",
  stockForm: "",
  thicknessMm: "",
  widthMm: "",
  lengthMm: "",
  isRemnant: false,
  parentRawMaterialId: "",
  defaultLocationId: "",
});

function formatStorage(m: RawMaterial): string {
  const parts = [
    m.warehouseLocation,
    m.bin ? `Bin ${m.bin}` : "",
    m.box ? `Box ${m.box}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

const COLUMNS: ColumnDefinition[] = [
  { key: "partNo", label: "Part #", locked: true },
  { key: "partName", label: "Part Name", locked: true },
  { key: "status", label: "Status" },
  { key: "vendorName", label: "Vendor" },
  { key: "sku", label: "SKU" },
  { key: "storage", label: "Storage" },
  { key: "defaultLocationName", label: "Loc (master)" },
  { key: "stockForm", label: "Form" },
  { key: "materialGrade", label: "Grade" },
  { key: "dims", label: "Dims (mm)" },
  { key: "isRemnant", label: "Remnant" },
  { key: "unit", label: "Unit" },
  { key: "unitCost", label: "Cost" },
  { key: "description", label: "Description" },
  { key: "action", label: "Action", locked: true },
];

const DEFAULT_HIDDEN_COLUMNS = [
  "sku",
  "storage",
  "defaultLocationName",
  "dims",
  "description",
];
const COLUMN_PREFERENCE_KEY = "rawMaterialMaster.hiddenColumns";

const RawMaterialMaster: React.FC = () => {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [vendors, setVendors] = useState<VendorMaster[]>([]);
  const [locations, setLocations] = useState<LocationMaster[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [isMaterialGradeOther, setIsMaterialGradeOther] = useState(false);
  const [isStockFormOther, setIsStockFormOther] = useState(false);
  const [form, setForm] = useState<RawMaterialForm>(emptyForm);

  const {
    hiddenColumns,
    visibleColumns,
    showColumnChooser,
    setShowColumnChooser,
    columnChooserRef,
    toggleColumn,
  } = useColumnChooser(COLUMN_PREFERENCE_KEY, COLUMNS, DEFAULT_HIDDEN_COLUMNS);

  const loadLocations = async () => {
    const tid = getTenantId();
    try {
      const result = await LocationService.GetLocations({ tenantid: tid });
      setLocations(Array.isArray(result) ? result : []);
    } catch {
      setLocations([]);
    }
  };

  const loadVendors = async () => {
    const tid = getTenantId();
    try {
      const result = await VendorService.GetVendorlist({ tenantid: tid });
      setVendors(Array.isArray(result) ? result : []);
    } catch {
      setVendors([]);
    }
  };

  const sortedVendors = useMemo(() => {
    return [...vendors].sort((a, b) =>
      (a.company_name || "").localeCompare(b.company_name || "", undefined, {
        sensitivity: "base",
      })
    );
  }, [vendors]);

  useEffect(() => {
    loadMaterials(showInactive);
  }, [showInactive]);

  useEffect(() => {
    loadLocations();
    loadVendors();
  }, []);

  const loadMaterials = async (includeInactive = showInactive) => {
    setLoading(true);
    try {
      const result = await InventoryService.GetRawMaterials({ includeInactive });
      setMaterials(Array.isArray(result) ? result : []);
    } catch (error: any) {
      toast.error(
        `Error loading raw materials: ${error.message || "Unknown error"}`
      );
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (material: RawMaterial) => {
    const next = !(material.isActive ?? true);
    const verb = next ? "activate" : "deactivate";
    const label = material.partNo || material.partName || `#${material.id}`;
    if (!window.confirm(`Do you want to ${verb} raw material ${label}?`)) {
      return;
    }
    try {
      const result = await InventoryService.SetRawMaterialStatus({
        id: material.id,
        isActive: next,
      });
      if (result) {
        toast.success(next ? "Raw material activated" : "Raw material deactivated");
      }
      await loadMaterials(showInactive);
    } catch (error: any) {
      const message =
        error?.response?.data?.error || error.message || `Could not ${verb} raw material`;
      toast.error(message);
    }
  };

  const resetForm = () => {
    setForm(emptyForm());
    setFormError("");
    setIsMaterialGradeOther(false);
    setIsStockFormOther(false);
    setShowForm(false);
  };

  const handleEdit = (material: RawMaterial) => {
    const materialGrade = material.materialGrade || "";
    const stockForm = material.stockForm || "";
    setForm({
      id: material.id,
      partNo: material.partNo || "",
      partName: material.partName || "",
      sku: material.sku || "",
      description: material.description || "",
      unit:
        canonicalUomCode(material.unit || "") ??
        ((material.unit || "").trim() || "EA"),
      unitCost: String(material.unitCost ?? 0),
      vendorId:
        material.vendorId != null ? String(material.vendorId) : "",
      reorderPoint:
        material.reorderPoint == null ? "" : String(material.reorderPoint),
      reorderQuantity:
        material.reorderQuantity == null ? "" : String(material.reorderQuantity),
      warehouseLocation: material.warehouseLocation || "",
      bin: material.bin || "",
      box: material.box || "",
      materialGrade,
      specification: material.specification || "",
      stockForm,
      thicknessMm:
        material.thicknessMm == null ? "" : String(material.thicknessMm),
      widthMm: material.widthMm == null ? "" : String(material.widthMm),
      lengthMm: material.lengthMm == null ? "" : String(material.lengthMm),
      isRemnant: !!material.isRemnant,
      parentRawMaterialId:
        material.parentRawMaterialId != null
          ? String(material.parentRawMaterialId)
          : "",
      defaultLocationId:
        material.defaultLocationId != null
          ? String(material.defaultLocationId)
          : "",
    });
    setFormError("");
    setIsMaterialGradeOther(
      !!materialGrade.trim() &&
        !STANDARD_MATERIAL_GRADES.some(
          (g) => g.toLowerCase() === materialGrade.trim().toLowerCase()
        )
    );
    setIsStockFormOther(
      !!stockForm.trim() &&
        !STANDARD_STOCK_FORMS.some(
          (f) => f.toLowerCase() === stockForm.trim().toLowerCase()
        )
    );
    setShowForm(true);
  };

  const parseOptDecimal = (s: string): number | null | undefined => {
    const t = s.trim();
    if (t === "") return undefined;
    const n = Number(t);
    if (Number.isNaN(n)) return undefined;
    return n;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    const partNo = form.partNo.trim();
    const partName = form.partName.trim();
    const skuTrim = form.sku.trim();
    const unit = normalizeUnitForSave(form.unit);
    const unitCost = Number(form.unitCost);
    const reorderPoint =
      form.reorderPoint === "" ? undefined : Number(form.reorderPoint);
    const reorderQuantity =
      form.reorderQuantity === "" ? undefined : Number(form.reorderQuantity);
    const vendorId =
      form.vendorId.trim() === "" ? undefined : Number(form.vendorId);
    const fail = (message: string) => {
      setFormError(message);
      toast.error(message);
      return;
    };

    if (!partNo) {
      return fail("Part number is required");
    }
    if (!partName) {
      return fail("Part name is required");
    }
    if (!unit) {
      return fail("Unit is required");
    }
    if (unitSelectValue(form.unit) === CUSTOM_UOM_SELECT_VALUE && !form.unit.trim()) {
      return fail("Enter a custom unit of measure");
    }
    if (Number.isNaN(unitCost) || unitCost < 0) {
      return fail("Unit cost must be zero or greater");
    }
    const excludeId = form.id ?? 0;
    const dupPart = materials.some(
      (m) =>
        m.id !== excludeId &&
        (m.partNo || "").trim().toLowerCase() === partNo.toLowerCase()
    );
    if (dupPart) {
      return fail("Another raw material already uses this part number.");
    }
    if (skuTrim) {
      const dupSku = materials.some(
        (m) =>
          m.id !== excludeId &&
          (m.sku || "").trim().toLowerCase() === skuTrim.toLowerCase()
      );
      if (dupSku) {
        return fail("Another raw material already uses this SKU.");
      }
    }
    if (
      reorderPoint !== undefined &&
      (Number.isNaN(reorderPoint) || reorderPoint < 0)
    ) {
      return fail("Reorder point must be zero or greater");
    }
    if (
      reorderQuantity !== undefined &&
      (Number.isNaN(reorderQuantity) || reorderQuantity < 0)
    ) {
      return fail("Reorder quantity must be zero or greater");
    }

    const thicknessMm = parseOptDecimal(form.thicknessMm);
    const widthMm = parseOptDecimal(form.widthMm);
    const lengthMm = parseOptDecimal(form.lengthMm);
    const parentRawMaterialId =
      form.parentRawMaterialId.trim() === ""
        ? null
        : Number(form.parentRawMaterialId);
    const defaultLocationId =
      form.defaultLocationId.trim() === ""
        ? null
        : Number(form.defaultLocationId);

    if (
      form.parentRawMaterialId.trim() !== "" &&
      (Number.isNaN(parentRawMaterialId!) || parentRawMaterialId! < 1)
    ) {
      return fail("Invalid parent raw material");
    }
    if (
      form.defaultLocationId.trim() !== "" &&
      (Number.isNaN(defaultLocationId!) || defaultLocationId! < 1)
    ) {
      return fail("Invalid default location");
    }

    setSaving(true);
    try {
      await InventoryService.SaveRawMaterial({
        id: form.id,
        partNo,
        partName,
        sku: skuTrim || undefined,
        description: form.description.trim(),
        unit,
        unitCost,
        vendorId,
        reorderPoint,
        reorderQuantity,
        warehouseLocation: form.warehouseLocation.trim() || undefined,
        bin: form.bin.trim() || undefined,
        box: form.box.trim() || undefined,
        materialGrade: form.materialGrade.trim() || undefined,
        specification: form.specification.trim() || undefined,
        stockForm: form.stockForm.trim() || undefined,
        thicknessMm: thicknessMm ?? null,
        widthMm: widthMm ?? null,
        lengthMm: lengthMm ?? null,
        isRemnant: form.isRemnant,
        parentRawMaterialId,
        defaultLocationId,
      });
      toast.success(
        form.id ? "Raw material updated successfully" : "Raw material created"
      );
      resetForm();
      loadMaterials();
    } catch (error: any) {
      const message =
        error?.response?.data?.error || error.message || "Unknown error";
      setFormError(message);
      toast.error(`Error saving raw material: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const filteredMaterials = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return materials;
    return materials.filter((material) =>
      [
        material.partNo,
        material.partName,
        material.description,
        material.unit,
        material.sku,
        material.materialGrade,
        material.stockForm,
        material.warehouseLocation,
        material.bin,
        material.box,
        material.vendorName,
        material.isActive ? "active" : "inactive",
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [materials, searchTerm]);

  const parentOptions = useMemo(() => {
    const id = form.id;
    return materials.filter((m) => m.id !== id);
  }, [materials, form.id]);

  const renderCell = (material: RawMaterial, key: string): React.ReactNode => {
    switch (key) {
      case "partNo":
        return material.partNo || "";
      case "partName":
        return material.partName || "";
      case "status":
        return (
          <span
            className={`badge ${
              material.isActive === false ? "badge-secondary" : "badge-success"
            }`}
          >
            {material.isActive === false ? "Inactive" : "Active"}
          </span>
        );
      case "vendorName":
        return (
          <span style={{ maxWidth: 180, fontSize: "0.875rem", display: "inline-block" }}>
            {material.vendorName || "—"}
          </span>
        );
      case "sku":
        return material.sku || "—";
      case "storage":
        return (
          <span style={{ maxWidth: 200, fontSize: "0.875rem", display: "inline-block" }}>
            {formatStorage(material)}
          </span>
        );
      case "defaultLocationName":
        return (
          <span style={{ fontSize: "0.875rem" }}>
            {material.defaultLocationName || "—"}
          </span>
        );
      case "stockForm":
        return material.stockForm || "—";
      case "materialGrade":
        return (
          <span style={{ maxWidth: 120, display: "inline-block" }}>
            {material.materialGrade || "—"}
          </span>
        );
      case "dims":
        return (
          <span style={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
            {[
              material.thicknessMm != null ? `T ${material.thicknessMm}` : null,
              material.widthMm != null ? `W ${material.widthMm}` : null,
              material.lengthMm != null ? `L ${material.lengthMm}` : null,
            ]
              .filter(Boolean)
              .join(" × ") || "—"}
          </span>
        );
      case "isRemnant":
        return material.isRemnant ? (
          <span className="badge badge-raw">Yes</span>
        ) : (
          "—"
        );
      case "unit":
        return material.unit || "";
      case "unitCost":
        return Number(material.unitCost || 0).toFixed(2);
      case "description":
        return (
          <span style={{ maxWidth: 200, fontSize: "0.875rem", display: "inline-block" }}>
            {material.description || ""}
          </span>
        );
      case "action":
        return (
          <>
            <button
              type="button"
              className="btn-small"
              onClick={() => handleEdit(material)}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn-small"
              onClick={() => handleToggleStatus(material)}
            >
              {material.isActive === false ? "Activate" : "Deactivate"}
            </button>
          </>
        );
      default:
        return "";
    }
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner"></div>
        <p>Loading raw materials...</p>
      </div>
    );
  }

  return (
    <div className="customers-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Raw Material Master</h1>
          <p className="page-subtitle">
            Catalog raw materials with SKU, default storage, dimensions, grade, and remnant links for inventory
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              loadMaterials(showInactive);
              loadLocations();
              loadVendors();
            }}
          >
            Refresh
          </button>
          <ColumnChooser
            columns={COLUMNS}
            hiddenColumns={hiddenColumns}
            showMenu={showColumnChooser}
            onToggleMenu={() => setShowColumnChooser(!showColumnChooser)}
            onToggleColumn={toggleColumn}
            containerRef={columnChooserRef}
          />
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setForm(emptyForm());
              setFormError("");
              setIsMaterialGradeOther(false);
              setIsStockFormOther(false);
              setShowForm(true);
            }}
          >
            Add Raw Material
          </button>
        </div>
      </div>

      {showForm && (
        <div className="table-card rm-form-card">
          <form className="rm-form" onSubmit={handleSubmit}>
            <h2 className="rm-form__title">
              {form.id ? "Edit raw material" : "Add raw material"}
            </h2>
            <p className="rm-form__lead">
              Required fields are marked. Unit of measure uses a standard list
              (with an optional custom code). Default vendor is chosen from Vendor
              Master. Optional sections group storage labels, material specs,
              and remnants so you can fill only what applies.
            </p>
            {formError && <div className="rm-form__error">{formError}</div>}

            <section className="rm-form__section" aria-labelledby="rm-section-ident">
              <h3 id="rm-section-ident" className="rm-form__section-title">
                Item identification
              </h3>
              <div className="rm-form__grid rm-form__grid--3">
                <div className="rm-form__field">
                  <span className="rm-form__label rm-form__label--req">Part number</span>
                  <input
                    className="search-input"
                    value={form.partNo}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, partNo: e.target.value }))
                    }
                  />
                </div>
                <div className="rm-form__field">
                  <span className="rm-form__label rm-form__label--req">Part name</span>
                  <input
                    className="search-input"
                    value={form.partName}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, partName: e.target.value }))
                    }
                  />
                </div>
                <div className="rm-form__field">
                  <span className="rm-form__label">
                    SKU / internal #
                    <span className="rm-form__hint"> optional</span>
                  </span>
                  <input
                    className="search-input"
                    placeholder="Optional"
                    value={form.sku}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, sku: e.target.value }))
                    }
                  />
                </div>
                <div className="rm-form__field rm-form__span-2 rm-form__unit-block">
                  <span className="rm-form__label rm-form__label--req">
                    Unit of measure
                  </span>
                  <div className="rm-form__unit-controls">
                    <select
                      className="search-input"
                      aria-label="Standard unit of measure"
                      value={unitSelectValue(form.unit)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === CUSTOM_UOM_SELECT_VALUE) {
                          setForm((prev) => ({
                            ...prev,
                            unit:
                              prev.unit && isCustomUom(prev.unit)
                                ? prev.unit
                                : "",
                          }));
                        } else {
                          setForm((prev) => ({ ...prev, unit: v }));
                        }
                      }}
                    >
                      {STANDARD_UOM_CODES.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                      <option value={CUSTOM_UOM_SELECT_VALUE}>Custom…</option>
                    </select>
                    {unitSelectValue(form.unit) === CUSTOM_UOM_SELECT_VALUE && (
                      <input
                        className="search-input rm-form__unit-custom"
                        placeholder="Enter unit code (e.g. ROLL, SHEET)"
                        value={form.unit}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, unit: e.target.value }))
                        }
                      />
                    )}
                  </div>
                  <span className="rm-form__hint">
                    Standard codes stay consistent for reporting. Use Custom only
                    when you need a shop-specific unit.
                  </span>
                </div>
                <div className="rm-form__field">
                  <span className="rm-form__label">Unit cost</span>
                  <input
                    className="search-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.unitCost}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, unitCost: e.target.value }))
                    }
                  />
                </div>
                <div className="rm-form__field rm-form__span-2">
                  <span className="rm-form__label">
                    Default vendor
                    <span className="rm-form__hint"> from Vendor Master</span>
                  </span>
                  <select
                    className="search-input"
                    value={form.vendorId}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, vendorId: e.target.value }))
                    }
                  >
                    <option value="">— None —</option>
                    {sortedVendors.map((v) => (
                      <option key={v.vendor_id} value={v.vendor_id}>
                        {(v.vendorcode || "").trim() || `#${v.vendor_id}`} —{" "}
                        {(v.company_name || "").trim() || "Vendor"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className="rm-form__section" aria-labelledby="rm-section-reorder">
              <h3 id="rm-section-reorder" className="rm-form__section-title">
                Reorder policy
              </h3>
              <p className="rm-form__lead" style={{ marginBottom: "0.75rem" }}>
                When on-hand quantity falls at or below the reorder point, you can
                use the reorder quantity as a suggested order size.
              </p>
              <div className="rm-form__row-inline">
                <div className="rm-form__field">
                  <span className="rm-form__label">Reorder point</span>
                  <input
                    className="search-input"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Optional"
                    value={form.reorderPoint}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        reorderPoint: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="rm-form__field">
                  <span className="rm-form__label">Reorder quantity</span>
                  <input
                    className="search-input"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Optional"
                    value={form.reorderQuantity}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        reorderQuantity: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </section>

            <section className="rm-form__section" aria-labelledby="rm-section-desc">
              <h3 id="rm-section-desc" className="rm-form__section-title">
                Description
              </h3>
              <div className="rm-form__field rm-form__description">
                <textarea
                  className="search-input"
                  style={{ minHeight: "88px", paddingTop: "0.75rem" }}
                  placeholder="Notes, finish, coating, or other free text"
                  value={form.description}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                />
              </div>
            </section>

            <section className="rm-form__section" aria-labelledby="rm-section-storage">
              <h3 id="rm-section-storage" className="rm-form__section-title">
                Storage
              </h3>
              <p className="rm-form__lead" style={{ marginBottom: "0.75rem" }}>
                Free-text labels for where material lives on the floor. Default
                location ties this item to Location Master for transfers and
                inventory by site.
              </p>
              <div className="rm-form__grid rm-form__grid--3">
                <div className="rm-form__field">
                  <span className="rm-form__label">Warehouse / zone</span>
                  <input
                    className="search-input"
                    placeholder="e.g. Aisle B, Zone 2"
                    value={form.warehouseLocation}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        warehouseLocation: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="rm-form__field">
                  <span className="rm-form__label">Bin</span>
                  <input
                    className="search-input"
                    value={form.bin}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, bin: e.target.value }))
                    }
                  />
                </div>
                <div className="rm-form__field">
                  <span className="rm-form__label">Box</span>
                  <input
                    className="search-input"
                    value={form.box}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, box: e.target.value }))
                    }
                  />
                </div>
                <div className="rm-form__field rm-form__span-2">
                  <span className="rm-form__label">Default location (Location Master)</span>
                  <select
                    className="search-input"
                    value={form.defaultLocationId}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        defaultLocationId: e.target.value,
                      }))
                    }
                  >
                    <option value="">— None —</option>
                    {locations.map((loc) => (
                      <option key={loc.locationId} value={loc.locationId}>
                        {loc.name || loc.code || `Location ${loc.locationId}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className="rm-form__section" aria-labelledby="rm-section-material">
              <h3 id="rm-section-material" className="rm-form__section-title">
                Material & dimensions
              </h3>
              <div className="rm-form__grid rm-form__grid--3">
                <div className="rm-form__field">
                  <span className="rm-form__label">Material grade</span>
                  <select
                    className="search-input"
                    value={
                      isMaterialGradeOther
                        ? CUSTOM_UOM_SELECT_VALUE
                        : picklistSelectValue(
                            form.materialGrade,
                            STANDARD_MATERIAL_GRADES
                          )
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === CUSTOM_UOM_SELECT_VALUE) {
                        setIsMaterialGradeOther(true);
                        setForm((prev) => ({
                          ...prev,
                          materialGrade:
                            prev.materialGrade &&
                            !STANDARD_MATERIAL_GRADES.some(
                              (g) =>
                                g.toLowerCase() ===
                                prev.materialGrade.trim().toLowerCase()
                            )
                              ? prev.materialGrade
                              : "",
                        }));
                      } else {
                        setIsMaterialGradeOther(false);
                        setForm((prev) => ({ ...prev, materialGrade: v }));
                      }
                    }}
                  >
                    <option value="">— None —</option>
                    {STANDARD_MATERIAL_GRADES.map((grade) => (
                      <option key={grade} value={grade}>
                        {grade}
                      </option>
                    ))}
                    <option value={CUSTOM_UOM_SELECT_VALUE}>Other…</option>
                  </select>
                  {isMaterialGradeOther && (
                    <input
                      className="search-input"
                      placeholder="Enter custom grade"
                      value={form.materialGrade}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          materialGrade: e.target.value,
                        }))
                      }
                    />
                  )}
                </div>
                <div className="rm-form__field">
                  <span className="rm-form__label">Specification / standard</span>
                  <input
                    className="search-input"
                    value={form.specification}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        specification: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="rm-form__field">
                  <span className="rm-form__label">Stock form</span>
                  <select
                    className="search-input"
                    value={
                      isStockFormOther
                        ? CUSTOM_UOM_SELECT_VALUE
                        : picklistSelectValue(
                            form.stockForm,
                            STANDARD_STOCK_FORMS
                          )
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === CUSTOM_UOM_SELECT_VALUE) {
                        setIsStockFormOther(true);
                        setForm((prev) => ({
                          ...prev,
                          stockForm:
                            prev.stockForm &&
                            !STANDARD_STOCK_FORMS.some(
                              (f) =>
                                f.toLowerCase() ===
                                prev.stockForm.trim().toLowerCase()
                            )
                              ? prev.stockForm
                              : "",
                        }));
                      } else {
                        setIsStockFormOther(false);
                        setForm((prev) => ({ ...prev, stockForm: v }));
                      }
                    }}
                  >
                    <option value="">— None —</option>
                    {STANDARD_STOCK_FORMS.map((formName) => (
                      <option key={formName} value={formName}>
                        {formName}
                      </option>
                    ))}
                    <option value={CUSTOM_UOM_SELECT_VALUE}>Other…</option>
                  </select>
                  {isStockFormOther && (
                    <input
                      className="search-input"
                      placeholder="Enter custom stock form"
                      value={form.stockForm}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, stockForm: e.target.value }))
                      }
                    />
                  )}
                </div>
                <div className="rm-form__field">
                  <span className="rm-form__label">Thickness (mm)</span>
                  <input
                    className="search-input"
                    type="number"
                    step="any"
                    min="0"
                    value={form.thicknessMm}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, thicknessMm: e.target.value }))
                    }
                  />
                </div>
                <div className="rm-form__field">
                  <span className="rm-form__label">Width (mm)</span>
                  <input
                    className="search-input"
                    type="number"
                    step="any"
                    min="0"
                    value={form.widthMm}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, widthMm: e.target.value }))
                    }
                  />
                </div>
                <div className="rm-form__field">
                  <span className="rm-form__label">Length (mm)</span>
                  <input
                    className="search-input"
                    type="number"
                    step="any"
                    min="0"
                    value={form.lengthMm}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, lengthMm: e.target.value }))
                    }
                  />
                </div>
              </div>
            </section>

            <section className="rm-form__section" aria-labelledby="rm-section-remnant">
              <h3 id="rm-section-remnant" className="rm-form__section-title">
                Remnant / offcut
              </h3>
              <div className="rm-form__grid">
                <div className="rm-form__field">
                  <label className="rm-form__checkbox-row">
                    <input
                      type="checkbox"
                      checked={form.isRemnant}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          isRemnant: e.target.checked,
                        }))
                      }
                    />
                    <span>This record is a remnant or offcut (not full mill stock)</span>
                  </label>
                </div>
                <div className="rm-form__field">
                  <span className="rm-form__label">Parent raw material</span>
                  <select
                    className="search-input"
                    value={form.parentRawMaterialId}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        parentRawMaterialId: e.target.value,
                      }))
                    }
                  >
                    <option value="">— None —</option>
                    {parentOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {(m.partNo || "").trim() || `#${m.id}`}{" "}
                        {(m.partName || "").trim()
                          ? `— ${(m.partName || "").trim()}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <div className="rm-form__actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={resetForm}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Saving..." : form.id ? "Update" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="page-filters">
        <div className="search-wrapper">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <input
            type="text"
            placeholder="Search part #, name, SKU, grade, form, storage…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <label className="filter-checkbox">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>

      <div className="table-card">
        <div className="table-wrapper" style={{ overflowX: "auto" }}>
          <table className="customers-table">
            <thead>
              <tr>
                {visibleColumns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredMaterials.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleColumns.length}
                    style={{ padding: "1.5rem", color: "#6b7280" }}
                  >
                    No raw materials found.
                  </td>
                </tr>
              ) : (
                filteredMaterials.map((material) => (
                  <tr key={material.id}>
                    {visibleColumns.map((column) => (
                      <td key={column.key}>{renderCell(material, column.key)}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RawMaterialMaster;
