import React, { useState, useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import {
  ChartofAccountsService,
  ChartofAccountMaster,
} from "../../Common/Services/ChartofAccountsService";
import ChartofAccountsMasterSlideout from "./ChartofAccountsMasterSlideout";
import MasterListPage, { ColumnConfig } from "../../Common/Components/MasterListPage";
import "./CustomerMaster.scss";

const ChartofAccountsMaster: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const [allAccounts, setAllAccounts] = useState<ChartofAccountMaster[]>([]);
  const [accounts, setAccounts] = useState<ChartofAccountMaster[]>([]);
  const [showSlideout, setShowSlideout] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [filterValue, setFilterValue] = useState("all");

  // Handle URL parameter to open slideout (from global search)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        setSelectedAccountId(id);
        setShowSlideout(true);
        history.replace(location.pathname);
      }
    }
  }, [location.search, history, location.pathname]);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      let tenantID = storage?.tenantID || 0;
      if (tenantID === 0 && process.env.NODE_ENV === "development") {
        tenantID = 1;
      }

      const result = await ChartofAccountsService.GetChartofAccounts({ tenantid: tenantID });
      if (result && Array.isArray(result)) {
        setAllAccounts(result);
      } else {
        setAllAccounts([]);
      }
    } catch (error: any) {
      console.error("[ChartofAccountsMaster] Error loading accounts:", error);
      toast.error(`Error loading chart of accounts: ${error.message || "Unknown error"}`);
      setAllAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    // Filter accounts based on status filter
    let filtered = allAccounts;
    if (filterValue === "active") {
      filtered = allAccounts.filter((a) => a.status === "Active");
    } else if (filterValue === "inactive") {
      filtered = allAccounts.filter((a) => a.status === "Inactive");
    }
    setAccounts(filtered);
  }, [allAccounts, filterValue]);

  const handleRowClick = (row: Record<string, any>) => {
    const account = row as ChartofAccountMaster;
    setSelectedAccountId(account.accountID);
    setShowSlideout(true);
  };

  const handleAddAccount = () => {
    setSelectedAccountId(0);
    setShowSlideout(true);
  };

  const handleCloseSlideout = () => {
    setShowSlideout(false);
    loadAccounts();
  };

  const columns: ColumnConfig<ChartofAccountMaster>[] = [
    {
      key: "accountCode",
      label: "Account Code",
      sortable: true,
      locked: true,
    },
    {
      key: "accountName",
      label: "Account Name",
      sortable: true,
      locked: true,
    },
    {
      key: "accountType",
      label: "Account Type",
      sortable: true,
    },
    {
      key: "mainGroup",
      label: "Main Group",
      sortable: true,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value: any) => {
        return (
          <span
            className={`badge ${
              value === "Active" ? "badge-success" : "badge-danger"
            }`}
          >
            {value || ""}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <MasterListPage
        title="Chart of Accounts Master"
        subtitle="Manage your chart of accounts"
        loading={loading}
        addButtonLabel="Add Account"
        columns={columns}
        data={accounts}
        onAdd={handleAddAccount}
        onRowClick={handleRowClick}
        onLoadData={loadAccounts}
        searchPlaceholder="Search accounts..."
        searchFields={["accountCode", "accountName", "accountType", "mainGroup"]}
        filters={[
          {
            label: "Status",
            options: [
              { value: "all", label: "All Accounts" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ],
            value: filterValue,
            onChange: setFilterValue,
          },
        ]}
        emptyMessage="No accounts found"
        getRowId={(row) => row.accountID}
        columnPreferenceKey="chartOfAccountsMaster.hiddenColumns"
        defaultHiddenColumns={["mainGroup"]}
      />
      {showSlideout && (
        <ChartofAccountsMasterSlideout
          accountId={selectedAccountId}
          onClose={handleCloseSlideout}
        />
      )}
    </>
  );
};

export default ChartofAccountsMaster;

