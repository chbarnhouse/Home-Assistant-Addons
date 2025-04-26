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
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useSnackbar } from "../context/SnackbarContext";
import { callApi } from "../utils/api";
import Alert from "@mui/material/Alert";

// Payment methods API endpoint - without /api prefix to use with callApi utility
const PAYMENT_METHODS_API_PATH = "payment_methods";

// Delete confirmation component defined outside the main component
const DeleteConfirmation = ({ method, onCancel, onConfirm }) => {
  return (
    <ListItem sx={{ backgroundColor: "rgba(211, 47, 47, 0.1)", py: 1 }}>
      <Box sx={{ width: "100%" }}>
        <Typography variant="body2" sx={{ color: "error.main", mb: 0.5 }}>
          Delete "{method}"?
        </Typography>
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button size="small" sx={{ mr: 1 }} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={() => onConfirm(method)}
          >
            Delete
          </Button>
        </Box>
      </Box>
    </ListItem>
  );
};

DeleteConfirmation.propTypes = {
  method: PropTypes.string.isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

function ManagePaymentMethodsModal({ open, onClose, onUpdate }) {
  const [methods, setMethods] = useState([]);
  const [newMethodName, setNewMethodName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [deleteConfirmMethod, setDeleteConfirmMethod] = useState(null);
  const [editingMethodName, setEditingMethodName] = useState(null);
  const [editMethodValue, setEditMethodValue] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingMethod, setDeletingMethod] = useState(null);
  const [error, setError] = useState(null);
  const { notify } = useSnackbar();

  // Safe function to update parent component
  const safeUpdate = (updatedMethods) => {
    try {
      if (typeof onUpdate === "function") {
        onUpdate(updatedMethods);
      }
    } catch (err) {
      console.error("Error in onUpdate callback:", err);
      setError("Internal error updating payment methods list");
      notify("Internal error occurred while updating methods", "error");
    }
  };

  const fetchMethods = async () => {
    setIsFetching(true);
    try {
      const data = await callApi(PAYMENT_METHODS_API_PATH, { method: "GET" });

      // Handle the response
      if (Array.isArray(data)) {
        setMethods(data.sort()); // Sort alphabetically
      } else {
        console.error("Unexpected response format:", data);
        throw new Error("Unexpected response format from server");
      }
    } catch (error) {
      console.error("Error fetching payment methods:", error);
      notify(error.message || "Could not load payment methods.", "error");
      setMethods([]);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchMethods(); // Fetch fresh list when modal opens
      setNewMethodName("");
      setIsLoading(false);
      setError(null);
      setEditingMethodName(null);
      setDeleteConfirmMethod(null);
      setDeletingMethod(null);
    }
  }, [open]);

  const handleAddMethod = async () => {
    const nameToAdd = newMethodName.trim();
    if (!nameToAdd) {
      notify("Payment method name cannot be empty.", "warning");
      return;
    }
    if (methods.some((m) => m.toLowerCase() === nameToAdd.toLowerCase())) {
      notify(`Payment method "${nameToAdd}" already exists.`, "warning");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await callApi(PAYMENT_METHODS_API_PATH, {
        method: "POST",
        body: JSON.stringify({ name: nameToAdd }),
      });

      // Ensure result is properly validated
      if (!result || typeof result !== "object") {
        throw new Error("Failed to add payment method: Invalid response");
      }

      if (result.success && Array.isArray(result.methods)) {
        const sortedMethods = [...result.methods].sort();
        setMethods(sortedMethods);
        safeUpdate(sortedMethods);
        setNewMethodName(""); // Clear input
        notify("Payment method added successfully!", "success");
      } else if (result.error) {
        throw new Error(result.error);
      } else {
        throw new Error("Unexpected response from server");
      }
    } catch (error) {
      console.error("Error adding payment method:", error);
      setError(error.message || "Failed to add payment method");
      notify(error.message || "An error occurred.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const requestDeleteConfirmation = (methodName) => {
    setDeleteConfirmMethod(methodName);
    setEditingMethodName(null);
  };

  const cancelDeleteConfirmation = () => {
    setDeleteConfirmMethod(null);
  };

  const confirmAndDeleteMethod = async (methodName) => {
    if (!methodName) return;

    setDeletingMethod(methodName);
    setDeleteConfirmMethod(null);
    setError(null);

    try {
      const result = await callApi(PAYMENT_METHODS_API_PATH, {
        method: "DELETE",
        body: JSON.stringify({ name: methodName }),
      });

      // Ensure result is properly validated
      if (result && typeof result === "object") {
        if (result.success && Array.isArray(result.methods)) {
          setMethods(result.methods.sort());
          safeUpdate(result.methods);
          notify("Payment method deleted successfully.", "success");
        } else if (result.error) {
          throw new Error(result.error);
        } else {
          // Fallback: Update local state if server response doesn't include updated methods
          const updatedMethods = methods.filter(
            (method) => method.toLowerCase() !== methodName.toLowerCase()
          );
          setMethods(updatedMethods);
          safeUpdate(updatedMethods);
          notify(
            "Payment method deleted successfully (using local update).",
            "success"
          );
        }
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error) {
      console.error("Error deleting payment method:", error);
      setError(error.message || "Failed to delete payment method");
      notify(error.message || "An error occurred.", "error");
    } finally {
      setDeletingMethod(null);
    }
  };

  // Edit mode functions
  const handleEditMethod = (methodName) => {
    setEditingMethodName(methodName);
    setEditMethodValue(methodName);
    setDeleteConfirmMethod(null);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingMethodName(null);
    setEditMethodValue("");
    setError(null);
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    const originalName = editingMethodName;
    const newName = editMethodValue.trim();

    if (!newName) {
      setError("Payment method name cannot be empty.");
      return;
    }

    if (newName === originalName) {
      handleCancelEdit();
      return;
    }

    if (methods.some((m) => m.toLowerCase() === newName.toLowerCase())) {
      setError(`Payment method "${newName}" already exists.`);
      return;
    }

    setIsSavingEdit(true);
    setError(null);
    try {
      const result = await callApi(PAYMENT_METHODS_API_PATH, {
        method: "PUT",
        body: JSON.stringify({ originalName, newName }),
      });

      if (result && result.success && Array.isArray(result.methods)) {
        setMethods(result.methods.sort());
        safeUpdate(result.methods);
        notify("Payment method updated successfully.", "success");
        handleCancelEdit();
      } else if (result && result.error) {
        throw new Error(result.error);
      } else {
        // Fallback: Update local state
        const updatedMethods = methods
          .map((method) => (method === originalName ? newName : method))
          .sort();
        setMethods(updatedMethods);
        safeUpdate(updatedMethods);
        notify(
          "Payment method updated successfully (using local update).",
          "success"
        );
        handleCancelEdit();
      }
    } catch (error) {
      console.error("Error updating payment method:", error);
      setError(error.message || "Failed to update payment method");
      notify(error.message || "An error occurred.", "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Determine if modal can be closed
  const isBusy =
    isLoading || isSavingEdit || !!deletingMethod || !!editingMethodName;
  const canClose =
    !isLoading &&
    !isSavingEdit &&
    !deletingMethod &&
    !editingMethodName &&
    !deleteConfirmMethod;

  return (
    <Dialog
      open={open}
      onClose={canClose ? onClose : undefined}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle>Manage Payment Methods</DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {(isLoading || isFetching) && (
          <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {!isFetching && (
          <List dense>
            {methods.length === 0 && !isLoading && (
              <ListItem>
                <ListItemText primary="No payment methods found." />
              </ListItem>
            )}

            {methods.map((methodName) => {
              const isBeingDeleted = deletingMethod === methodName;
              const isBeingEdited = editingMethodName === methodName;
              const isConfirmingDelete = deleteConfirmMethod === methodName;

              if (isConfirmingDelete) {
                return (
                  <DeleteConfirmation
                    key={methodName}
                    method={methodName}
                    onCancel={cancelDeleteConfirmation}
                    onConfirm={confirmAndDeleteMethod}
                  />
                );
              }

              if (isBeingEdited) {
                return (
                  <ListItem key={methodName} sx={{ pl: 1, pr: 1 }}>
                    <Box
                      component="form"
                      onSubmit={handleSaveEdit}
                      sx={{ display: "flex", width: "100%", gap: 1 }}
                    >
                      <TextField
                        value={editMethodValue}
                        onChange={(e) => setEditMethodValue(e.target.value)}
                        size="small"
                        fullWidth
                        autoFocus
                        disabled={isSavingEdit}
                      />
                      <Box>
                        <Button
                          size="small"
                          type="submit"
                          variant="contained"
                          color="primary"
                          disabled={isSavingEdit}
                          sx={{ minWidth: "auto", mr: 0.5 }}
                        >
                          {isSavingEdit ? (
                            <CircularProgress size={20} />
                          ) : (
                            "Save"
                          )}
                        </Button>
                        <Button
                          size="small"
                          onClick={handleCancelEdit}
                          disabled={isSavingEdit}
                          sx={{ minWidth: "auto" }}
                        >
                          Cancel
                        </Button>
                      </Box>
                    </Box>
                  </ListItem>
                );
              }

              return (
                <ListItem
                  key={methodName}
                  secondaryAction={
                    isBeingDeleted ? (
                      <CircularProgress size={20} />
                    ) : (
                      <Box>
                        <IconButton
                          edge="end"
                          aria-label="edit"
                          onClick={() => handleEditMethod(methodName)}
                          disabled={isBusy || !!deleteConfirmMethod}
                          size="small"
                          sx={{ mr: 0.5 }}
                        >
                          <EditIcon fontSize="inherit" />
                        </IconButton>
                        <IconButton
                          edge="end"
                          aria-label="delete"
                          onClick={() => requestDeleteConfirmation(methodName)}
                          disabled={isBusy || !!deleteConfirmMethod}
                          size="small"
                        >
                          <DeleteIcon fontSize="inherit" />
                        </IconButton>
                      </Box>
                    )
                  }
                >
                  <ListItemText primary={methodName} />
                </ListItem>
              );
            })}
          </List>
        )}

        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            handleAddMethod();
          }}
          sx={{ mt: 2, display: "flex", gap: 1 }}
        >
          <TextField
            label="New Payment Method"
            variant="outlined"
            size="small"
            fullWidth
            value={newMethodName}
            onChange={(e) => setNewMethodName(e.target.value)}
            disabled={isLoading || isFetching}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={isLoading || isFetching || !newMethodName.trim()}
          >
            Add
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={!canClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

ManagePaymentMethodsModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onUpdate: PropTypes.func.isRequired, // Callback to update parent state with new methods list
};

export default ManagePaymentMethodsModal;
