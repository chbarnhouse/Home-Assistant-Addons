import React, { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import AddIcon from "@mui/icons-material/Add";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import Tooltip from "@mui/material/Tooltip";
import { DataGrid } from "@mui/x-data-grid";
import EditAccountModal from "../components/EditAccountModal";
import AddEditAccountModal from "../components/AddEditAccountModal";
import { fetchAllData, callApi } from "../utils/api";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import SavingsIcon from "@mui/icons-material/Savings";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import SettingsApplicationsIcon from "@mui/icons-material/SettingsApplications";
import Alert from "@mui/material/Alert";
import { useSnackbar } from "../context/SnackbarContext";

const MANUAL_ACCOUNT_API = "manual_account";

function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [banks, setBanks] = useState([]);
  const [accountTypes, setAccountTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const { notify } = useSnackbar();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allData = await fetchAllData();
      console.log("AccountsPage fetched allData:", allData);

      const processedAccounts = (allData.accounts || []).map((acc, index) => {
        // --- Start Logging ---
        try {
          console.log(
            `Processing account ${index} (raw):`,
            JSON.stringify(acc)
          );
        } catch (e) {
          console.error(`Error logging raw account ${index}:`, acc, e);
        }
        // --- End Logging ---

        const id =
          acc && acc.id
            ? String(acc.id)
            : `temp-${Math.random().toString(36).substring(2, 15)}`;
        const isYnabAccount =
          "account" in acc && typeof acc.account === "object";
        let balance = 0;
        if (isYnabAccount && acc.account) {
          balance =
            acc.account.balance ??
            acc.account.cleared_balance ??
            acc.account.uncleared_balance ??
            0;
        } else {
          balance =
            acc.balance ??
            acc.balance_milliunits ??
            acc.current_balance_milliunits ??
            acc.current_balance ??
            acc.cleared_balance ??
            0;
        }
        const hasManualDetails =
          acc.details && Object.keys(acc.details).length > 0;
        const bank =
          (hasManualDetails && acc.details.bank) ||
          acc.bank ||
          (isYnabAccount && acc.account && acc.account.bank) ||
          null;
        let accountType = null;
        if (hasManualDetails) {
          if (acc.details.account_type) accountType = acc.details.account_type;
          else if (acc.details.type) accountType = acc.details.type;
        }
        if (!accountType) {
          if (acc.type) accountType = acc.type;
          else if (acc.account?.type) accountType = acc.account.type;
          else accountType = "Unknown";
        }
        let liquid = 0,
          frozen = 0,
          deepFreeze = 0;
        if (acc.allocation_rules) {
          liquid = acc.allocation_rules.liquid || 0;
          frozen = acc.allocation_rules.frozen || 0;
          deepFreeze = acc.allocation_rules.deep_freeze || 0;
        }

        // --- Start Logging ---
        const returnObj = {
          ...acc,
          id,
          balance: balance,
          bank: bank,
          account_type: accountType,
          allocation_liquid: liquid,
          allocation_frozen: frozen,
          allocation_deep_freeze: deepFreeze,
          is_ynab: isYnabAccount,
          details: acc && acc.details ? acc.details : {},
        };
        try {
          console.log(
            `Processed account ${index} (output):`,
            JSON.stringify(returnObj)
          );
        } catch (e) {
          console.error(
            `Error logging processed account ${index}:`,
            returnObj,
            e
          );
        }
        // --- End Logging ---
        return returnObj;
      });

      // --- Start Logging ---
      try {
        console.log(
          "Final processedAccounts array before sort:",
          JSON.stringify(processedAccounts)
        );
      } catch (e) {
        console.error(
          "Error logging final processedAccounts array:",
          processedAccounts,
          e
        );
      }
      // --- End Logging ---

      setAccounts(
        processedAccounts.sort((a, b) =>
          getDisplayName(a).localeCompare(getDisplayName(b))
        )
      );
      setBanks(allData.banks || []);
      setAccountTypes(allData.account_types || []);
    } catch (err) {
      console.error("Error fetching all data for Accounts Page:", err);
      setError(err.message || "Failed to load data. Please try refreshing.");
      notify("Failed to load account data.", "error");
      setAccounts([]);
      setBanks([]);
      setAccountTypes([]);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleOpenAddModal = () => {
    setSelectedAccount(null);
    setShowAddModal(true);
  };

  const handleOpenEditModal = (account) => {
    setSelectedAccount(account);
    setShowEditModal(true);
  };

  const handleCloseAccountModal = () => {
    setShowEditModal(false);
    setShowAddModal(false);
    setSelectedAccount(null);
  };

  const handleSaveAccount = async (accountId, accountDetails) => {
    console.log(
      `Attempting to save account ${
        accountId ? "(ID: " + accountId + ")" : "(New Account)"
      } with details:`,
      accountDetails
    );
    const isUpdating = !!accountId;
    const endpoint = isUpdating
      ? `${MANUAL_ACCOUNT_API}/${accountId}`
      : "accounts";
    const method = isUpdating ? "PUT" : "POST";

    try {
      const result = await callApi(endpoint, {
        method: method,
        body: JSON.stringify(accountDetails),
      });
      console.log(`Save account result for ID ${accountId}:`, result);

      await fetchAll();
      notify(
        `Account ${isUpdating ? "updated" : "added"} successfully!`,
        "success"
      );
      handleCloseAccountModal();
    } catch (err) {
      console.error(
        `Error ${isUpdating ? "updating" : "adding"} account:`,
        err
      );
      notify(
        `Failed to ${isUpdating ? "update" : "add"} account: ${
          err.message || "Unknown error"
        }`,
        "error"
      );
      throw err;
    }
  };

  const handleDeleteAccount = async (accountId) => {
    if (!accountId) {
      console.error("Cannot delete account: ID is missing.");
      notify("Cannot delete account: ID missing.", "error");
      return;
    }
    console.log(`Attempting to delete account with ID: ${accountId}`);
    if (
      window.confirm(
        "Are you sure you want to delete this account's manual details?"
      )
    ) {
      try {
        await callApi(`${MANUAL_ACCOUNT_API}/${accountId}`, {
          method: "DELETE",
        });
        notify("Account manual details deleted successfully!", "success");
        await fetchAll();
      } catch (err) {
        console.error("Error deleting account details:", err);
        notify(
          `Failed to delete account details: ${err.message || "Unknown error"}`,
          "error"
        );
      }
    }
  };

  const formatCurrency = (milliunits) => {
    if (milliunits == null || isNaN(milliunits)) return "N/A";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(milliunits / 1000);
  };

  const formatPercent = (value) => {
    if (value == null || isNaN(value)) return "N/A";
    return `${Number(value).toFixed(0)}%`;
  };

  const getDisplayName = (account) => {
    if (!account) return "";
    const name = account.name || "Unnamed Account";
    const bank = account.bank;
    const includeBank =
      account.details?.include_bank_in_name ??
      account.include_bank_in_name ??
      false;
    return includeBank && bank && bank !== "N/A" ? `${bank} ${name}` : name;
  };

  const getAccountIcon = (type) => {
    const lowerType = type?.toLowerCase() || "";
    if (lowerType.includes("checking"))
      return <AccountBalanceWalletIcon fontSize="small" />;
    if (lowerType.includes("savings")) return <SavingsIcon fontSize="small" />;
    if (lowerType.includes("cash")) return <AttachMoneyIcon fontSize="small" />;
    return <SettingsApplicationsIcon fontSize="small" />;
  };

  const columns = [
    {
      field: "name",
      headerName: "Account Name",
      minWidth: 200,
      flex: 2,
      renderCell: (params) => {
        if (!params || !params.row) {
          return null;
        }
        return (
          <Box sx={{ display: "flex", alignItems: "center" }}>
            {getAccountIcon(params.row.account_type)}
            <Typography sx={{ ml: 1 }}>{getDisplayName(params.row)}</Typography>
          </Box>
        );
      },
    },
    {
      field: "account_type",
      headerName: "Type",
      minWidth: 120,
      flex: 1,
      valueGetter: (params) =>
        (params && params.row ? params.row.account_type : null) || "N/A",
    },
    {
      field: "balance",
      headerName: "Balance",
      type: "number",
      minWidth: 130,
      flex: 1,
      valueFormatter: (params) => formatCurrency(params.value),
      align: "right",
      headerAlign: "right",
    },
    {
      field: "allocation_liquid",
      headerName: "Liquid",
      type: "number",
      width: 80,
      valueFormatter: (params) => formatPercent(params.value),
      align: "right",
      headerAlign: "right",
    },
    {
      field: "allocation_frozen",
      headerName: "Frozen",
      type: "number",
      width: 80,
      valueFormatter: (params) => formatPercent(params.value),
      align: "right",
      headerAlign: "right",
    },
    {
      field: "allocation_deep_freeze",
      headerName: "Deep Freeze",
      type: "number",
      width: 110,
      valueFormatter: (params) => formatPercent(params.value),
      align: "right",
      headerAlign: "right",
    },
    {
      field: "actions",
      headerName: "Actions",
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      width: 100,
      align: "center",
      headerAlign: "center",
      renderCell: (params) => (
        <Box>
          <Tooltip title="Edit Details">
            <IconButton
              size="small"
              onClick={() => handleOpenEditModal(params.row)}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete Manual Details">
            <IconButton
              size="small"
              onClick={() => handleDeleteAccount(params.row.id)}
              color="error"
              disabled={params.row.is_ynab}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "80vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Error loading accounts: {error}</Alert>
        <Button onClick={fetchAll} sx={{ mt: 2 }}>
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        p: 3,
        height: "calc(100vh - 64px - 48px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography variant="h4">Accounts</Typography>
        <Box></Box>
      </Box>

      <Paper sx={{ flexGrow: 1, width: "100%", overflow: "hidden" }}>
        <DataGrid
          rows={accounts}
          columns={columns}
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
            sorting: { sortModel: [{ field: "name", sort: "asc" }] },
          }}
          pageSizeOptions={[10, 25, 50, 100]}
          density="compact"
          disableRowSelectionOnClick
          sx={{ border: 0 }}
        />
      </Paper>

      {showEditModal && selectedAccount && (
        <EditAccountModal
          open={showEditModal}
          onClose={handleCloseAccountModal}
          account={selectedAccount}
          banks={banks}
          accountTypes={accountTypes}
          onUpdate={handleSaveAccount}
        />
      )}
    </Box>
  );
}

export default AccountsPage;
