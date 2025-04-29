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

const LIABILITY_TYPES_API_ENDPOINT = "liability_types"; // Changed endpoint

// Reusable Delete Confirmation (Same as Banks/Account Types)
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

// Renamed component
function ManageLiabilityTypesSection({ liabilityTypes = [], onUpdate }) {
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
    const validTypes = liabilityTypes.filter(
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
  }, [liabilityTypes]); // Changed prop name

  // --- CRUD Handlers ---

  const handleAddType = async (event) => {
    event.preventDefault();
    const trimmedName = newTypeName.trim();
    if (!trimmedName) {
      setError("Liability type name cannot be empty."); // Changed text
      return;
    }
    if (typesList.some((t) => t.toLowerCase() === trimmedName.toLowerCase())) {
      setError(`Liability type "${trimmedName}" already exists.`); // Changed text
      return;
    }

    setIsAdding(true);
    setError(null);
    try {
      const result = await callApi(LIABILITY_TYPES_API_ENDPOINT, {
        // Changed endpoint
        method: "POST",
        body: JSON.stringify({ name: trimmedName }),
      });
      if (result && (result.success || result.types)) {
        // Changed check
        notify(
          `Liability type "${trimmedName}" added successfully.`,
          "success"
        ); // Changed text
        setNewTypeName("");
        if (onUpdate && result.types) {
          // Changed check
          onUpdate(result.types); // Changed check
        } else {
          onUpdate([...typesList, trimmedName]); // Optimistic
        }
      } else {
        throw new Error(result?.error || "Failed to add liability type."); // Changed text
      }
    } catch (err) {
      console.error("Error adding liability type:", err); // Changed text
      setError(err.message || "An unknown error occurred.");
      notify("Failed to add liability type.", "error"); // Changed text
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
      setError("Liability type name cannot be empty."); // Changed text
      return;
    }
    if (
      typesList.some(
        (t) =>
          t.toLowerCase() === trimmedValue.toLowerCase() &&
          t.toLowerCase() !== originalName.toLowerCase()
      )
    ) {
      setError(`Liability type "${trimmedValue}" already exists.`); // Changed text
      return;
    }
    if (trimmedValue === originalName) {
      handleCancelEdit();
      return;
    }

    setIsSavingEdit(true);
    setError(null);
    try {
      const result = await callApi(LIABILITY_TYPES_API_ENDPOINT, {
        // Changed endpoint
        method: "PUT",
        body: JSON.stringify({
          originalName: originalName,
          newName: trimmedValue,
        }),
      });
      if (result && (result.success || result.types)) {
        // Changed check
        notify(
          `Liability type renamed to "${trimmedValue}" successfully.`, // Changed text
          "success"
        );
        setEditingTypeName(null);
        if (onUpdate && result.types) {
          // Changed check
          onUpdate(result.types); // Changed check
        } else {
          onUpdate(
            typesList.map((t) => (t === originalName ? trimmedValue : t))
          ); // Optimistic
        }
      } else {
        throw new Error(result?.error || "Failed to rename liability type."); // Changed text
      }
    } catch (err) {
      console.error("Error saving liability type edit:", err); // Changed text
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
      const result = await callApi(LIABILITY_TYPES_API_ENDPOINT, {
        // Changed endpoint
        method: "DELETE",
        body: JSON.stringify({ name: typeToDelete }),
      });
      if (result && (result.success || result.types)) {
        // Changed check
        notify(
          `Liability type "${typeToDelete}" deleted successfully.`, // Changed text
          "success"
        );
        if (onUpdate && result.types) {
          // Changed check
          onUpdate(result.types); // Changed check
        } else {
          onUpdate(typesList.filter((t) => t !== typeToDelete)); // Optimistic
        }
      } else {
        throw new Error(result?.error || "Failed to delete liability type."); // Changed text
      }
    } catch (err) {
      console.error("Error deleting liability type:", err); // Changed text
      setError(err.message || "An unknown error occurred.");
      notify("Failed to delete liability type.", "error"); // Changed text
    } finally {
      setDeletingType(null);
    }
  };

  const renderTypeItem = (type) => {
    const isEditing = editingTypeName === type;
    const isDeletingConfirm = deleteConfirmType === type;
    const isCurrentlyDeleting = deletingType === type;
    const isCurrentlySaving = isSavingEdit && editingTypeName === type;

    if (isDeletingConfirm) {
      return (
        <DeleteConfirmation
          key={`${type}-confirm`}
          itemType="Liability Type" // Changed text
          itemName={type}
          onCancel={handleCancelDelete}
          onConfirm={() => handleConfirmDelete(type)}
        />
      );
    }

    if (isEditing) {
      return (
        <ListItem key={`${type}-edit`} dense>
          <Box
            component="form"
            onSubmit={handleSaveEdit}
            sx={{ display: "flex", alignItems: "center", width: "100%" }}
          >
            <TextField
              value={editTypeValue}
              onChange={(e) => setEditTypeValue(e.target.value)}
              variant="outlined"
              size="small"
              fullWidth
              autoFocus
              disabled={isCurrentlySaving}
              sx={{ mr: 1 }}
            />
            <IconButton
              type="submit"
              edge="end"
              aria-label="save"
              color="primary"
              disabled={isCurrentlySaving || editTypeValue.trim() === ""}
            >
              {isCurrentlySaving ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                <SaveIcon />
              )}
            </IconButton>
            <IconButton
              edge="end"
              aria-label="cancel"
              onClick={handleCancelEdit}
              disabled={isCurrentlySaving}
            >
              <CancelIcon />
            </IconButton>
          </Box>
        </ListItem>
      );
    }

    return (
      <ListItem
        key={type}
        secondaryAction={
          <>
            <IconButton
              edge="end"
              aria-label="edit"
              onClick={() => handleEditType(type)}
              disabled={isCurrentlyDeleting || isAdding || isSavingEdit}
              sx={{ mr: 0.5 }}
            >
              <EditIcon />
            </IconButton>
            <IconButton
              edge="end"
              aria-label="delete"
              onClick={() => handleDeleteClick(type)}
              disabled={isCurrentlyDeleting || isAdding || isSavingEdit}
            >
              {isCurrentlyDeleting ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                <DeleteIcon />
              )}
            </IconButton>
          </>
        }
        dense
        sx={{
          opacity: isCurrentlyDeleting ? 0.5 : 1,
          transition: "opacity 0.3s ease",
          backgroundColor: "transparent",
        }}
      >
        <ListItemText primary={type} />
      </ListItem>
    );
  };

  return (
    <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom component="div">
        Manage Liability Types // Changed text
      </Typography>
      <Divider sx={{ my: 2 }} />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleAddType} sx={{ mb: 2 }}>
        <TextField
          label="New Liability Type Name" // Changed text
          variant="outlined"
          size="small"
          value={newTypeName}
          onChange={(e) => setNewTypeName(e.target.value)}
          disabled={
            isAdding ||
            !!editingTypeName ||
            !!deleteConfirmType ||
            !!deletingType
          }
          fullWidth
          sx={{ mr: 1, mb: { xs: 1, sm: 0 } }} // Responsive margin
        />
        <Button
          type="submit"
          variant="contained"
          disabled={
            !newTypeName.trim() ||
            isAdding ||
            !!editingTypeName ||
            !!deleteConfirmType ||
            !!deletingType
          }
          startIcon={
            isAdding ? <CircularProgress size={16} color="inherit" /> : null
          }
          sx={{ mt: { xs: 1, sm: 0 } }} // Responsive margin
        >
          Add Type
        </Button>
      </Box>

      <List dense disablePadding>
        {typesList.length > 0 ? (
          typesList.map(renderTypeItem)
        ) : (
          <ListItem dense>
            <ListItemText primary="No liability types defined yet." /> //
            Changed text
          </ListItem>
        )}
      </List>
    </Paper>
  );
}

ManageLiabilityTypesSection.propTypes = {
  liabilityTypes: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.shape({ name: PropTypes.string.isRequired }),
    ])
  ),
  onUpdate: PropTypes.func.isRequired,
};

export default ManageLiabilityTypesSection;
