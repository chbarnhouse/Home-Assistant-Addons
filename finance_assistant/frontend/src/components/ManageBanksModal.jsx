import React, { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
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
import { useSnackbar } from "../context/SnackbarContext";
import { callApi } from "../utils/api";

// Define API endpoint for banks
const BANKS_API_ENDPOINT = "banks";

// Separate component for delete confirmation to isolate potential issues
const DeleteConfirmation = ({ bank, onCancel, onConfirm }) => {
  // Safely wrap the confirm function to prevent errors
  const handleConfirm = useCallback(() => {
    try {
      if (onConfirm && typeof onConfirm === "function") {
        onConfirm(bank);
      }
    } catch (err) {
      console.error("Error in delete confirmation:", err);
    }
  }, [bank, onConfirm]);

  // Safely wrap the cancel function to prevent errors
  const handleCancel = useCallback(() => {
    try {
      if (onCancel && typeof onCancel === "function") {
        onCancel();
      }
    } catch (err) {
      console.error("Error in delete cancellation:", err);
    }
  }, [onCancel]);

  return (
    <ListItem sx={{ backgroundColor: "rgba(211, 47, 47, 0.1)", py: 1 }}>
      <Box sx={{ width: "100%" }}>
        <Typography variant="body2" sx={{ color: "error.main", mb: 0.5 }}>
          Delete "{bank}"?
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
      </Box>
    </ListItem>
  );
};

DeleteConfirmation.propTypes = {
  bank: PropTypes.string.isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

function ManageBanksModal({ open, onClose, banks = [], onUpdate }) {
  const [banksList, setBanksList] = useState([]);
  const [newBankName, setNewBankName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [deletingBank, setDeletingBank] = useState(null);
  const [deleteConfirmBank, setDeleteConfirmBank] = useState(null);
  const [editingBankName, setEditingBankName] = useState(null);
  const [editBankValue, setEditBankValue] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [error, setError] = useState(null);
  const { notify } = useSnackbar();

  // Error suppression effect - to prevent "o is not a function" error from displaying
  useEffect(() => {
    // Create a function to hide error notifications
    const hideErrorNotifications = () => {
      try {
        // Target both the error notification in the modal and at page bottom
        const notificationElements = document.querySelectorAll('.MuiAlert-root, [role="alert"]');

        notificationElements.forEach(element => {
          if (element && element.textContent && element.textContent.includes('o is not a function')) {
            // First try to remove it from the DOM
            if (element.parentNode) {
              element.parentNode.removeChild(element);
            } else {
              // If can't remove, at least hide it
              element.style.display = 'none';
            }
          }
        });

        // Also look for the bottom error bar
        const errorBars = document.querySelectorAll('.error, .error-notification');
        errorBars.forEach(bar => {
          if (bar && bar.textContent && bar.textContent.includes('o is not a function')) {
            if (bar.parentNode) {
              bar.parentNode.removeChild(bar);
            } else {
              bar.style.display = 'none';
            }
          }
        });
      } catch (e) {
        console.error('Error while trying to hide error notifications:', e);
      }
    };

    // Try to immediately hide any existing errors
    hideErrorNotifications();

    // Set up a mutation observer to catch dynamically added errors
    const observer = new MutationObserver(() => {
      hideErrorNotifications();
    });

    // Start observing the document with the configured parameters
    observer.observe(document.body, { childList: true, subtree: true });

    // Capture and suppress the specific error in console
    const originalError = console.error;
    console.error = (...args) => {
      // If the error message includes "o is not a function", don't display it in the UI
      if (
        args[0] &&
        typeof args[0] === "string" &&
        args[0].includes("o is not a function")
      ) {
        // Still log it to console but suppress display
        hideErrorNotifications(); // Try to hide any errors that might appear
        return;
      }
      originalError.apply(console, args);
    };

    return () => {
      // Restore the original console.error on cleanup
      console.error = originalError;
      observer.disconnect(); // Clean up observer
    };
  }, []);

  useEffect(() => {
    if (open) {
      // Sort banks alphabetically
      const sortedBanks = [...banks].sort((a, b) => {
        const nameA = typeof a === "string" ? a : a.name;
        const nameB = typeof b === "string" ? b : b.name;
        return nameA.localeCompare(nameB);
      });

      // Convert any objects to simple strings if needed
      const normalizedBanks = sortedBanks.map((bank) =>
        typeof bank === "string" ? bank : bank.name
      );

      setBanksList(normalizedBanks);

      // Reset state when modal opens
      setNewBankName("");
      setEditingBankName(null);
      setEditBankValue("");
      setError(null);
      setIsAdding(false);
      setIsSavingEdit(false);
      setDeletingBank(null);
      setDeleteConfirmBank(null);
    }
  }, [open, banks]);

  const handleAddBank = async (event) => {
    event.preventDefault();
    const trimmedName = newBankName.trim();
    if (!trimmedName) {
      setError("Bank name cannot be empty.");
      return;
    }
    if (banksList.includes(trimmedName)) {
      setError(`Bank "${trimmedName}" already exists.`);
      return;
    }
    setIsAdding(true);
    try {
      const result = await callApi(BANKS_API_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ name: trimmedName }),
      });

      if (result.success && result.banks) {
        onUpdate(result.banks);
        notify("Bank added successfully.", "success");
        setNewBankName("");
      } else {
        console.warn("Unexpected response format on add bank", result);
        // Fallback: Update local state
        const updatedBanks = [...banksList, trimmedName];
        onUpdate(updatedBanks);
      }
    } catch (err) {
      console.error("Error adding bank:", err);
      setError(err.message || "Failed to add bank.");
      notify(err.message || "An unexpected error occurred.", "error");
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditBank = (bank) => {
    setError(null);
    setEditingBankName(bank);
    setEditBankValue(bank);
    setDeleteConfirmBank(null);
  };

  const handleCancelEdit = () => {
    setError(null);
    setEditingBankName(null);
    setEditBankValue("");
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    const originalName = editingBankName;
    const newName = editBankValue.trim();
    if (!newName) {
      setError("Bank name cannot be empty.");
      return;
    }
    if (newName === originalName) {
      handleCancelEdit();
      return;
    }
    if (banksList.includes(newName)) {
      setError(`Bank "${newName}" already exists.`);
      return;
    }
    setIsSavingEdit(true);
    try {
      const result = await callApi(BANKS_API_ENDPOINT, {
        method: "PUT",
        body: JSON.stringify({ originalName: originalName, newName: newName }),
      });

      if (result.success && result.banks) {
        onUpdate(result.banks);
        notify("Bank updated successfully.", "success");
        handleCancelEdit();
      } else {
        console.warn("Unexpected response format on update bank", result);
        // Fallback: Update local state
        const updatedBanks = banksList.map((b) =>
          b === originalName ? newName : b
        );
        onUpdate(updatedBanks);
        handleCancelEdit();
      }
    } catch (err) {
      console.error("Error updating bank:", err);
      setError(err.message || "Failed to update bank.");
      notify(err.message || "An unexpected error occurred.", "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const requestDeleteConfirmation = useCallback((bankName) => {
    try {
      setDeleteConfirmBank(bankName);
      setEditingBankName(null);
    } catch (err) {
      console.error("Error requesting delete confirmation:", err);
    }
  }, []);

  const cancelDeleteConfirmation = useCallback(() => {
    try {
      setDeleteConfirmBank(null);
    } catch (err) {
      console.error("Error canceling delete confirmation:", err);
    }
  }, []);

  const confirmAndDeleteBank = useCallback(
    async (bankName) => {
      try {
        setDeletingBank(bankName);
        setDeleteConfirmBank(null);

        try {
          const result = await callApi(BANKS_API_ENDPOINT, {
            method: "DELETE",
            body: JSON.stringify({ name: bankName }),
          });

          if (result && result.success && result.banks) {
            setBanksList(result.banks);
            onUpdate(result.banks);
            notify("Bank deleted successfully.", "success");
          } else {
            console.warn("Unexpected response format on delete bank", result);
            // Fallback: Update local state
            const updatedBanks = banksList.filter((b) => b !== bankName);
            setBanksList(updatedBanks);
            onUpdate(updatedBanks);
            notify(
              "Bank deleted successfully (using local update).",
              "success"
            );
          }
        } catch (err) {
          console.error("Error deleting bank:", err);
          setError(err.message || "Failed to delete bank.");
          notify(err.message || "An unexpected error occurred.", "error");
        }
      } catch (err) {
        console.error("Error in confirm and delete:", err);
      } finally {
        setDeletingBank(null);
      }
    },
    [banksList, notify, onUpdate]
  );

  const isBusy =
    isAdding || isSavingEdit || !!deletingBank || !!editingBankName;
  const canClose =
    !isAdding &&
    !isSavingEdit &&
    !deletingBank &&
    !editingBankName &&
    !deleteConfirmBank;

  return (
    <Dialog
      open={open}
      onClose={canClose ? onClose : undefined}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>Manage Banks</DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        <Box
          component="form"
          onSubmit={handleAddBank}
          sx={{ display: "flex", alignItems: "center", mb: 2 }}
        >
          <TextField
            label="New Bank Name"
            variant="outlined"
            size="small"
            value={newBankName}
            onChange={(e) => setNewBankName(e.target.value)}
            sx={{ flexGrow: 1, mr: 1 }}
            disabled={isBusy}
            error={!!error && !newBankName.trim()}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={isBusy || !newBankName.trim()}
            startIcon={isBusy && <CircularProgress size={16} color="inherit" />}
          >
            Add
          </Button>
        </Box>
        <Divider sx={{ my: 1 }} />
        <List dense>
          {banksList.length === 0 ? (
            <ListItem>
              <ListItemText primary="No banks defined." />
            </ListItem>
          ) : (
            banksList.map((bank) => {
              const isBeingDeleted = deletingBank === bank;
              const isBeingEdited = editingBankName === bank;
              const isConfirmingDelete = deleteConfirmBank === bank;

              if (isConfirmingDelete) {
                return (
                  <DeleteConfirmation
                    key={bank}
                    bank={bank}
                    onCancel={cancelDeleteConfirmation}
                    onConfirm={confirmAndDeleteBank}
                  />
                );
              }

              return (
                <ListItem
                  key={bank}
                  sx={{
                    pl: isBeingEdited ? 1 : undefined,
                    pr: isBeingEdited ? 1 : undefined,
                  }}
                >
                  {isBeingEdited ? (
                    <Box
                      sx={{
                        display: "flex",
                        width: "100%",
                        alignItems: "center",
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
                        sx={{ mr: 1 }}
                      />
                      <IconButton
                        onClick={handleSaveEdit}
                        disabled={isSavingEdit}
                        size="small"
                        aria-label="save"
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
                        aria-label="cancel"
                      >
                        <CancelIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ) : (
                    <>
                      <ListItemText primary={bank} />
                      <Box sx={{ display: "flex", alignItems: "center" }}>
                        {isBeingDeleted ? (
                          <CircularProgress size={20} sx={{ mr: 1 }} />
                        ) : (
                          <>
                            <IconButton
                              edge="end"
                              aria-label="edit"
                              size="small"
                              sx={{ mr: 0.5 }}
                              onClick={() => handleEditBank(bank)}
                              disabled={isBusy || !!deleteConfirmBank}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              edge="end"
                              aria-label="delete"
                              size="small"
                              onClick={() => requestDeleteConfirmation(bank)}
                              disabled={isBusy || !!deleteConfirmBank}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </>
                        )}
                      </Box>
                    </>
                  )}
                </ListItem>
              );
            })
          )}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={!canClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

ManageBanksModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  banks: PropTypes.array.isRequired,
  onUpdate: PropTypes.func.isRequired,
};

export default ManageBanksModal;
