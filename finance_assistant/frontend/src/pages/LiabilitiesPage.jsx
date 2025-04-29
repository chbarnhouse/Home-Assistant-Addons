import React, { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import AddIcon from "@mui/icons-material/Add";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { DataGrid } from "@mui/x-data-grid";
import Alert from "@mui/material/Alert";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { useSnackbar } from "../context/SnackbarContext";
import { fetchAllData, callApi } from "../utils/api"; // Import the API utility functions

// Import Modals
import AddLiabilityModal from "../components/AddLiabilityModal";
import EditLiabilityModal from "../components/EditLiabilityModal";

// Define API endpoint
const LIABILITIES_API = "liabilities";

// Helper to format currency
const formatCurrency = (value) => {
  if (value == null || value === undefined || isNaN(value)) return "N/A";
  // Liabilities are often negative, show absolute value
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
};

// Helper to format dates
const formatDate = (dateString) => {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Invalid date";
    // Use consistent date format
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Invalid date";
  }
};

// Helper to format percentage
const formatPercentage = (value) => {
  if (value == null || isNaN(value)) return "N/A";
  return `${(value * 100).toFixed(2)}%`; // Assuming value is a decimal like 0.05
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

  const { notify } = useSnackbar();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAllData();
      console.log("Received all_data for liabilities page:", data);

      if (!data || typeof data !== "object") {
        throw new Error("Invalid data format received from API");
      }

      const liabilitiesArray = Array.isArray(data.liabilities)
        ? data.liabilities
        : [];
      const banksArray = Array.isArray(data.banks) ? data.banks : [];
      const typesArray = Array.isArray(data.liability_types)
        ? data.liability_types
        : [];

      console.log("Raw liabilities data:", liabilitiesArray);

      // Process liabilities for DataGrid
      const processedLiabilities = liabilitiesArray.map((liability, index) => {
        const liabObj = liability || {};
        const isYnab = !!liabObj.is_ynab;
        let currentBalance = null;

        // YNAB balance is in milliunits and negative
        if (isYnab && typeof liabObj.balance === "number") {
          currentBalance = liabObj.balance / 1000.0;
        } else if (typeof liabObj.value === "number") {
          currentBalance = liabObj.value; // Manual liabilities might use 'value'
        } else if (typeof liabObj.current_value === "number") {
          currentBalance = liabObj.current_value;
        }

        // Find type name from ID
        const typeObj = typesArray.find((t) => t.id === liabObj.type_id);
        const typeName = typeObj ? typeObj.name : liabObj.type || "Unknown"; // Fallback to old 'type' field or 'Unknown'

        // Find bank name from ID (assuming banks are {id, name})
        const bankObj = banksArray.find((b) => b.id === liabObj.bank_id); // Use bank_id if available
        const bankName = bankObj ? bankObj.name : liabObj.bank || "N/A"; // Fallback to 'bank' field or N/A

        return {
          id: liabObj.id || `manual-liab-${Date.now()}-${index}`,
          name: liabObj.name || `Liability ${index + 1}`,
          type: typeName,
          type_id: liabObj.type_id, // Keep the ID
          bank: bankName,
          bank_id: liabObj.bank_id, // Keep the ID
          balance: currentBalance, // Keep it signed for potential calculations, format in renderCell
          interest_rate: liabObj.interest_rate, // Assuming it's a decimal
          start_date: liabObj.start_date,
          is_ynab: isYnab,
          ...liabObj, // Include other properties
        };
      });

      console.log("Processed liabilities data:", processedLiabilities);
      setLiabilities(processedLiabilities);
      setLiabilityTypes(typesArray);
      setBanks(banksArray); // Banks should be [{id, name}]
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
    // Assuming the modal calls the API and handles success notification
    // Refetch data to get the updated list with the new ID
    fetchData();
    handleCloseAddModal(); // Close modal after adding
  };

  // --- Edit Handlers ---

  const handleOpenEditModal = (liability) => {
    if (liability.is_ynab) {
      // For now, only allow editing manual liabilities fully
      // Could potentially allow editing *some* fields of YNAB ones later
      // Let's allow editing YNAB details like type/bank for now
      console.log("Editing YNAB-linked liability:", liability);
      // notify("Editing some fields of YNAB-linked liabilities is possible.", "info");
    }
    setLiabilityToEdit(liability);
    setIsEditModalOpen(true);
  };
  const handleCloseEditModal = () => {
    setLiabilityToEdit(null);
    setIsEditModalOpen(false);
  };
  const handleUpdateLiability = (updatedLiability) => {
    // Assuming the modal calls the API and handles success notification
    fetchData(); // Refetch data to reflect changes
    handleCloseEditModal();
  };

  // --- Delete Handlers ---

  const handleOpenDeleteConfirm = (liability) => {
    if (liability.is_ynab) {
      notify(
        "Cannot delete YNAB-linked liabilities via this interface.",
        "warning"
      );
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
      // Use the correct API endpoint structure
      await callApi(`${LIABILITIES_API}/${liabilityToDelete.id}`, {
        method: "DELETE",
      });

      notify("Liability deleted successfully!", "success");
      handleCloseDeleteConfirm();
      fetchData(); // Refetch data after deletion
    } catch (err) {
      console.error("Error deleting liability:", err);
      notify(err.message || "Could not delete liability.", "error");
      setIsDeleting(false); // Ensure loading state is reset on error
    }
    // No finally needed here as state is reset in success/error path or close handler
  };
  // --- End Delete Handlers ---

  // Define DataGrid columns
  const columns = [
    {
      field: "name",
      headerName: "Liability Name",
      minWidth: 180,
      flex: 1.5,
    },
    {
      field: "type",
      headerName: "Type",
      minWidth: 150,
      flex: 1,
      // Potentially add renderCell with Autocomplete later if needed
    },
    {
      field: "bank",
      headerName: "Bank/Institution",
      minWidth: 150,
      flex: 1,
      // Potentially add renderCell with Autocomplete later if needed
    },
    {
      field: "balance",
      headerName: "Current Balance",
      type: "number",
      minWidth: 130,
      flex: 1,
      align: "right",
      headerAlign: "right",
      renderCell: (params) => formatCurrency(params.value),
    },
    {
      field: "interest_rate",
      headerName: "Interest Rate",
      type: "number",
      minWidth: 120,
      flex: 0.8,
      align: "right",
      headerAlign: "right",
      renderCell: (params) => formatPercentage(params.value),
    },
    {
      field: "start_date",
      headerName: "Start Date",
      minWidth: 120,
      flex: 0.8,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: "actions",
      headerName: "Actions",
      sortable: false,
      disableColumnMenu: true,
      width: 100,
      align: "center",
      headerAlign: "center",
      renderCell: (params) => (
        <Box>
          <IconButton
            size="small"
            onClick={() => handleOpenEditModal(params.row)}
            // title={params.row.is_ynab ? "Edit YNAB Details" : "Edit Manual Liability"}
            title="Edit Liability"
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => handleOpenDeleteConfirm(params.row)}
            disabled={params.row.is_ynab || isDeleting}
            title={
              params.row.is_ynab
                ? "Cannot delete YNAB liability"
                : "Delete Liability"
            }
            color={params.row.is_ynab ? "default" : "error"}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  return (
    <Box sx={{ height: "calc(100vh - 64px - 48px)", width: "100%" }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography variant="h5">Liabilities</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenAddModal}
        >
          Add Liability
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ height: "calc(100% - 52px)", width: "100%" }}>
        {isLoading ? (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100%",
            }}
          >
            <CircularProgress />
          </Box>
        ) : (
          <DataGrid
            rows={liabilities}
            columns={columns}
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
              sorting: {
                sortModel: [{ field: "balance", sort: "desc" }], // Example sort
              },
            }}
            getRowHeight={() => "auto"} // Adjust if needed for complex cells
            sx={{
              "& .MuiDataGrid-cell": {
                // overflow: 'visible', // Allow content like dropdowns to overflow
                // whiteSpace: 'normal !important', // Allow wrapping
                lineHeight: "normal !important", // Adjust line height
                paddingTop: "8px",
                paddingBottom: "8px",
              },
              "& .MuiDataGrid-columnHeaders": {
                borderBottom: "1px solid rgba(224, 224, 224, 1)",
              },
              border: 0, // Remove outer border if desired
            }}
            // checkboxSelection // Optional: add if needed
            disableRowSelectionOnClick // Recommended if rows have buttons
          />
        )}
      </Paper>

      {/* Add Modal */}
      {isAddModalOpen && (
        <AddLiabilityModal
          open={isAddModalOpen}
          onClose={handleCloseAddModal}
          onAdd={handleAddLiability}
          liabilityTypes={liabilityTypes} // Pass types
          banks={banks} // Pass banks
        />
      )}

      {/* Edit Modal */}
      {isEditModalOpen && liabilityToEdit && (
        <EditLiabilityModal
          open={isEditModalOpen}
          onClose={handleCloseEditModal}
          onUpdate={handleUpdateLiability}
          liability={liabilityToEdit}
          liabilityTypes={liabilityTypes} // Pass types
          banks={banks} // Pass banks
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={isDeleteConfirmOpen}
        onClose={handleCloseDeleteConfirm}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">{"Confirm Deletion"}</DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            Are you sure you want to delete the liability "
            {liabilityToDelete?.name || "this liability"}"? This action cannot
            be undone.
          </DialogContentText>
          {isDeleting && <CircularProgress size={24} sx={{ mt: 2 }} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteConfirm} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirmed}
            color="error"
            autoFocus
            disabled={isDeleting}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default LiabilitiesPage;
