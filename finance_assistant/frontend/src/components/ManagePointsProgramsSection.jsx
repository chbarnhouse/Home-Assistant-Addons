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

const POINTS_PROGRAMS_API_ENDPOINT = "points_programs";

// Reusable Delete Confirmation (Generic - Same as other sections)
const DeleteConfirmation = ({ itemType, item, onCancel, onConfirm }) => {
  const handleConfirm = useCallback(() => {
    if (onConfirm) onConfirm(item);
  }, [item, onConfirm]);
  const handleCancel = useCallback(() => {
    if (onCancel) onCancel();
  }, [onCancel]);

  return (
    <ListItem
      key={`${item.id}-delete-confirm`}
      sx={{
        backgroundColor: "rgba(211, 47, 47, 0.1)",
        py: 1,
        display: "block",
      }}
    >
      <Typography variant="body2" sx={{ color: "error.main", mb: 0.5 }}>
        Delete {itemType} "{item.name}"? This cannot be undone.
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
  item: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
  }).isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

// Consistent naming and props
function ManagePointsProgramsSection({ pointsPrograms = [], onUpdate }) {
  const [itemList, setItemList] = useState([]); // Rename programList to itemList
  const [newItemName, setNewItemName] = useState(""); // Rename newProgramName to newItemName
  const [isAdding, setIsAdding] = useState(false);
  const [deletingItem, setDeletingItem] = useState(null); // Rename deletingProgram to deletingItem
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null); // Rename deleteConfirmProgram to deleteConfirmItem
  const [editingItem, setEditingItem] = useState(null); // Rename editingProgramName to editingItem
  const [editItemValue, setEditItemValue] = useState(""); // Rename editProgramValue to editItemValue
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [error, setError] = useState(null);
  const { notify } = useSnackbar();

  useEffect(() => {
    // Expect pointsPrograms prop to be an array of {id, name} objects
    const validItems = pointsPrograms.filter(
      (item) => item && item.id && item.name && typeof item.name === "string"
    );

    // Sort valid items alphabetically by name
    const sortedItems = [...validItems].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    setItemList(sortedItems); // Update itemList

    // Reset local states
    setNewItemName("");
    setEditingItem(null);
    setEditItemValue("");
    setError(null);
    setIsAdding(false);
    setIsSavingEdit(false);
    setDeletingItem(null);
    setDeleteConfirmItem(null);
  }, [pointsPrograms]); // Depend only on pointsPrograms prop

  // --- CRUD Handlers (Refactored) ---

  const handleAddItem = async (event) => {
    // Renamed handleAddProgram
    event.preventDefault();
    const trimmedName = newItemName.trim();
    if (!trimmedName) {
      setError("Points program name cannot be empty.");
      return;
    }
    if (
      itemList.some(
        (item) => item.name.toLowerCase() === trimmedName.toLowerCase()
      ) // Check against itemList.name
    ) {
      // Handle potential 409 Conflict from backend gracefully
      setError(`Points program "${trimmedName}" already exists.`);
      return;
    }

    setIsAdding(true);
    setError(null);
    try {
      const result = await callApi(POINTS_PROGRAMS_API_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ name: trimmedName }),
      });
      // Expect success flag from backend
      if (result && result.success) {
        notify(
          `Points program "${trimmedName}" added successfully.`,
          "success"
        );
        setNewItemName("");
        if (onUpdate) {
          onUpdate(); // Call onUpdate without arguments to trigger refetch
        }
      } else {
        // Display specific backend error (like 409 Conflict)
        throw new Error(result?.error || "Failed to add points program.");
      }
    } catch (err) {
      console.error("Error adding points program:", err);
      // Check if the error message indicates a duplicate
      const isDuplicateError = err.message
        ?.toLowerCase()
        .includes("already exists");
      setError(err.message || "An unknown error occurred while adding.");
      notify(
        `Error: ${err.message || "Could not add points program."}`,
        isDuplicateError ? "warning" : "error" // Use warning for duplicate
      );
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditItem = (item) => {
    // Renamed handleEditProgram, takes item object
    setEditingItem(item); // Store the whole item object
    setEditItemValue(item.name); // Initialize edit field with item name
    setDeleteConfirmItem(null);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
    setEditItemValue("");
    setError(null);
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    const trimmedValue = editItemValue.trim();
    const originalItem = editingItem; // Get the original item object

    if (!originalItem) {
      // Add check for safety
      setError("Cannot save edit: No item selected.");
      return;
    }

    if (!trimmedValue) {
      setError("Points program name cannot be empty.");
      return;
    }
    // Case-insensitive check, excluding the original item's name
    if (
      itemList.some(
        (item) =>
          item.name.toLowerCase() === trimmedValue.toLowerCase() &&
          item.id !== originalItem.id // Compare IDs
      )
    ) {
      setError(`Points program "${trimmedValue}" already exists.`);
      return;
    }
    if (trimmedValue === originalItem.name) {
      // Check if name actually changed
      handleCancelEdit();
      return;
    }

    setIsSavingEdit(true);
    setError(null);
    try {
      // Backend PUT expects id and newName
      const result = await callApi(POINTS_PROGRAMS_API_ENDPOINT, {
        method: "PUT",
        body: JSON.stringify({
          id: originalItem.id, // Send ID for lookup
          name: trimmedValue, // Send new name
        }),
      });
      if (result && result.success) {
        notify(
          `Points program renamed to "${trimmedValue}" successfully.`,
          "success"
        );
        setEditingItem(null); // Exit edit mode
        if (onUpdate) {
          onUpdate(); // Call onUpdate without arguments to trigger refetch
        }
      } else {
        // Display specific backend error if available
        throw new Error(result?.error || "Failed to rename points program.");
      }
    } catch (err) {
      console.error("Error saving points program edit:", err);
      const isDuplicateError = err.message
        ?.toLowerCase()
        .includes("already exists");
      setError(err.message || "An unknown error occurred while saving.");
      notify(
        `Error: ${err.message || "Could not save changes."}`,
        isDuplicateError ? "warning" : "error"
      );
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteClick = (item) => {
    // Renamed, takes item object
    setDeleteConfirmItem(item); // Store the whole item object
    setEditingItem(null);
    setError(null);
  };

  const handleCancelDelete = () => {
    setDeleteConfirmItem(null);
  };

  const handleConfirmDelete = async (itemToDelete) => {
    setDeletingItem(itemToDelete);
    setDeleteConfirmItem(null);
    setError(null);
    try {
      const result = await callApi(POINTS_PROGRAMS_API_ENDPOINT, {
        method: "DELETE",
        body: JSON.stringify({ id: itemToDelete.id }), // Send ID
      });
      if (result && result.success) {
        notify(
          `Points program "${itemToDelete.name}" deleted successfully.`,
          "success"
        );
        if (onUpdate) {
          onUpdate(); // Call onUpdate without arguments to trigger refetch
        }
      } else {
        // Display specific backend error if available
        if (result?.status === 404) {
          throw new Error(
            `Points program "${itemToDelete.name}" not found on server.`
          );
        } else {
          throw new Error(
            result?.error ||
              "Failed to delete points program. It might be in use or already deleted."
          );
        }
      }
    } catch (err) {
      console.error("Error deleting points program:", err);
      const detail = err.message || "An unknown error occurred."; // Show specific error message
      setError(
        `Failed to delete points program "${itemToDelete.name}". ${detail}`
      );
      notify(`Error: ${detail}`, "error"); // Show specific error
    } finally {
      setDeletingItem(null);
    }
  };

  // --- Render Logic (Adjusted for item objects) ---

  const renderItem = (item) => {
    // Renamed renderProgramItem, takes item object
    const isEditingThis = editingItem?.id === item.id; // Compare by ID
    const isDeletingThis = deletingItem?.id === item.id; // Compare by ID
    const showDeleteConfirm = deleteConfirmItem?.id === item.id; // Compare by ID

    if (showDeleteConfirm) {
      return (
        <DeleteConfirmation
          key={`${item.id}-delete-confirm`} // Use item.id for key
          itemType="Points Program"
          item={item} // Pass the whole item object
          onCancel={handleCancelDelete}
          onConfirm={handleConfirmDelete}
        />
      );
    }

    if (isEditingThis) {
      return (
        <ListItem key={`${item.id}-edit`} divider>
          {" "}
          {/* Use item.id for key */}
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
              value={editItemValue}
              onChange={(e) => setEditItemValue(e.target.value)}
              variant="outlined"
              size="small"
              fullWidth
              autoFocus
              disabled={isSavingEdit}
              error={!!error && editingItem?.id === item.id} // Show error only on this item
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
        key={item.id} // Use item.id for key
        divider
        secondaryAction={
          isDeletingThis ? (
            <CircularProgress size={20} color="inherit" />
          ) : (
            <Box>
              <IconButton
                edge="end"
                aria-label="edit"
                onClick={() => handleEditItem(item)} // Pass item object
                disabled={
                  !!editingItem || !!deleteConfirmItem || !!deletingItem
                } // Disable if any action is in progress
                size="small"
                sx={{ mr: 0.5 }}
              >
                <EditIcon fontSize="inherit" />
              </IconButton>
              <IconButton
                edge="end"
                aria-label="delete"
                onClick={() => handleDeleteClick(item)} // Pass item object
                disabled={
                  !!editingItem || !!deleteConfirmItem || !!deletingItem
                } // Disable if any action is in progress
                size="small"
              >
                <DeleteIcon fontSize="inherit" />
              </IconButton>
            </Box>
          )
        }
      >
        <ListItemText primary={item.name} /> {/* Use item.name */}
      </ListItem>
    );
  };

  // --- Component Return ---
  return (
    <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Manage Points Programs
      </Typography>

      {/* Global Error Display */}
      {error && (
        <Alert
          severity={
            error.toLowerCase().includes("already exists") ? "warning" : "error"
          } // Use warning for duplicate errors
          onClose={() => setError(null)} // Allow closing the error
          sx={{ mb: 2 }}
        >
          {error}
        </Alert>
      )}

      <Box
        component="form"
        onSubmit={handleAddItem} // Use renamed handler
        sx={{ display: "flex", gap: 1, mb: 2 }}
      >
        <TextField
          label="New Points Program Name"
          variant="outlined"
          size="small"
          value={newItemName} // Use renamed state variable
          onChange={(e) => setNewItemName(e.target.value)} // Use renamed state variable
          fullWidth
          disabled={isAdding}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={!newItemName.trim() || isAdding} // Use renamed state variable
          startIcon={
            isAdding ? <CircularProgress size={20} color="inherit" /> : null
          }
        >
          Add Program
        </Button>
      </Box>

      <Divider sx={{ mb: 2 }} />

      <List dense sx={{ maxHeight: 300, overflow: "auto" }}>
        {itemList.length === 0 &&
          !error && ( // Check itemList
            <ListItem>
              <ListItemText primary="No points programs defined yet." />
            </ListItem>
          )}
        {/* Map over itemList and use renderItem */}
        {itemList.map(renderItem)}
      </List>
    </Paper>
  );
}

ManagePointsProgramsSection.propTypes = {
  // Expect an array of objects with id and name
  pointsPrograms: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
    })
  ),
  onUpdate: PropTypes.func.isRequired,
};

export default ManagePointsProgramsSection;
