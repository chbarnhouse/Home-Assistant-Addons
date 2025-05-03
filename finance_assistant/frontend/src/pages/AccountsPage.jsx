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
import AccountFormModal from "../components/AccountFormModal";
import { fetchAllData, callApi } from "../utils/api";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import SavingsIcon from "@mui/icons-material/Savings";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import SettingsApplicationsIcon from "@mui/icons-material/SettingsApplications";
import Alert from "@mui/material/Alert";
import { useSnackbar } from "../context/SnackbarContext";

const MANUAL_ACCOUNT_API = "manual_account";

// --- Add Frontend Implementation of calculate_allocations ---
function calculateAllocationsFrontend(totalBalanceMilliunits, rules = []) {
  let liquid = 0;
  let frozen = 0;
  let deepFreeze = 0;
  let remainingBalance = totalBalanceMilliunits;

  const processedRuleIds = new Set();

  // 1. Process Fixed Amount Rules
  for (const rule of rules) {
    const ruleId = rule?.id;
    if (ruleId === "remaining" || processedRuleIds.has(ruleId)) {
      continue;
    }
    if (rule?.type === "fixed") {
      try {
        const valueMilliunits = Math.round(parseFloat(rule.value || 0) * 1000); // Use round for safety
        const amountToAllocate = Math.min(valueMilliunits, remainingBalance);
        const status = rule.status;
        if (amountToAllocate > 0) {
          if (status === "Liquid") liquid += amountToAllocate;
          else if (status === "Frozen") frozen += amountToAllocate;
          else if (status === "Deep Freeze") deepFreeze += amountToAllocate;
          // else console.warn(`Unknown status '${status}' in fixed rule ${ruleId}`);
          remainingBalance -= amountToAllocate;
          processedRuleIds.add(ruleId);
        }
      } catch (e) {
        console.error(`Error processing fixed rule ${ruleId}:`, e);
      }
    }
  }

  // 2. Process Percentage Rules (on remaining balance after fixed)
  const balanceAfterFixed = remainingBalance;
  for (const rule of rules) {
    const ruleId = rule?.id;
    if (ruleId === "remaining" || processedRuleIds.has(ruleId)) {
      continue;
    }
    if (rule?.type === "percentage") {
      try {
        const percentage = parseFloat(rule.value || 0);
        if (percentage > 0 && percentage <= 100) {
          let amountToAllocate = Math.round(
            balanceAfterFixed * (percentage / 100)
          ); // Use round
          amountToAllocate = Math.min(amountToAllocate, remainingBalance);
          const status = rule.status;
          if (amountToAllocate > 0) {
            if (status === "Liquid") liquid += amountToAllocate;
            else if (status === "Frozen") frozen += amountToAllocate;
            else if (status === "Deep Freeze") deepFreeze += amountToAllocate;
            // else console.warn(`Unknown status '${status}' in percentage rule ${ruleId}`);
            remainingBalance -= amountToAllocate;
            processedRuleIds.add(ruleId);
          }
        } else {
          // console.warn(`Invalid percentage value ${percentage} in rule ${ruleId}`);
        }
      } catch (e) {
        console.error(`Error processing percentage rule ${ruleId}:`, e);
      }
    }
  }

  // 3. Apply the final 'remaining' rule
  const remainingRule = rules.find((rule) => rule?.id === "remaining");
  if (remainingRule) {
    const status = remainingRule.status || "Liquid"; // Default to Liquid
    if (remainingBalance > 0) {
      if (status === "Liquid") liquid += remainingBalance;
      else if (status === "Frozen") frozen += remainingBalance;
      else if (status === "Deep Freeze") deepFreeze += remainingBalance;
      // else console.warn(`Unknown status '${status}' in remaining rule`);
    }
  } else if (remainingBalance > 0) {
    // console.warn("'Remaining' rule missing, defaulting leftover balance to Liquid.");
    liquid += remainingBalance; // Default remaining to liquid if rule is missing
  }

  // Calculate percentages (handle division by zero)
  const totalBalanceForPercent = totalBalanceMilliunits || 1; // Avoid division by zero
  const liquidPercent = Math.round((liquid / totalBalanceForPercent) * 100);
  const frozenPercent = Math.round((frozen / totalBalanceForPercent) * 100);
  // Assign remaining percentage to deep freeze to ensure total is 100% due to rounding - IMPROVED LOGIC
  const deepFreezePercent = Math.max(0, 100 - liquidPercent - frozenPercent); // Ensure non-negative

  return {
    liquid_milliunits: liquid,
    frozen_milliunits: frozen,
    deep_freeze_milliunits: deepFreeze,
    liquid_percent: liquidPercent,
    frozen_percent: frozenPercent,
    deep_freeze_percent: deepFreezePercent,
  };
}
// --- End Frontend Implementation ---

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
        // <<< ACCOUNTS PAGE PROCESSING LOG >>>
        console.log(`---> Processing Account ${index}:`, acc?.name, acc?.id);
        console.log(`     Raw acc data:`, JSON.parse(JSON.stringify(acc))); // Deep copy
        const allocationRules = acc.allocation_rules || []; // Declare allocationRules here
        console.log(
          `     Extracted allocationRules:`,
          JSON.parse(JSON.stringify(allocationRules))
        ); // Deep copy
        // <<< END LOGGING >>>

        const id =
          acc && acc.id
            ? String(acc.id)
            : `temp-${Math.random().toString(36).substring(2, 15)}`;
        const isYnabAccount =
          "account" in acc && typeof acc.account === "object";

        // --- Refactored Balance Extraction ---
        let balance = null; // Start with null

        // 1. Check top-level fields, prioritizing cleared_balance
        balance =
          acc.cleared_balance ??
          acc.balance ??
          acc.uncleared_balance ??
          acc.balance_milliunits ??
          acc.current_balance_milliunits ??
          acc.current_balance;

        // 2. Check within details as fallback if balance is still null or undefined
        if ((balance === null || balance === undefined) && acc.details) {
          // Prioritize cleared_balance within details too
          balance =
            acc.details.cleared_balance ??
            acc.details.balance ??
            acc.details.uncleared_balance ??
            acc.details.balance_milliunits ??
            acc.details.current_balance_milliunits ??
            acc.details.current_balance;
        }

        // 3. Default to 0 if still null or undefined after all checks
        balance = balance ?? 0;
        // --- End Refactored Balance Extraction ---

        const hasManualDetails =
          acc.details && Object.keys(acc.details).length > 0;
        const bank =
          (hasManualDetails && acc.details.bank) ||
          acc.bank ||
          (isYnabAccount && acc.account && acc.account.bank) ||
          null;

        // --- Corrected Account Type Logic ---
        let accountType = null;
        // Prioritize manually set account_type from the merged backend data
        if (acc.account_type) {
          accountType = acc.account_type;
        } else if (acc.type) {
          // Fallback to YNAB type
          accountType = acc.type;
        } else if (acc.account?.type) {
          // Fallback for older structures if needed
          accountType = acc.account.type;
        }
        // Final fallback
        accountType = accountType || "Unknown";
        // --- End Corrected Logic ---

        // Explicitly create the object for the DataGrid
        const returnObj = {
          // Fields used by columns/getters/formatters directly:
          id: id,
          name: acc.name || "Unnamed Account", // Needed for sorting/display
          balance: balance,
          cleared_balance: acc.cleared_balance ?? 0,
          bank: bank,
          account_type: accountType,
          // Use allocation values directly from backend response
          allocation_liquid_milliunits: acc.liquid_milliunits ?? 0,
          allocation_frozen_milliunits: acc.frozen_milliunits ?? 0,
          allocation_deep_freeze_milliunits: acc.deep_freeze_milliunits ?? 0,
          is_ynab: isYnabAccount,
          // Fields needed indirectly (e.g., by getDisplayName or Edit Modal):
          include_bank_in_name:
            acc.details?.include_bank_in_name ??
            acc.include_bank_in_name ??
            false,
          last_4_digits: acc.last_4_digits || acc.details?.last_4_digits || "", // For edit modal
          notes: acc.notes || acc.details?.notes || "", // For edit modal
          allocation_rules:
            acc.allocation_rules || acc.details?.allocation_rules || [], // Ensure rules are passed to modal
          details: acc.details || {}, // Pass details for the modal
          account: acc.account, // Pass original YNAB account if it exists
        };
        return returnObj;
      });

      // Create a new sorted array reference to ensure DataGrid updates
      const sortedAccounts = [...processedAccounts].sort((a, b) =>
        getDisplayName(a).localeCompare(getDisplayName(b))
      );
      setAccounts(sortedAccounts);

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
      // Log the object *before* stringify
      console.log(
        `Payload object before stringify:`,
        JSON.parse(JSON.stringify(accountDetails)) // Deep copy for logging
      );

      // Log the stringified version *just before* sending
      const bodyString = JSON.stringify(accountDetails);
      console.log(`Stringified body being sent:`, bodyString);

      const result = await callApi(endpoint, {
        method: method,
        body: bodyString,
      });
      console.log(`Save account result for ID ${accountId}:`, result);

      notify(`Account details saved successfully!`, "success");
      handleCloseAccountModal();
      // Ensure data is refetched after saving
      await fetchAll();
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
    // console.log(
    //   `formatCurrency received: ${milliunits} (Type: ${typeof milliunits})`
    // );
    if (milliunits == null || isNaN(milliunits)) {
      // console.log("formatCurrency returning N/A due to null or NaN input.");
      return "N/A";
    }
    try {
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(milliunits / 1000);
      // console.log(`formatCurrency output: ${formatted}`); // Optional: log output too
      return formatted;
    } catch (e) {
      console.error(`Error formatting currency for value ${milliunits}:`, e);
      return "Error"; // Return distinct error string
    }
  };

  const formatPercent = (value) => {
    console.log(`formatPercent received: ${value} (Type: ${typeof value})`); // Add log
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
        // Just return the name, which includes the YNAB emoji
        return <Typography>{getDisplayName(params.row)}</Typography>;
      },
    },
    {
      field: "account_type",
      headerName: "Type",
      minWidth: 120,
      flex: 1,
      valueGetter: (value, row) => {
        return row?.account_type ?? "N/A";
      },
    },
    {
      field: "balance",
      headerName: "Balance",
      type: "number",
      minWidth: 130,
      flex: 1,
      valueFormatter: (value) => {
        // Log the value received by the formatter
        // console.log("ValueFormatter received value:", value);
        // Use the existing formatCurrency function
        return formatCurrency(value ?? null);
      },
      align: "right",
      headerAlign: "right",
    },
    {
      field: "allocation_liquid_milliunits",
      headerName: "Liquid",
      type: "number",
      width: 100,
      valueGetter: (value, row) => row?.allocation_liquid_milliunits,
      valueFormatter: (value) => formatCurrency(value ?? null),
      align: "right",
      headerAlign: "right",
    },
    {
      field: "allocation_frozen_milliunits",
      headerName: "Frozen",
      type: "number",
      width: 100,
      valueGetter: (value, row) => row?.allocation_frozen_milliunits,
      valueFormatter: (value) => formatCurrency(value ?? null),
      align: "right",
      headerAlign: "right",
    },
    {
      field: "allocation_deep_freeze_milliunits",
      headerName: "Deep Freeze",
      type: "number",
      width: 110,
      valueGetter: (value, row) => row?.allocation_deep_freeze_milliunits,
      valueFormatter: (value) => formatCurrency(value ?? null),
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
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenAddModal}
        >
          Add Manual Account
        </Button>
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

      {(showEditModal || showAddModal) && (
        <>
          <AccountFormModal
            open={showEditModal || showAddModal}
            onClose={handleCloseAccountModal}
            account={selectedAccount}
            banks={banks}
            accountTypes={accountTypes}
            onSave={handleSaveAccount}
          />
        </>
      )}
    </Box>
  );
}

export default AccountsPage;
