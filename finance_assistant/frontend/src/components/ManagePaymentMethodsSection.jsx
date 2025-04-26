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

const PAYMENT_METHODS_API_ENDPOINT = "payment_methods";

// Reusable Delete Confirmation (Generic)
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

function ManagePaymentMethodsSection({ paymentMethods = [], onUpdate }) {
  const [itemList, setItemList] = useState([]);
  const [newItemName, setNewItemName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [deletingItem, setDeletingItem] = useState(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [editItemValue, setEditItemValue] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [error, setError] = useState(null);
  const { notify } = useSnackbar();

  useEffect(() => {
    const validItems = paymentMethods.filter(
      (item) => item && item.id && item.name && typeof item.name === "string"
    );

    const sortedItems = [...validItems].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    setItemList(sortedItems);

    setNewItemName("");
    setEditingItem(null);
    setEditItemValue("");
    setError(null);
    setIsAdding(false);
    setIsSavingEdit(false);
    setDeletingItem(null);
    setDeleteConfirmItem(null);
  }, [paymentMethods]);

  // --- CRUD Handlers ---

  const handleAddItem = async (event) => {
    event.preventDefault();
    const trimmedName = newItemName.trim();
    if (!trimmedName) {
      setError("Payment method name cannot be empty.");
      return;
    }
    if (
      itemList.some(
        (item) => item.name.toLowerCase() === trimmedName.toLowerCase()
      )
    ) {
      setError(`Payment method "${trimmedName}" already exists.`);
      return;
    }

    setIsAdding(true);
    setError(null);
    try {
      const result = await callApi(PAYMENT_METHODS_API_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ name: trimmedName }),
      });
      if (result && result.success) {
        notify(
          `Payment method "${trimmedName}" added successfully.`,
          "success"
        );
        setNewItemName("");
        if (onUpdate) {
          onUpdate();
        }
      } else {
        throw new Error(result?.error || "Failed to add payment method.");
      }
    } catch (err) {
      console.error("Error adding payment method:", err);
      setError(err.message || "An unknown error occurred while adding.");
      notify(
        `Error: ${err.message || "Could not add payment method."}`,
        "error"
      );
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditItem = (item) => {
    setEditingItem(item);
    setEditItemValue(item.name);
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
    const originalItem = editingItem;

    if (!trimmedValue) {
      setError("Payment method name cannot be empty.");
      return;
    }
    if (
      itemList.some(
        (item) =>
          item.name.toLowerCase() === trimmedValue.toLowerCase() &&
          item.id !== originalItem.id
      )
    ) {
      setError(`Payment method "${trimmedValue}" already exists.`);
      return;
    }
    if (trimmedValue === originalItem.name) {
      handleCancelEdit();
      return;
    }

    setIsSavingEdit(true);
    setError(null);
    try {
      const result = await callApi(PAYMENT_METHODS_API_ENDPOINT, {
        method: "PUT",
        body: JSON.stringify({
          originalName: originalItem.name,
          newName: trimmedValue,
        }),
      });
      if (result && result.success) {
        notify(
          `Payment method renamed to "${trimmedValue}" successfully.`,
          "success"
        );
        setEditingItem(null);
        if (onUpdate) {
          onUpdate();
        }
      } else {
        throw new Error(result?.error || "Failed to rename payment method.");
      }
    } catch (err) {
      console.error("Error saving payment method edit:", err);
      setError(err.message || "An unknown error occurred while saving.");
      notify(`Error: ${err.message || "Could not save changes."}`, "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteClick = (item) => {
    setDeleteConfirmItem(item);
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
      const result = await callApi(PAYMENT_METHODS_API_ENDPOINT, {
        method: "DELETE",
        body: JSON.stringify({ name: itemToDelete.name }),
      });
      if (result && result.success) {
        notify(
          `Payment method "${itemToDelete.name}" deleted successfully.`,
          "success"
        );
        if (onUpdate) {
          onUpdate();
        }
      } else {
        throw new Error(
          result?.error ||
            "Failed to delete payment method. It might be in use."
        );
      }
    } catch (err) {
      console.error("Error deleting payment method:", err);
      const detail = err.message?.includes("in use")
        ? "Ensure it's not linked to any credit cards."
        : err.message || "An unknown error occurred.";
      setError(
        `Failed to delete payment method "${itemToDelete.name}". ${detail}`
      );
      notify(`Error: ${detail}`, "error");
    } finally {
      setDeletingItem(null);
    }
  };

  // --- Render Logic ---

  const renderItem = (item) => {
    const isEditingThis = editingItem?.id === item.id;
    const isDeletingThis = deletingItem?.id === item.id;
    const showDeleteConfirm = deleteConfirmItem?.id === item.id;

    if (showDeleteConfirm) {
      return (
        <DeleteConfirmation
          key={`${item.id}-delete-confirm`}
          itemType="Payment Method"
          item={item}
          onCancel={handleCancelDelete}
          onConfirm={handleConfirmDelete}
        />
      );
    }

    if (isEditingThis) {
      return (
        <ListItem key={`${item.id}-edit`} divider>
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
              error={!!error && editingItem?.id === item.id}
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
        key={item.id}
        divider
        secondaryAction={
          isDeletingThis ? (
            <CircularProgress size={20} color="inherit" />
          ) : (
            <Box>
              <IconButton
                edge="end"
                aria-label="edit"
                onClick={() => handleEditItem(item)}
                disabled={
                  !!editingItem || !!deleteConfirmItem || !!deletingItem
                }
                size="small"
                sx={{ mr: 0.5 }}
              >
                <EditIcon fontSize="inherit" />
              </IconButton>
              <IconButton
                edge="end"
                aria-label="delete"
                onClick={() => handleDeleteClick(item)}
                disabled={
                  !!editingItem || !!deleteConfirmItem || !!deletingItem
                }
                size="small"
              >
                <DeleteIcon fontSize="inherit" />
              </IconButton>
            </Box>
          )
        }
      >
        <ListItemText primary={item.name} />
      </ListItem>
    );
  };

  return (
    <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Manage Payment Methods
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box
        component="form"
        onSubmit={handleAddItem}
        sx={{ display: "flex", gap: 1, mb: 2 }}
      >
        <TextField
          label="New Payment Method Name"
          variant="outlined"
          size="small"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          fullWidth
          disabled={isAdding}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={!newItemName.trim() || isAdding}
          startIcon={
            isAdding ? <CircularProgress size={20} color="inherit" /> : null
          }
        >
          Add Method
        </Button>
      </Box>

      <Divider sx={{ mb: 2 }} />

      <List dense sx={{ maxHeight: 300, overflow: "auto" }}>
        {itemList.length === 0 && !error && (
          <ListItem>
            <ListItemText primary="No payment methods defined yet." />
          </ListItem>
        )}
        {itemList.map(renderItem)}
      </List>
    </Paper>
  );
}

ManagePaymentMethodsSection.propTypes = {
  paymentMethods: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
    })
  ),
  onUpdate: PropTypes.func.isRequired,
};

export default ManagePaymentMethodsSection;
