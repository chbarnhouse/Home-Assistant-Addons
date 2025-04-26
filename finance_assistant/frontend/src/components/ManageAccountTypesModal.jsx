import React, { useState, useEffect } from "react";
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
import { callApi } from "../utils/api";

const ACCOUNT_TYPES_API_ENDPOINT = "account_types"; // Define API endpoint

function ManageAccountTypesModal({
  open,
  onClose,
  accountTypes = [],
  onUpdate,
}) {
  const [newTypeName, setNewTypeName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [deletingType, setDeletingType] = useState(null); // Track which type is being deleted
  const [editingTypeName, setEditingTypeName] = useState(null);
  const [editTypeValue, setEditTypeValue] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [error, setError] = useState(null);

  // Clear error and edit state on close
  useEffect(() => {
    if (!open) {
      setError(null);
      setEditingTypeName(null);
      setEditTypeValue("");
    }
  }, [open]);

  const handleAddType = async () => {
    setError(null);
    const trimmedName = newTypeName.trim();
    if (!trimmedName) {
      setError("Account type name cannot be empty.");
      return;
    }
    // Account types are expected to be strings
    if (accountTypes.includes(trimmedName)) {
      setError(`Account type "${trimmedName}" already exists.`);
      return;
    }

    setIsAdding(true);
    try {
      const result = await callApi(ACCOUNT_TYPES_API_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ name: trimmedName }),
      });

      // Assuming API returns { success: true, types: [...] }
      if (result.success && result.types) {
        onUpdate(result.types);
      } else {
        // Fallback if response format is different
        console.warn("Unexpected response format on add account type", result);
        onUpdate([...accountTypes, trimmedName]); // Optimistic update as fallback
      }
      setNewTypeName("");
    } catch (err) {
      console.error("Error adding account type:", err);
      setError(err.message || "Failed to add account type.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditType = (typeName) => {
    setError(null);
    setEditingTypeName(typeName);
    setEditTypeValue(typeName);
  };

  const handleCancelEdit = () => {
    setError(null);
    setEditingTypeName(null);
    setEditTypeValue("");
  };

  const handleSaveEdit = async () => {
    setError(null);
    const originalName = editingTypeName;
    const newName = editTypeValue.trim();

    if (!newName) {
      setError("Account type name cannot be empty.");
      return;
    }
    if (newName === originalName) {
      handleCancelEdit(); // No change
      return;
    }
    if (accountTypes.includes(newName)) {
      setError(`Account type "${newName}" already exists.`);
      return;
    }

    setIsSavingEdit(true);
    try {
      const result = await callApi(ACCOUNT_TYPES_API_ENDPOINT, {
        method: "PUT",
        body: JSON.stringify({ originalName: originalName, newName: newName }),
      });

      onUpdate(result.types || result); // Update parent state with new list
      handleCancelEdit(); // Exit edit mode
    } catch (err) {
      console.error("Error updating account type:", err);
      setError(err.message || "Failed to update account type.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteType = async (typeName) => {
    setError(null);
    if (
      window.confirm(
        `Are you sure you want to delete the account type "${typeName}"?`
      )
      // TODO: Add check to prevent deleting if type is in use by an account?
    ) {
      setDeletingType(typeName);
      try {
        const result = await callApi(ACCOUNT_TYPES_API_ENDPOINT, {
          method: "DELETE",
          body: JSON.stringify({ name: typeName }),
        });

        // Assuming API returns { success: true, types: [...] }
        if (result.success && result.types) {
          onUpdate(result.types);
        } else {
          console.warn(
            "Unexpected response format on delete account type",
            result
          );
          onUpdate(accountTypes.filter((t) => t !== typeName)); // Optimistic fallback
        }
      } catch (err) {
        console.error("Error deleting account type:", err);
        setError(err.message || "Failed to delete account type.");
      } finally {
        setDeletingType(null);
      }
    }
  };

  // Disable actions if busy
  const isBusy =
    isAdding || isSavingEdit || !!deletingType || !!editingTypeName;
  const canClose =
    !isAdding && !isSavingEdit && !deletingType && !editingTypeName;

  return (
    <Dialog
      open={open}
      onClose={canClose ? onClose : undefined}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>Manage Account Types</DialogTitle>
      <DialogContent dividers>
        {/* Error Display Area */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Add New Type Section - Disable if editing */}
        <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
          <TextField
            label="New Account Type Name"
            variant="outlined"
            size="small"
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            sx={{ flexGrow: 1, mr: 1 }}
            disabled={isAdding || !!editingTypeName}
          />
          <Button
            onClick={handleAddType}
            variant="contained"
            size="small"
            disabled={isAdding || !!editingTypeName}
            sx={{ position: "relative", minWidth: 64 }}
          >
            {isAdding ? (
              <CircularProgress
                size={20}
                sx={{ color: "white", position: "absolute" }}
              />
            ) : (
              "Add"
            )}
          </Button>
        </Box>

        <Divider sx={{ my: 1 }} />

        {/* Existing Types List */}
        <List dense>
          {accountTypes.length === 0 ? (
            <ListItem>
              <ListItemText primary="No account types defined." />
            </ListItem>
          ) : (
            [...accountTypes]
              .sort((a, b) => a.localeCompare(b)) // Simple string sort
              .map((typeName) => {
                const isBeingDeleted = deletingType === typeName;
                const isBeingEdited = editingTypeName === typeName;
                return (
                  <ListItem
                    key={typeName}
                    sx={{
                      pl: isBeingEdited ? 1 : undefined,
                      pr: isBeingEdited ? 1 : undefined,
                    }}
                  >
                    {isBeingEdited ? (
                      // --- Editing View ---
                      <Box
                        sx={{
                          display: "flex",
                          width: "100%",
                          alignItems: "center",
                        }}
                      >
                        <TextField
                          value={editTypeValue}
                          onChange={(e) => setEditTypeValue(e.target.value)}
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
                      // --- Normal View ---
                      <>
                        <ListItemText primary={typeName} />
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
                                onClick={() => handleEditType(typeName)}
                                disabled={isBusy}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                edge="end"
                                aria-label="delete"
                                size="small"
                                onClick={() => handleDeleteType(typeName)}
                                disabled={isBusy}
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

ManageAccountTypesModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  accountTypes: PropTypes.arrayOf(PropTypes.string).isRequired,
  onUpdate: PropTypes.func.isRequired,
};

export default ManageAccountTypesModal;
