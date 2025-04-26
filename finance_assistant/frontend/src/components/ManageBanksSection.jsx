import React, { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import IconButton from "@mui/material/IconButton";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper"; // Added for section container
import { useSnackbar } from "../context/SnackbarContext";
import { callApi } from "../utils/api";

const BANKS_API_ENDPOINT = "banks";

// Reusable Delete Confirmation (can be kept as is or integrated)
const DeleteConfirmation = ({ bank, onCancel, onConfirm }) => {
  const handleConfirm = useCallback(() => {
    if (onConfirm) onConfirm(bank);
  }, [bank, onConfirm]);
  const handleCancel = useCallback(() => {
    if (onCancel) onCancel();
  }, [onCancel]);

  return (
    <ListItem
      sx={{
        backgroundColor: "rgba(211, 47, 47, 0.1)",
        py: 1,
        display: "block",
      }}
    >
      <Typography variant="body2" sx={{ color: "error.main", mb: 0.5 }}>
        Delete "{bank}"? This cannot be undone.
      </Typography>
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button size="small" sx={{ mr: 1 }} onClick={handleCancel}>
          Cancel
        </Button>
        <Button
          size="small"
          variant="contained"
          color="error"
          onClick={handleConfirm}
        >
          Delete
        </Button>
      </Box>
    </ListItem>
  );
};

DeleteConfirmation.propTypes = {
  bank: PropTypes.string.isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

// Renamed from ManageBanksModal
function ManageBanksSection({ banks = [], onUpdate }) {
  const [banksList, setBanksList] = useState([]);
  const [newBankName, setNewBankName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [deletingBank, setDeletingBank] = useState(null); // Used for loading state during delete
  const [deleteConfirmBank, setDeleteConfirmBank] = useState(null); // Which bank shows confirmation
  const [editingBankName, setEditingBankName] = useState(null); // Which bank is being edited
  const [editBankValue, setEditBankValue] = useState(""); // Current value in edit input
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [error, setError] = useState(null);
  const { notify } = useSnackbar();

  // Effect to synchronize internal list with prop changes
  useEffect(() => {
    // Filter out null/undefined entries and entries without a name property
    const validBanks = banks.filter(
      (bank) => bank && (typeof bank === "string" || bank.name)
    );

    // Sort valid banks alphabetically, handling potential missing names safely
    const sortedBanks = [...validBanks].sort((a, b) => {
      const nameA = (typeof a === "string" ? a : a?.name) || ""; // Default to empty string if name is missing
      const nameB = (typeof b === "string" ? b : b?.name) || ""; // Default to empty string if name is missing
      return nameA.localeCompare(nameB);
    });

    // Normalize to strings after sorting
    const normalizedBanks = sortedBanks.map((bank) =>
      typeof bank === "string" ? bank : bank.name
    );

    setBanksList(normalizedBanks);

    // Reset local states if the bank list changes externally
    setNewBankName("");
    setEditingBankName(null);
    setEditBankValue("");
    setError(null);
    setIsAdding(false);
    setIsSavingEdit(false);
    setDeletingBank(null);
    setDeleteConfirmBank(null);
  }, [banks]); // Depend only on the banks prop

  // --- CRUD Handlers ---

  const handleAddBank = async (event) => {
    event.preventDefault(); // Prevent default form submission
    const trimmedName = newBankName.trim();
    if (!trimmedName) {
      setError("Bank name cannot be empty.");
      return;
    }
    // Case-insensitive check
    if (
      banksList.some((bank) => bank.toLowerCase() === trimmedName.toLowerCase())
    ) {
      setError(`Bank "${trimmedName}" already exists.`);
      return;
    }

    setIsAdding(true);
    setError(null);
    try {
      const result = await callApi(BANKS_API_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ name: trimmedName }),
      });
      // Assuming the API returns the updated list or success state
      if (result && result.success) {
        notify(`Bank "${trimmedName}" added successfully.`, "success");
        setNewBankName(""); // Clear input field
        if (onUpdate) {
          onUpdate(); // Call without arguments to trigger refetch
        }
      } else {
        throw new Error(result?.error || "Failed to add bank.");
      }
    } catch (err) {
      console.error("Error adding bank:", err);
      setError(err.message || "An unknown error occurred.");
      notify("Failed to add bank.", "error");
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditBank = (bank) => {
    setEditingBankName(bank);
    setEditBankValue(bank); // Initialize edit field with current name
    setDeleteConfirmBank(null); // Ensure delete confirmation is hidden
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingBankName(null);
    setEditBankValue("");
    setError(null);
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault(); // Prevent default form submission
    const trimmedValue = editBankValue.trim();
    const originalName = editingBankName;

    if (!trimmedValue) {
      setError("Bank name cannot be empty.");
      return;
    }
    // Case-insensitive check, excluding the original name
    if (
      banksList.some(
        (bank) =>
          bank.toLowerCase() === trimmedValue.toLowerCase() &&
          bank.toLowerCase() !== originalName.toLowerCase()
      )
    ) {
      setError(`Bank "${trimmedValue}" already exists.`);
      return;
    }
    if (trimmedValue === originalName) {
      handleCancelEdit(); // No change, just cancel edit mode
      return;
    }

    setIsSavingEdit(true);
    setError(null);
    try {
      const result = await callApi(BANKS_API_ENDPOINT, {
        method: "PUT",
        body: JSON.stringify({
          originalName: originalName,
          newName: trimmedValue,
        }),
      });
      if (result && result.success) {
        notify(`Bank renamed to "${trimmedValue}" successfully.`, "success");
        setEditingBankName(null); // Exit edit mode
        if (onUpdate) {
          onUpdate(); // Call without arguments to trigger refetch
        }
      } else {
        throw new Error(result?.error || "Failed to rename bank.");
      }
    } catch (err) {
      console.error("Error saving bank edit:", err);
      setError(err.message || "An unknown error occurred.");
      notify("Failed to save changes.", "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteClick = (bank) => {
    setDeleteConfirmBank(bank); // Show confirmation for this bank
    setEditingBankName(null); // Ensure edit mode is off
    setError(null);
  };

  const handleCancelDelete = () => {
    setDeleteConfirmBank(null);
  };

  const handleConfirmDelete = async (bankToDelete) => {
    setDeletingBank(bankToDelete); // Set loading state for this bank
    setDeleteConfirmBank(null); // Hide confirmation
    setError(null);
    try {
      const result = await callApi(BANKS_API_ENDPOINT, {
        method: "DELETE",
        body: JSON.stringify({ name: bankToDelete }),
      });
      if (result && result.success) {
        notify(`Bank "${bankToDelete}" deleted successfully.`, "success");
        if (onUpdate) {
          onUpdate(); // Call without arguments to trigger refetch
        }
      } else {
        throw new Error(result?.error || "Failed to delete bank.");
      }
    } catch (err) {
      console.error("Error deleting bank:", err);
      // Display specific backend error if available
      const detail = err.message?.includes("in use")
        ? "Ensure it's not linked to any accounts or cards."
        : "An unknown error occurred.";
      setError(`Failed to delete bank "${bankToDelete}". ${detail}`);
      notify("Failed to delete bank.", "error");
    } finally {
      setDeletingBank(null); // Clear loading state
    }
  };

  // --- Render Logic ---

  const renderBankItem = (bank) => {
    const isEditingThis = editingBankName === bank;
    const isDeletingThis = deletingBank === bank;
    const showDeleteConfirm = deleteConfirmBank === bank;

    if (showDeleteConfirm) {
      return (
        <DeleteConfirmation
          key={`${bank}-delete-confirm`}
          bank={bank}
          onCancel={handleCancelDelete}
          onConfirm={handleConfirmDelete}
        />
      );
    }

    if (isEditingThis) {
      return (
        <ListItem key={`${bank}-edit`} divider>
          <Box
            component="form"
            onSubmit={handleSaveEdit}
            sx={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            <TextField
              value={editBankValue}
              onChange={(e) => setEditBankValue(e.target.value)}
              variant="outlined"
              size="small"
              fullWidth
              autoFocus
              disabled={isSavingEdit}
              error={!!error} // Show error state on input if there is an error
            />
            <IconButton
              type="submit"
              color="primary"
              disabled={isSavingEdit}
              size="small"
            >
              {isSavingEdit ? (
                <CircularProgress size={20} />
              ) : (
                <SaveIcon fontSize="small" />
              )}
            </IconButton>
            <IconButton
              onClick={handleCancelEdit}
              disabled={isSavingEdit}
              size="small"
            >
              <CancelIcon fontSize="small" />
            </IconButton>
          </Box>
        </ListItem>
      );
    }

    return (
      <ListItem
        key={bank}
        divider
        secondaryAction={
          <Box>
            <IconButton
              edge="end"
              aria-label="edit"
              onClick={() => handleEditBank(bank)}
              size="small"
              sx={{ mr: 0.5 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              edge="end"
              aria-label="delete"
              onClick={() => handleDeleteClick(bank)}
              size="small"
            >
              {isDeletingThis ? (
                <CircularProgress size={20} />
              ) : (
                <DeleteIcon fontSize="small" />
              )}
            </IconButton>
          </Box>
        }
      >
        <ListItemText primary={bank} />
      </ListItem>
    );
  };

  return (
    // Changed from Dialog elements to Paper/Box for inline display
    <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Manage Banks
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Add New Bank Form */}
      <Box
        component="form"
        onSubmit={handleAddBank}
        sx={{ display: "flex", gap: 1, mb: 2 }}
      >
        <TextField
          label="New Bank Name"
          variant="outlined"
          size="small"
          value={newBankName}
          onChange={(e) => setNewBankName(e.target.value)}
          fullWidth
          disabled={isAdding}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={!newBankName.trim() || isAdding}
          startIcon={
            isAdding ? <CircularProgress size={20} color="inherit" /> : null
          }
        >
          Add Bank
        </Button>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Banks List */}
      <List dense sx={{ maxHeight: 300, overflow: "auto" }}>
        {banksList.length === 0 && !error && (
          <ListItem>
            <ListItemText primary="No banks defined yet." />
          </ListItem>
        )}
        {banksList.map(renderBankItem)}
      </List>
    </Paper>
  );
}

// Updated PropTypes
ManageBanksSection.propTypes = {
  banks: PropTypes.array, // List of banks (strings or objects)
  onUpdate: PropTypes.func.isRequired, // Callback with updated list
};

export default ManageBanksSection;
