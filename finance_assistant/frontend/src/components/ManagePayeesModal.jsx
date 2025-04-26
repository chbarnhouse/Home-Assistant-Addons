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

// Managed Payees API endpoint
const PAYEES_API_PATH = "managed_payees";

// Separate component for delete confirmation to isolate potential issues
const DeleteConfirmation = ({ method, onCancel, onConfirm }) => {
  // Safely wrap the confirm function to prevent errors
  const handleConfirm = useCallback(() => {
    try {
      if (onConfirm && typeof onConfirm === "function") {
        onConfirm(method);
      }
    } catch (err) {
      console.error("Error in delete confirmation:", err);
    }
  }, [method, onConfirm]);

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
          Delete "{method}"?
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
  method: PropTypes.string.isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

function ManagePayeesModal({
  open,
  onClose,
  onUpdate,
  payees: initialPayees = [],
}) {
  const [payees, setPayees] = useState([]);
  const [newPayeeName, setNewPayeeName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [deletingMethod, setDeletingMethod] = useState(null);
  const [deleteConfirmMethod, setDeleteConfirmMethod] = useState(null);
  const [editingPayeeName, setEditingPayeeName] = useState(null);
  const [editMethodValue, setEditMethodValue] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [error, setError] = useState(null);
  const { notify } = useSnackbar();

  useEffect(() => {
    if (open) {
      setPayees(
        Array.isArray(initialPayees)
          ? [...initialPayees].sort((a, b) => a.name.localeCompare(b.name))
          : []
      );
      setNewPayeeName("");
      setEditingPayeeName(null);
      setEditMethodValue("");
      setError(null);
      setIsLoading(false);
      setDeletingMethod(null);
      setDeleteConfirmMethod(null);
    }
  }, [open, initialPayees]);

  const handleAddPayee = async () => {
    const nameToAdd = newPayeeName.trim();
    if (!nameToAdd) {
      notify("Payee name cannot be empty.", "warning");
      return;
    }
    if (payees.some((p) => p.name.toLowerCase() === nameToAdd.toLowerCase())) {
      notify(`Payee "${nameToAdd}" already exists.`, "warning");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await callApi(PAYEES_API_PATH, {
        method: "POST",
        body: JSON.stringify({ name: nameToAdd }),
      });

      if (!result || typeof result !== "object") {
        throw new Error("Failed to add payee: Invalid response");
      }

      if (result.success && Array.isArray(result.payees)) {
        const sortedPayees = [...result.payees].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        setPayees(sortedPayees);
        onUpdate(sortedPayees);
        setNewPayeeName("");
        notify("Payee added successfully!", "success");
      } else if (result.error) {
        throw new Error(result.error);
      } else {
        throw new Error("Unexpected response from server");
      }
    } catch (error) {
      console.error("Error adding payee:", error);
      setError(error.message || "Failed to add payee");
      notify(error.message || "An error occurred.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditPayee = (payee) => {
    setError(null);
    setEditingPayeeName(payee.id);
    setEditMethodValue(payee.name);
    setDeleteConfirmMethod(null);
  };

  const handleCancelEdit = () => {
    setError(null);
    setEditingPayeeName(null);
    setEditMethodValue("");
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    const originalName = editingPayeeName;
    const newName = editMethodValue.trim();
    if (!newName) {
      setError("Payee name cannot be empty.");
      return;
    }
    if (
      payees.some(
        (p) =>
          p.name.toLowerCase() === newName.toLowerCase() &&
          p.id !== originalName
      )
    ) {
      setError(`Payee "${newName}" already exists.`);
      return;
    }
    setIsSavingEdit(true);
    setError(null);
    try {
      const result = await callApi(PAYEES_API_PATH, {
        method: "PUT",
        body: JSON.stringify({
          original_name: originalName,
          new_name: newName,
        }),
      });

      if (result && typeof result === "object") {
        if (result.success && Array.isArray(result.payees)) {
          const updatedPayees = result.payees.sort((a, b) =>
            a.name.localeCompare(b.name)
          );
          setPayees(updatedPayees);
          onUpdate(updatedPayees);
          handleCancelEdit();
          notify("Payee updated successfully!", "success");
        } else if (result.error) {
          throw new Error(result.error);
        } else {
          const updatedPayees = payees.map((p) =>
            p.id === originalName ? { ...p, name: newName } : p
          );
          setPayees(updatedPayees.sort((a, b) => a.name.localeCompare(b.name)));
          onUpdate(updatedPayees.sort((a, b) => a.name.localeCompare(b.name)));
        handleCancelEdit();
          notify("Payee updated successfully (local update)!", "success");
        }
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error) {
      console.error("Error updating payee:", error);
      setError(error.message || "Failed to update payee");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const requestDeleteConfirmation = (payee) => {
    setDeleteConfirmMethod(payee.id);
    setEditingPayeeName(null);
  };

  const cancelDeleteConfirmation = () => {
    setDeleteConfirmMethod(null);
  };

  const confirmAndDeletePayee = async (payeeToDelete) => {
    if (!payeeToDelete || !payeeToDelete.id) return;
    const payeeId = payeeToDelete.id;
    const payeeName = payeeToDelete.name;

    setDeletingMethod(payeeId);
    setDeleteConfirmMethod(null);
    setError(null);

        try {
      const result = await callApi(`${PAYEES_API_PATH}/${payeeId}`, {
            method: "DELETE",
          });

      if (result && typeof result === "object") {
        if (result.success && Array.isArray(result.payees)) {
          const updatedPayees = result.payees.sort((a, b) =>
            a.name.localeCompare(b.name)
          );
          setPayees(updatedPayees);
          onUpdate(updatedPayees);
          notify("Payee deleted successfully.", "success");
        } else if (result.error) {
          throw new Error(result.error);
          } else {
          const updatedPayees = payees.filter((p) => p.id !== payeeId);
          setPayees(updatedPayees.sort((a, b) => a.name.localeCompare(b.name)));
          onUpdate(updatedPayees.sort((a, b) => a.name.localeCompare(b.name)));
          notify("Payee deleted successfully (using local update).", "success");
        }
      } else {
        throw new Error("Invalid response from server");
          }
    } catch (error) {
      console.error("Error deleting payee:", error);
      setError(error.message || "Failed to delete payee");
      notify(error.message || "An error occurred.", "error");
    } finally {
      setDeletingMethod(null);
      }
  };

  const isFetching = isLoading || !!deletingMethod || !!editingPayeeName;
  const canClose =
    !isLoading && !deletingMethod && !editingPayeeName && !deleteConfirmMethod;

  return (
    <Dialog
      open={open}
      onClose={canClose ? onClose : undefined}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>Manage Payees</DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            handleAddPayee();
          }}
          sx={{ display: "flex", gap: 1, mb: 2 }}
        >
          <TextField
            label="New Payee Name"
            value={newPayeeName}
            onChange={(e) => setNewPayeeName(e.target.value)}
            fullWidth
            size="small"
            disabled={isFetching}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={isFetching || !newPayeeName.trim()}
            sx={{ flexShrink: 0 }}
          >
            {isFetching ? <CircularProgress size={24} /> : "Add"}
          </Button>
        </Box>
        <Divider sx={{ my: 1 }} />
        {isFetching ? (
          <CircularProgress />
        ) : (
          <List dense disablePadding>
            {payees.map((payee) => {
              const isEditing = editingPayeeName === payee.id;
              const isDeleting = deletingMethod === payee.id;
              const showConfirm = deleteConfirmMethod === payee.id;

              return (
                <React.Fragment key={payee.id}>
                  {showConfirm ? (
                    <DeleteConfirmation
                      method={payee.name}
                      onCancel={cancelDeleteConfirmation}
                      onConfirm={() => confirmAndDeletePayee(payee)}
                    />
                  ) : isEditing ? (
                    <Box
                      sx={{
                        display: "flex",
                        width: "100%",
                        alignItems: "center",
                      }}
                    >
                      <TextField
                        value={editMethodValue}
                        onChange={(e) => setEditMethodValue(e.target.value)}
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
                    <ListItem
                      key={payee.id}
                      divider
                      sx={{ opacity: isDeleting ? 0.5 : 1 }}
                      secondaryAction={
                          <>
                            <IconButton
                              edge="end"
                              aria-label="edit"
                            onClick={() => handleEditPayee(payee)}
                              sx={{ mr: 0.5 }}
                            disabled={isDeleting || isSavingEdit}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              edge="end"
                              aria-label="delete"
                            onClick={() => requestDeleteConfirmation(payee)}
                            disabled={isDeleting || isSavingEdit}
                            color="error"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </>
                      }
                    >
                      <ListItemText primary={payee.name} />
                </ListItem>
                  )}
                </React.Fragment>
              );
            })}
            {payees.length === 0 && !isFetching && (
              <Typography
                sx={{ textAlign: "center", mt: 2, color: "text.secondary" }}
              >
                No payees defined yet.
              </Typography>
          )}
        </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={!canClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

ManagePayeesModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onUpdate: PropTypes.func.isRequired,
  payees: PropTypes.array,
};

export default ManagePayeesModal;
