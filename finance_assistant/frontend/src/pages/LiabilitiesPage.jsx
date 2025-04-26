import React, { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import IconButton from "@mui/material/IconButton";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SettingsIcon from "@mui/icons-material/Settings"; // Icon for Manage Types
import Chip from "@mui/material/Chip"; // To distinguish YNAB vs Manual
import Alert from "@mui/material/Alert";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { DataGrid } from "@mui/x-data-grid"; // Import DataGrid
import { useSnackbar } from "../context/SnackbarContext";
import { fetchAllData, callApi } from "../utils/api"; // Import the API utility functions

// Import Modals
import AddLiabilityModal from "../components/AddLiabilityModal";
import EditLiabilityModal from "../components/EditLiabilityModal";
import ManageLiabilityTypesModal from "../components/ManageLiabilityTypesModal"; // Import Manage Types Modal

// Helper to format currency
const formatCurrency = (value) => {
  if (value == null || value === undefined) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

// Helper to format dates
const formatDate = (dateString) => {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Invalid date";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Invalid date";
  }
};

// Helper to format liability type name
const formatLiabilityTypeName = (typeName) => {
  if (!typeName) return "Uncategorized";
  return typeName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase());
};

function LiabilitiesPage() {
  const [liabilities, setLiabilities] = useState([]);
  const [liabilityTypes, setLiabilityTypes] = useState([]); // For modal dropdowns
  const [banks, setBanks] = useState([]); // For modal dropdowns
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [liabilityToEdit, setLiabilityToEdit] = useState(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [liabilityToDelete, setLiabilityToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false); // For delete loading state
  const [isManageTypesModalOpen, setIsManageTypesModalOpen] = useState(false); // State for Manage Types modal

  const { notify } = useSnackbar();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAllData();
      console.log("Fetched liabilities data from all_data:", data);

      // IMPORTANT: Add defensive checks to ensure data exists and has expected shape
      if (!data || typeof data !== "object") {
        throw new Error("Invalid data format received from API");
      }

      // Ensure all liabilities have a unique ID for DataGrid, safely handle possible undefined values
      const liabilitiesArray = Array.isArray(data.liabilities)
        ? data.liabilities
        : [];

      console.log("Raw liabilities data:", liabilitiesArray);

      // Process the liabilities data before setting state
      const processedLiabilities = processLiabilities(liabilitiesArray);
      console.log("Processed liabilities data:", processedLiabilities);
      setLiabilities(processedLiabilities);

      // Add defensive checks for all dependent data
      setLiabilityTypes(
        Array.isArray(data.liability_types)
          ? data.liability_types
          : ["Loan", "Other Manual"]
      );

      // Safely extract unique bank names from accounts/liabilities/credit_cards
      const accountBanks = Array.isArray(data.accounts)
        ? data.accounts.map((a) => a?.bank).filter(Boolean)
        : [];

      const liabilityBanks = Array.isArray(data.liabilities)
        ? data.liabilities.map((l) => l?.bank).filter(Boolean)
        : [];

      const creditCardBanks = Array.isArray(data.credit_cards)
        ? data.credit_cards.map((c) => c?.bank).filter(Boolean)
        : [];

      const uniqueBanks = [
        ...new Set([...accountBanks, ...liabilityBanks, ...creditCardBanks]),
      ]
        .sort()
        .map((name) => ({ name })); // Format for Select component

      setBanks(uniqueBanks || []);
    } catch (err) {
      console.error("Error fetching liabilities data:", err);
      setError(err.message || "Failed to fetch liabilities. Please try again.");
      notify("Failed to load liabilities data.", "error");
      setLiabilities([]);
      setLiabilityTypes([]);
      setBanks([]);
    } finally {
      setIsLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Add Handlers ---
  const handleOpenAddModal = () => setIsAddModalOpen(true);
  const handleCloseAddModal = () => setIsAddModalOpen(false);
  const handleAddLiability = (newLiability) => {
    // Assuming backend returns the full new liability object including id
    setLiabilities((prev) => [...prev, newLiability.liability || newLiability]); // Adapt based on API response structure
    // Notification is handled within the modal on success
    // Optionally refetch: fetchData();
  };

  // --- Edit Handlers ---
  const handleOpenEditModal = (liability) => {
    if (liability.is_ynab) {
      notify(
        "Editing YNAB-linked liabilities directly is not yet supported.",
        "info"
      );
      // TODO: Potentially allow editing manual *fields* on YNAB items in the future
      return;
    }
    setLiabilityToEdit(liability);
    setIsEditModalOpen(true);
  };
  const handleCloseEditModal = () => {
    setLiabilityToEdit(null);
    setIsEditModalOpen(false);
  };
  const handleUpdateLiability = (updatedLiability) => {
    setLiabilities((prev) =>
      prev.map((l) => (l.id === updatedLiability.id ? updatedLiability : l))
    );
    // Notification handled within modal
  };

  // --- Delete Handlers ---
  const handleOpenDeleteConfirm = (liability) => {
    if (liability.is_ynab) {
      notify("Cannot delete YNAB-linked liabilities.", "warning");
      return;
    }
    setLiabilityToDelete(liability);
    setIsDeleteConfirmOpen(true);
  };

  const handleCloseDeleteConfirm = () => {
    setLiabilityToDelete(null);
    setIsDeleteConfirmOpen(false);
    setIsDeleting(false);
  };

  const handleDeleteConfirmed = async () => {
    if (!liabilityToDelete || liabilityToDelete.is_ynab) return;

    setIsDeleting(true);
    try {
      await callApi(`liabilities/${liabilityToDelete.id}`, {
        method: "DELETE",
      });

      setLiabilities((prev) =>
        prev.filter((l) => l.id !== liabilityToDelete.id)
      );
      notify("Liability deleted successfully!", "success");
      handleCloseDeleteConfirm();
    } catch (err) {
      console.error("Error deleting liability:", err);
      notify(err.message || "Could not delete liability.", "error");
      handleCloseDeleteConfirm(); // Close dialog even on error for now
    } finally {
      // Ensure loading state is reset even if error occurs before fetch finishes
      setIsDeleting(false);
    }
  };
  // --- End Delete Handlers ---

  // --- Manage Types Handlers ---
  const handleOpenManageTypesModal = () => setIsManageTypesModalOpen(true);
  const handleCloseManageTypesModal = () => setIsManageTypesModalOpen(false);
  const handleUpdateLiabilityTypes = (updatedTypes) => {
    // Update the state used by Add/Edit modals
    setLiabilityTypes(updatedTypes);
    // Optionally refetch all data if type changes could impact display
    // fetchData();
  };

  // Function to process liabilities data for presentation
  const processLiabilities = (liabilities) => {
    console.log("Processing liabilities with data:", liabilities);

    return liabilities.map((liability, index) => {
      console.log(`Processing liability #${index}:`, liability);

      // For YNAB liabilities, data comes in milliunits (divide by 1000 to get dollars)
      const isYnab = !!liability.is_ynab;

      // Handle balance - different fields for different liability types
      let currentBalance = null;
      if (isYnab) {
        if (typeof liability.balance === "number") {
          currentBalance = Math.abs(liability.balance) / 1000;
        } else if (typeof liability.cleared_balance === "number") {
          currentBalance = Math.abs(liability.cleared_balance) / 1000;
        }
      } else {
        if (typeof liability.current_balance === "number") {
          currentBalance = liability.current_balance;
        } else if (typeof liability.value === "number") {
          currentBalance = Math.abs(liability.value);
        }
      }

      // Handle original amount
      let originalAmount = null;
      if (isYnab) {
        if (typeof liability.original_balance === "number") {
          originalAmount = Math.abs(liability.original_balance) / 1000;
        } else if (typeof liability.starting_balance === "number") {
          originalAmount = Math.abs(liability.starting_balance) / 1000;
        } else if (currentBalance !== null) {
          originalAmount = currentBalance; // Fallback
        }
      } else {
        if (typeof liability.original_amount === "number") {
          originalAmount = liability.original_amount;
        } else if (typeof liability.value === "number") {
          originalAmount = Math.abs(liability.value);
        } else if (currentBalance !== null) {
          originalAmount = currentBalance; // Fallback
        }
      }

      // Handle interest rate
      let interestRate = null;
      if (typeof liability.interest_rate === "number") {
        interestRate =
          liability.interest_rate < 1
            ? liability.interest_rate * 100
            : liability.interest_rate;
      } else if (typeof liability.apr === "number") {
        interestRate = liability.apr < 1 ? liability.apr * 100 : liability.apr;
      }

      // Handle minimum payment
      let minimumPayment = null;
      if (isYnab) {
        if (typeof liability.minimum_payment === "number") {
          minimumPayment = Math.abs(liability.minimum_payment) / 1000;
        } else if (typeof liability.min_payment === "number") {
          minimumPayment = Math.abs(liability.min_payment) / 1000;
        }
      } else {
        if (typeof liability.minimum_payment === "number") {
          minimumPayment = liability.minimum_payment;
        } else if (typeof liability.min_payment === "number") {
          minimumPayment = liability.min_payment;
        }
      }

      // Create the final object with uniform field names
      const result = {
        id:
          liability.id ||
          liability.account_id ||
          `liability-${Date.now()}-${index}`,
        name:
          liability.name ||
          liability.account_name ||
          `Unnamed Liability ${index + 1}`,
        type: (
          liability.type ||
          liability.account_type ||
          "otherLiability"
        ).toString(),
        institution: liability.institution || liability.bank || "N/A",
        is_ynab: isYnab,
        originalAmount,
        currentBalance,
        interestRate,
        minimumPayment,
        paymentDueDate:
          liability.payment_due_date ||
          liability.next_payment_date ||
          liability.due_date ||
          null,
      };

      console.log(`Final processed liability #${index}:`, result);
      return result;
    });
  };

  // Define columns for DataGrid with simplified structure
  const columns = [
    {
      field: "name",
      headerName: "Name",
      minWidth: 200,
      flex: 1.5,
      renderCell: (params) => {
        if (!params || !params.row) return "N/A";
        return (
          <Box sx={{ display: "flex", alignItems: "center" }}>
            {params.row.name || "Unnamed Liability"}
            {params.row.is_ynab && (
              <Chip
                label="YNAB"
                size="small"
                color="primary"
                variant="outlined"
                sx={{ ml: 1, height: 20 }}
              />
            )}
          </Box>
        );
      },
    },
    {
      field: "type",
      headerName: "Type",
      minWidth: 150,
      flex: 1,
      valueFormatter: (params) => {
        if (!params || params.value == null) return "Other";
        return formatLiabilityTypeName(params.value);
      },
    },
    {
      field: "institution",
      headerName: "Bank/Institution",
      minWidth: 150,
      flex: 1,
    },
    {
      field: "originalAmount",
      headerName: "Original Amount",
      minWidth: 150,
      flex: 1,
      align: "right",
      headerAlign: "right",
      renderCell: (params) => {
        if (!params || !params.row || params.row.originalAmount == null)
          return "N/A";
        return formatCurrency(params.row.originalAmount);
      },
    },
    {
      field: "currentBalance",
      headerName: "Current Balance",
      minWidth: 150,
      flex: 1,
      align: "right",
      headerAlign: "right",
      renderCell: (params) => {
        if (!params || !params.row || params.row.currentBalance == null)
          return "N/A";
        return formatCurrency(params.row.currentBalance);
      },
    },
    {
      field: "interestRate",
      headerName: "Interest Rate",
      minWidth: 150,
      flex: 1,
      align: "right",
      headerAlign: "right",
      renderCell: (params) => {
        if (!params || !params.row || params.row.interestRate == null)
          return "N/A";
        return `${params.row.interestRate.toFixed(2)}%`;
      },
    },
    {
      field: "minimumPayment",
      headerName: "Minimum Payment",
      minWidth: 150,
      flex: 1,
      align: "right",
      headerAlign: "right",
      renderCell: (params) => {
        if (!params || !params.row || params.row.minimumPayment == null)
          return "N/A";
        return formatCurrency(params.row.minimumPayment);
      },
    },
    {
      field: "paymentDueDate",
      headerName: "Payment Due Date",
      minWidth: 150,
      flex: 1,
      align: "right",
      headerAlign: "right",
      renderCell: (params) => {
        if (!params || !params.row || !params.row.paymentDueDate) return "N/A";
        return formatDate(params.row.paymentDueDate);
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 120,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      align: "center",
      renderCell: (params) => {
        // Defensive check to ensure params and params.row exist
        if (!params || !params.row) return null;

        const isRowYnab = params.row.is_ynab;
        return (
          <Box>
            <IconButton
              onClick={() => handleOpenEditModal(params.row)}
              disabled={isRowYnab}
              title={isRowYnab ? "Cannot edit YNAB liabilities" : "Edit"}
              size="small"
              sx={{ mr: 1 }}
            >
              <EditIcon
                fontSize="small"
                color={isRowYnab ? "disabled" : "primary"}
              />
            </IconButton>
            <IconButton
              onClick={() => handleOpenDeleteConfirm(params.row)}
              disabled={isRowYnab}
              title={isRowYnab ? "Cannot delete YNAB liabilities" : "Delete"}
              size="small"
            >
              <DeleteIcon
                fontSize="small"
                color={isRowYnab ? "disabled" : "error"}
              />
            </IconButton>
          </Box>
        );
      },
    },
  ];

  return (
    <Box sx={{ height: "calc(100vh - 160px)", width: "100%", p: 3 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography variant="h4">Liabilities</Typography>
        <Box>
          <Button
            variant="contained"
            onClick={handleOpenAddModal}
            sx={{ mr: 2 }}
          >
            Add Manual Liability
          </Button>
          <Button
            onClick={handleOpenManageTypesModal}
            size="small"
            startIcon={<SettingsIcon />}
          >
            Manage Types
          </Button>
        </Box>
      </Box>

      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", my: 5 }}>
          <CircularProgress />
        </Box>
      )}
      {error && (
        <Alert severity="error" sx={{ my: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* DataGrid instead of Table */}
      {!isLoading && !error && (
        <Box sx={{ height: "calc(100% - 50px)", width: "100%" }}>
          <DataGrid
            rows={liabilities}
            columns={columns}
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: {
                paginationModel: { pageSize: 25, page: 0 },
              },
              sorting: {
                sortModel: [{ field: "name", sort: "asc" }],
              },
            }}
            onError={(error) => {
              console.error("DataGrid error:", error);
            }}
            disableRowSelectionOnClick
            getRowHeight={() => "auto"}
            getEstimatedRowHeight={() => 60}
            localeText={{
              noRowsLabel:
                liabilities.length === 0
                  ? error
                    ? "Liabilities could not be loaded."
                    : "No liabilities found."
                  : "No rows",
            }}
          />
        </Box>
      )}

      {/* Modals */}
      <AddLiabilityModal
        open={isAddModalOpen}
        onClose={handleCloseAddModal}
        onAdd={handleAddLiability}
        liabilityTypes={liabilityTypes}
        banks={banks}
      />

      {liabilityToEdit && (
        <EditLiabilityModal
          open={isEditModalOpen}
          onClose={handleCloseEditModal}
          liability={liabilityToEdit}
          onUpdate={handleUpdateLiability}
          liabilityTypes={liabilityTypes}
          banks={banks}
        />
      )}

      <ManageLiabilityTypesModal
        open={isManageTypesModalOpen}
        onClose={handleCloseManageTypesModal}
        liabilityTypes={liabilityTypes}
        onUpdate={handleUpdateLiabilityTypes}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={isDeleteConfirmOpen}
        onClose={handleCloseDeleteConfirm}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">
          Confirm Liability Deletion
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            Are you sure you want to delete "
            {liabilityToDelete?.name || "this liability"}"?
            <br />
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCloseDeleteConfirm}
            color="primary"
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirmed}
            color="error"
            autoFocus
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default LiabilitiesPage;
