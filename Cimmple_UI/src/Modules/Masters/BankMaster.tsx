import React, { useState, useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import MasterListPage, { ColumnConfig } from "../../Common/Components/MasterListPage";
import BankMasterSlideout from "./BankMasterSlideout";
import { BankService, BankMaster } from "../../Common/Services/BankService";

const BankMasterComponent: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const [banks, setBanks] = useState<BankMaster[]>([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedBankId, setSelectedBankId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [filterValue, setFilterValue] = useState("all");

  // Handle URL parameter to open slideout (from global search)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        setSelectedBankId(id);
        setShowSlideout(true);
        history.replace(location.pathname);
      }
    }
  }, [location.search, history, location.pathname]);

  // Define columns for the table
  const columns: ColumnConfig<BankMaster>[] = [
    {
      key: "accountNo",
      label: "Account No",
      sortable: true,
      locked: true,
    },
    {
      key: "bankName",
      label: "Bank Name",
      sortable: true,
      locked: true,
      render: (value) => (
        <span style={{ fontWeight: 500, color: "#111827" }}>
          {value || ""}
        </span>
      ),
    },
    {
      key: "accountType",
      label: "Account Type",
      sortable: true,
    },
    {
      key: "phone",
      label: "Phone Number",
      sortable: true,
    },
    {
      key: "email",
      label: "Email",
      sortable: true,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => (
        <span className={`badge ${value === "Active" ? "badge-success" : "badge-danger"}`}>
          {value || "Active"}
        </span>
      ),
    },
  ];

  const loadBanks = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;

      const result = await BankService.GetBanklist({ tenantid: tenantID });
      if (result) {
        // Apply filter
        let filtered = result;
        if (filterValue === "active") {
          filtered = result.filter((b) => b.status === "Active");
        } else if (filterValue === "inactive") {
          filtered = result.filter((b) => b.status === "Inactive");
        }
        setBanks(filtered);
      }
    } catch (error: any) {
      toast.error(`Error loading banks: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBanks();
  }, []);

  useEffect(() => {
    loadBanks();
  }, [filterValue]);

  const handleAddBank = () => {
    setSelectedBankId(0);
    setShowSlideout(true);
  };

  const handleRowClick = (bank: BankMaster) => {
    setSelectedBankId(bank.id);
    setShowSlideout(true);
  };

  const handleCloseSlideout = (refreshList = false) => {
    setShowSlideout(false);
    if (refreshList) {
      loadBanks();
    }
  };

  // Filter banks based on filterValue
  const filteredBanks = banks.filter((bank) => {
    if (filterValue === "all") return true;
    if (filterValue === "active") return bank.status === "Active";
    if (filterValue === "inactive") return bank.status === "Inactive";
    return true;
  });

  return (
    <>
      <MasterListPage
        title="Bank Master"
        subtitle="Manage your bank accounts"
        addButtonLabel="Add Bank"
        columns={columns}
        data={filteredBanks}
        loading={loading}
        onAdd={handleAddBank}
        onRowClick={handleRowClick}
        onLoadData={loadBanks}
        searchPlaceholder="Search banks..."
        searchFields={["bankName", "accountNo", "accountType", "email", "phone"]}
        filters={[
          {
            label: "Status",
            options: [
              { value: "all", label: "All Banks" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ],
            value: filterValue,
            onChange: (value) => {
              setFilterValue(value);
              loadBanks();
            },
          },
        ]}
        getRowId={(row) => row.id}
        emptyMessage="No banks found"
        columnPreferenceKey="bankMaster.hiddenColumns"
        defaultHiddenColumns={["phone", "email"]}
      />

      {showSlideout && (
        <BankMasterSlideout
          bankId={selectedBankId}
          onClose={handleCloseSlideout}
        />
      )}
    </>
  );
};

export default BankMasterComponent;






