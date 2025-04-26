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
import Paper from "@mui/material/Paper";
import { useSnackbar } from "../context/SnackbarContext";
import { callApi } from "../utils/api";

const ACCOUNT_TYPES_API_ENDPOINT = "account_types";

// Reusable Delete Confirmation (Similar to Banks)
const DeleteConfirmation = ({ itemType, itemName, onCancel, onConfirm }) => {
  const handleConfirm = useCallback(() => {
    if (onConfirm) onConfirm(itemName);
  }, [itemName, onConfirm]);
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
        Delete {itemType} "{itemName}"? This cannot be undone.
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
  itemType: PropTypes.string.isRequired,
  itemName: PropTypes.string.isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

// Renamed from ManageAccountTypesModal
function ManageAccountTypesSection({ accountTypes = [], onUpdate }) {
  const [typesList, setTypesList] = useState([]);
  const [newTypeName, setNewTypeName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [deletingType, setDeletingType] = useState(null); // Loading state
  const [deleteConfirmType, setDeleteConfirmType] = useState(null); // Show confirmation
  const [editingTypeName, setEditingTypeName] = useState(null); // Current type being edited
  const [editTypeValue, setEditTypeValue] = useState(""); // Edit input value
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [error, setError] = useState(null);
  const { notify } = useSnackbar();

  // Sync internal list with prop changes
  useEffect(() => {
    // Filter out null/undefined entries and entries without a name property
    const validTypes = accountTypes.filter(
      (type) => type && (typeof type === "string" || type.name)
    );

    // Sort valid types alphabetically, handling potential missing names safely
    const sortedTypes = [...validTypes].sort((a, b) => {
      const nameA = (typeof a === "string" ? a : a?.name) || ""; // Default to empty string
      const nameB = (typeof b === "string" ? b : b?.name) || ""; // Default to empty string
      return nameA.localeCompare(nameB);
    });

    // Normalize to strings after sorting
    const normalizedTypes = sortedTypes.map((type) =>
      typeof type === "string" ? type : type.name
    );

    setTypesList(normalizedTypes);

    // Reset local state
    setNewTypeName("");
    setEditingTypeName(null);
    setEditTypeValue("");
    setError(null);
    setIsAdding(false);
    setIsSavingEdit(false);
    setDeletingType(null);
    setDeleteConfirmType(null);
  }, [accountTypes]);

  // --- CRUD Handlers ---

  const handleAddType = async (event) => {
    event.preventDefault();
    const trimmedName = newTypeName.trim();
    if (!trimmedName) {
      setError("Account type name cannot be empty.");
      return;
    }
    if (typesList.some((t) => t.toLowerCase() === trimmedName.toLowerCase())) {
      setError(`Account type "${trimmedName}" already exists.`);
      return;
    }

    setIsAdding(true);
    setError(null);
    try {
      const result = await callApi(ACCOUNT_TYPES_API_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ name: trimmedName }),
      });
      if (result && (result.success || result.account_types)) {
        notify(`Account type "${trimmedName}" added successfully.`, "success");
        setNewTypeName("");
        if (onUpdate && result.account_types) {
          onUpdate(result.account_types);
        } else {
          onUpdate([...typesList, trimmedName]); // Optimistic
        }
      } else {
        throw new Error(result?.error || "Failed to add account type.");
      }
    } catch (err) {
      console.error("Error adding account type:", err);
      setError(err.message || "An unknown error occurred.");
      notify("Failed to add account type.", "error");
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditType = (type) => {
    setEditingTypeName(type);
    setEditTypeValue(type);
    setDeleteConfirmType(null);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingTypeName(null);
    setEditTypeValue("");
    setError(null);
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    const trimmedValue = editTypeValue.trim();
    const originalName = editingTypeName;

    if (!trimmedValue) {
      setError("Account type name cannot be empty.");
      return;
    }
    if (
      typesList.some(
        (t) =>
          t.toLowerCase() === trimmedValue.toLowerCase() &&
          t.toLowerCase() !== originalName.toLowerCase()
      )
    ) {
      setError(`Account type "${trimmedValue}" already exists.`);
      return;
    }
    if (trimmedValue === originalName) {
      handleCancelEdit();
      return;
    }

    setIsSavingEdit(true);
    setError(null);
    try {
      const result = await callApi(ACCOUNT_TYPES_API_ENDPOINT, {
        method: "PUT",
        body: JSON.stringify({
          originalName: originalName,
          newName: trimmedValue,
        }),
      });
      if (result && (result.success || result.account_types)) {
        notify(
          `Account type renamed to "${trimmedValue}" successfully.`,
          "success"
        );
        setEditingTypeName(null);
        if (onUpdate && result.account_types) {
          onUpdate(result.account_types);
        } else {
          onUpdate(
            typesList.map((t) => (t === originalName ? trimmedValue : t))
          ); // Optimistic
        }
      } else {
        throw new Error(result?.error || "Failed to rename account type.");
      }
    } catch (err) {
      console.error("Error saving account type edit:", err);
      setError(err.message || "An unknown error occurred.");
      notify("Failed to save changes.", "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteClick = (type) => {
    setDeleteConfirmType(type);
    setEditingTypeName(null);
    setError(null);
  };

  const handleCancelDelete = () => {
    setDeleteConfirmType(null);
  };

  const handleConfirmDelete = async (typeToDelete) => {
    setDeletingType(typeToDelete);
    setDeleteConfirmType(null);
    setError(null);
    try {
      const result = await callApi(ACCOUNT_TYPES_API_ENDPOINT, {
        method: "DELETE",
        body: JSON.stringify({ name: typeToDelete }),
      });
      if (result && (result.success || result.account_types)) {
        notify(
          `Account type "${typeToDelete}" deleted successfully.`,
          "success"
        );
        if (onUpdate && result.account_types) {
          onUpdate(result.account_types);
        } else {
          onUpdate(typesList.filter((t) => t !== typeToDelete)); // Optimistic
        }
      } else {
        throw new Error(
          result?.error || "Failed to delete account type. It might be in use."
        );
      }
    } catch (err) {
      console.error("Error deleting account type:", err);
      const detail = err.message?.includes("in use")
        ? "Ensure it's not linked to any accounts."
        : "An unknown error occurred.";
      setError(`Failed to delete account type "${typeToDelete}". ${detail}`);
      notify("Failed to delete account type.", "error");
    } finally {
      setDeletingType(null);
    }
  };

  // --- Render Logic ---

  const renderTypeItem = (type) => {
    const isEditingThis = editingTypeName === type;
    const isDeletingThis = deletingType === type;
    const showDeleteConfirm = deleteConfirmType === type;

    if (showDeleteConfirm) {
      return (
        <DeleteConfirmation
          key={`${type}-delete-confirm`}
          itemType="Account Type"
          itemName={type}
          onCancel={handleCancelDelete}
          onConfirm={handleConfirmDelete}
        />
      );
    }

    if (isEditingThis) {
      return (
        <ListItem key={`${type}-edit`} divider>
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
              value={editTypeValue}
              onChange={(e) => setEditTypeValue(e.target.value)}
              variant="outlined"
              size="small"
              fullWidth
              autoFocus
              disabled={isSavingEdit}
              error={!!error}
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
        key={type}
        divider
        secondaryAction={
          <Box>
            <IconButton
              edge="end"
              aria-label="edit"
              onClick={() => handleEditType(type)}
              size="small"
              sx={{ mr: 0.5 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              edge="end"
              aria-label="delete"
              onClick={() => handleDeleteClick(type)}
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
        <ListItemText primary={type} />
      </ListItem>
    );
  };

  return (
    <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Manage Account Types
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box
        component="form"
        onSubmit={handleAddType}
        sx={{ display: "flex", gap: 1, mb: 2 }}
      >
        <TextField
          label="New Account Type Name"
          variant="outlined"
          size="small"
          value={newTypeName}
          onChange={(e) => setNewTypeName(e.target.value)}
          fullWidth
          disabled={isAdding}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={!newTypeName.trim() || isAdding}
          startIcon={
            isAdding ? <CircularProgress size={20} color="inherit" /> : null
          }
        >
          Add Type
        </Button>
      </Box>

      <Divider sx={{ mb: 2 }} />

      <List dense sx={{ maxHeight: 300, overflow: "auto" }}>
        {typesList.length === 0 && !error && (
          <ListItem>
            <ListItemText primary="No account types defined yet." />
          </ListItem>
        )}
        {typesList.map(renderTypeItem)}
      </List>
    </Paper>
  );
}

ManageAccountTypesSection.propTypes = {
  accountTypes: PropTypes.array,
  onUpdate: PropTypes.func.isRequired,
};

export default ManageAccountTypesSection;
