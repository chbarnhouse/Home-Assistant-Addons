import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { useSnackbar } from "../context/SnackbarContext"; // Import Snackbar hook

const API_URL = "/api/liability_types";

function ManageLiabilityTypesModal({
  open,
  onClose,
  liabilityTypes: initialTypes = [],
  onUpdate,
}) {
  const [types, setTypes] = useState([]);
  const [newTypeName, setNewTypeName] = useState("");
  const [editMode, setEditMode] = useState({
    id: null,
    currentName: "",
    newName: "",
  }); // Use originalName as ID
  const [isLoading, setIsLoading] = useState(false);
  const { notify } = useSnackbar(); // Use snackbar hook

  useEffect(() => {
    if (open) {
      // Sort types alphabetically when modal opens
      const sortedTypes = [...initialTypes].sort((a, b) => a.localeCompare(b));
      setTypes(sortedTypes);
      setNewTypeName("");
      setEditMode({ id: null, currentName: "", newName: "" });
      setIsLoading(false);
    }
  }, [open, initialTypes]);

  const handleApiCall = async (method, body = null, successMessage) => {
    setIsLoading(true);
    try {
      const options = {
        method,
        headers: {
          "Content-Type": "application/json",
        },
      };
      if (body) {
        options.body = JSON.stringify(body);
      }
      const response = await fetch(API_URL, options);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || `Failed to ${method.toLowerCase()} liability type.`
        );
      }

      // Fetch the updated list of types after successful operation
      const getResponse = await fetch(API_URL);
      const updatedTypesResult = await getResponse.json();
      if (!getResponse.ok) {
        throw new Error(
          updatedTypesResult.error || "Failed to fetch updated types."
        );
      }
      const sortedUpdatedTypes = [...updatedTypesResult].sort((a, b) =>
        a.localeCompare(b)
      );
      setTypes(sortedUpdatedTypes); // Update local state
      onUpdate(sortedUpdatedTypes); // Update parent state
      notify(successMessage, "success");
      return true;
    } catch (error) {
      console.error(`Error ${method} liability type:`, error);
      notify(error.message || "An error occurred.", "error");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddType = async () => {
    if (!newTypeName.trim()) {
      notify("Liability type name cannot be empty.", "warning");
      return;
    }
    const success = await handleApiCall(
      "POST",
      { name: newTypeName.trim() },
      "Liability type added successfully!"
    );
    if (success) {
      setNewTypeName(""); // Clear input on success
    }
  };

  const handleEnterEditMode = (typeName) => {
    setEditMode({ id: typeName, currentName: typeName, newName: typeName });
  };

  const handleCancelEdit = () => {
    setEditMode({ id: null, currentName: "", newName: "" });
  };

  const handleSaveEdit = async () => {
    if (!editMode.newName.trim()) {
      notify("Liability type name cannot be empty.", "warning");
      return;
    }
    if (editMode.newName.trim() === editMode.currentName) {
      handleCancelEdit(); // No change, just exit edit mode
      return;
    }

    const success = await handleApiCall(
      "PUT",
      { originalName: editMode.currentName, newName: editMode.newName.trim() },
      "Liability type updated successfully!"
    );
    if (success) {
      handleCancelEdit(); // Exit edit mode on success
    }
  };

  const handleDeleteType = async (typeName) => {
    if (
      window.confirm(
        `Are you sure you want to delete the liability type "${typeName}"? This could affect existing liabilities using this type.`
      )
    ) {
      await handleApiCall(
        "DELETE",
        { name: typeName },
        "Liability type deleted successfully!"
      );
      // Note: If the type was being edited, cancel edit mode
      if (editMode.id === typeName) {
        handleCancelEdit();
      }
    }
  };

  return (
    <Dialog
      open={open}
      onClose={isLoading ? undefined : onClose}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle>Manage Liability Types</DialogTitle>
      <DialogContent dividers>
        {isLoading && (
          <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        <List dense>
          {types.map((typeName) => (
            <ListItem
              key={typeName}
              secondaryAction={
                editMode.id === typeName ? (
                  <>
                    <IconButton
                      edge="end"
                      aria-label="save"
                      onClick={handleSaveEdit}
                      disabled={isLoading}
                      size="small"
                      sx={{ mr: 0.5 }}
                    >
                      <SaveIcon fontSize="inherit" />
                    </IconButton>
                    <IconButton
                      edge="end"
                      aria-label="cancel"
                      onClick={handleCancelEdit}
                      disabled={isLoading}
                      size="small"
                    >
                      <CancelIcon fontSize="inherit" />
                    </IconButton>
                  </>
                ) : (
                  <>
                    <IconButton
                      edge="end"
                      aria-label="edit"
                      onClick={() => handleEnterEditMode(typeName)}
                      disabled={isLoading || editMode.id !== null}
                      size="small"
                      sx={{ mr: 0.5 }}
                    >
                      <EditIcon fontSize="inherit" />
                    </IconButton>
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      onClick={() => handleDeleteType(typeName)}
                      disabled={isLoading || editMode.id !== null}
                      size="small"
                    >
                      <DeleteIcon fontSize="inherit" />
                    </IconButton>
                  </>
                )
              }
            >
              {editMode.id === typeName ? (
                <TextField
                  value={editMode.newName}
                  onChange={(e) =>
                    setEditMode({ ...editMode, newName: e.target.value })
                  }
                  variant="standard"
                  size="small"
                  fullWidth
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
                  disabled={isLoading}
                />
              ) : (
                <ListItemText primary={typeName} />
              )}
            </ListItem>
          ))}
        </List>
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            handleAddType();
          }}
          sx={{ mt: 2, display: "flex", gap: 1 }}
        >
          <TextField
            label="New Liability Type"
            variant="outlined"
            size="small"
            fullWidth
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            disabled={isLoading || editMode.id !== null}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={isLoading || editMode.id !== null || !newTypeName.trim()}
          >
            Add
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

ManageLiabilityTypesModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  liabilityTypes: PropTypes.arrayOf(PropTypes.string).isRequired,
  onUpdate: PropTypes.func.isRequired, // Callback to update parent state with new types list
};

export default ManageLiabilityTypesModal;
