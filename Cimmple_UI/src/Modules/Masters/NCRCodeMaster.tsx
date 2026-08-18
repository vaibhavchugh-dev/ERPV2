import React, { useEffect, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import MasterListPage, { ColumnConfig } from "../../Common/Components/MasterListPage";
import { NCRCodeService, NCRCodeMaster } from "../../Common/Services/NCRCodeService";
import NCRCodeMasterSlideout from "./NCRCodeMasterSlideout";

const columns: ColumnConfig<NCRCodeMaster>[] = [
  {
    key: "ncrCode",
    label: "NCR Code",
    sortable: true,
    locked: true,
    render: (value) => <span style={{ fontWeight: 600, color: "#111827" }}>{value || ""}</span>,
  },
  {
    key: "description",
    label: "Description",
    sortable: true,
  },
];

const NCRCodeMasterPage: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const [codes, setCodes] = useState<NCRCodeMaster[]>([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedId, setSelectedId] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get("open");
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        setSelectedId(id);
        setShowSlideout(true);
        history.replace(location.pathname);
      }
    }
  }, [location.search, history, location.pathname]);

  useEffect(() => {
    loadCodes();
  }, []);

  const loadCodes = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      let tenantId = storage?.tenantID || 0;
      if (tenantId === 0 && process.env.NODE_ENV === "development") {
        tenantId = 1;
      }
      const result = await NCRCodeService.GetNCRCodes(tenantId);
      setCodes(result || []);
    } catch (error: any) {
      toast.error(`Error loading NCR codes: ${error.message || "Unknown error"}`);
      setCodes([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <MasterListPage
        title="NCR Code Master"
        subtitle="Maintain standard non-conformance codes used on NCR reports."
        columns={columns}
        data={codes}
        loading={loading}
        searchPlaceholder="Search by code or description..."
        searchFields={["ncrCode", "description"]}
        addButtonLabel="Add NCR Code"
        onAdd={() => {
          setSelectedId(0);
          setShowSlideout(true);
        }}
        onRowClick={(row) => {
          setSelectedId(row.id);
          setShowSlideout(true);
        }}
        emptyMessage="No NCR codes found. Add your first code to get started."
      />

      {showSlideout && (
        <NCRCodeMasterSlideout
          ncrCodeId={selectedId}
          onClose={(refresh) => {
            setShowSlideout(false);
            if (refresh) loadCodes();
          }}
        />
      )}
    </>
  );
};

export default NCRCodeMasterPage;
