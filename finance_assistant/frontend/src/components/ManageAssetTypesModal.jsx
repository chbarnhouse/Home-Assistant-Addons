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
import { useSnackbar } from "../context/SnackbarContext"; // Import hook

// Define API endpoint specific to Asset Types
const ASSET_TYPES_API = "/api/asset_types";

function ManageAssetTypesModal({ open, onClose, assetTypes = [], onUpdate }) {
  const [types, setTypes] = useState([]);
  const [newTypeName, setNewTypeName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [deletingType, setDeletingType] = useState(null);
  const [editingTypeName, setEditingTypeName] = useState(null);
  const [editTypeValue, setEditTypeValue] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [error, setError] = useState(null);
  const { notify } = useSnackbar(); // Get notify function

  useEffect(() => {
    if (open) {
      // Sort types alphabetically for consistent display
      const sortedTypes = [...assetTypes].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      setTypes(sortedTypes);
      // Reset state when modal opens
      setNewTypeName("");
      setEditingTypeName(null);
      setEditTypeValue("");
      setError(null);
      setIsAdding(false);
      setIsSavingEdit(false);
      setDeletingType(null);
    }
  }, [open, assetTypes]);

  const handleAddType = async (event) => {
    event.preventDefault();
    const trimmedName = newTypeName.trim();
    if (!trimmedName) {
      setError("Asset type name cannot be empty.");
      return;
    }
    if (types.some((t) => t.name === trimmedName)) {
      setError(`Asset type "${trimmedName}" already exists.`);
      return;
    }
    setIsAdding(true);
    try {
      const response = await fetch(ASSET_TYPES_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          errData.error || `HTTP error! status: ${response.status}`
        );
      }
      const result = await response.json();
      if (result.success && result.types) {
        onUpdate(result.types);
        notify("Asset type added successfully.", "success");
        setNewTypeName("");
      } else {
        console.warn("Unexpected response format on add asset type", result);
        onUpdate([...types, { name: trimmedName }]);
      }
    } catch (err) {
      console.error("Error adding asset type:", err);
      setError(err.message || "Failed to add asset type.");
      notify(err.message || "An unexpected error occurred.", "error");
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditType = (type) => {
    setError(null);
    setEditingTypeName(type.name);
    setEditTypeValue(type.name);
  };

  const handleCancelEdit = () => {
    setError(null);
    setEditingTypeName(null);
    setEditTypeValue("");
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    const originalName = editingTypeName;
    const newName = editTypeValue.trim();
    if (!newName) {
      setError("Asset type name cannot be empty.");
      return;
    }
    if (newName === originalName) {
      handleCancelEdit();
      return;
    }
    if (types.some((t) => t.name === newName)) {
      setError(`Asset type "${newName}" already exists.`);
      return;
    }
    setIsSavingEdit(true);
    try {
      const response = await fetch(ASSET_TYPES_API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalName: originalName, newName: newName }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          errData.error || `HTTP error! status: ${response.status}`
        );
      }
      const result = await response.json();
      if (result.success && result.types) {
        onUpdate(result.types);
        notify("Asset type updated successfully.", "success");
        handleCancelEdit();
      } else {
        console.warn("Unexpected response format on update asset type", result);
        onUpdate(
          types.map((t) =>
            t.name === originalName ? { ...t, name: newName } : t
          )
        );
      }
    } catch (err) {
      console.error("Error updating asset type:", err);
      setError(err.message || "Failed to update asset type.");
      notify(err.message || "An unexpected error occurred.", "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteType = async (typeName) => {
    if (
      window.confirm(
        `Are you sure you want to delete the asset type "${typeName}"?`
      )
    ) {
      setDeletingType(typeName);
      try {
        const response = await fetch(ASSET_TYPES_API, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: typeName }),
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(
            errData.error || `HTTP error! status: ${response.status}`
          );
        }
        const result = await response.json();
        if (result.success && result.types) {
          onUpdate(result.types);
          notify("Asset type deleted successfully.", "success");
        } else {
          console.warn(
            "Unexpected response format on delete asset type",
            result
          );
          onUpdate(types.filter((t) => t.name !== typeName));
        }
      } catch (err) {
        console.error("Error deleting asset type:", err);
        setError(err.message || "Failed to delete asset type.");
        notify(err.message || "An unexpected error occurred.", "error");
      } finally {
        setDeletingType(null);
      }
    }
  };

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
      <DialogTitle>Manage Asset Types</DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        <Box
          component="form"
          onSubmit={handleAddType}
          sx={{ display: "flex", alignItems: "center", mb: 2 }}
        >
          <TextField
            label="New Asset Type Name"
            variant="outlined"
            size="small"
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            sx={{ flexGrow: 1, mr: 1 }}
            disabled={isBusy}
            error={!!error && !newTypeName.trim()}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={isBusy || !newTypeName.trim()}
            startIcon={isBusy && <CircularProgress size={16} color="inherit" />}
          >
            Add
          </Button>
        </Box>
        <Divider sx={{ my: 1 }} />
        <List dense>
          {types.length === 0 ? (
            <ListItem>
              <ListItemText primary="No asset types defined." />
            </ListItem>
          ) : (
            types.map((type) => {
              const isBeingDeleted = deletingType === type.name;
              const isBeingEdited = editingTypeName === type.name;
              return (
                <ListItem
                  key={type.name}
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
                    <>
                      <ListItemText primary={type.name} />
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
                              onClick={() => handleEditType(type)}
                              disabled={isBusy}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              edge="end"
                              aria-label="delete"
                              size="small"
                              onClick={() => handleDeleteType(type.name)}
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

ManageAssetTypesModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  assetTypes: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
    })
  ).isRequired,
  onUpdate: PropTypes.func.isRequired,
};

export default ManageAssetTypesModal;
