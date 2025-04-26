import React, { useState, useEffect, memo } from "react";
import PropTypes from "prop-types";
import Modal from "@mui/material/Modal";
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
import Paper from "@mui/material/Paper";

// Rewards payees API endpoint
const REWARDS_PAYEES_API_PATH = "rewards_payees";

// Delete confirmation component
const DeleteConfirmation = ({ payee, onCancel, onConfirm }) => {
  const payeeName = typeof payee === "object" ? payee.name : payee;

  return (
    <ListItem sx={{ backgroundColor: "rgba(211, 47, 47, 0.1)", py: 1 }}>
      <Box sx={{ width: "100%" }}>
        <Typography variant="body2" sx={{ color: "error.main", mb: 0.5 }}>
          Delete "{payeeName}"?
        </Typography>
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button size="small" sx={{ mr: 1 }} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={() => onConfirm(payee)}
          >
            Delete
          </Button>
        </Box>
      </Box>
    </ListItem>
  );
};

DeleteConfirmation.propTypes = {
  payee: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string,
    }),
  ]).isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

const ManageRewardsPayeesModal = memo(function ManageRewardsPayeesModal({
  open,
  onClose,
  rewardsPayees = [],
  onUpdate,
}) {
  const [payees, setPayees] = useState([]);
  const [newPayeeName, setNewPayeeName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [deleteConfirmPayee, setDeleteConfirmPayee] = useState(null);
  const [editingPayeeName, setEditingPayeeName] = useState(null);
  const [editPayeeValue, setEditPayeeValue] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingPayee, setDeletingPayee] = useState(null);
  const [error, setError] = useState(null);
  const { notify } = useSnackbar();

  // Helper function to get payee name regardless of data format
  const getPayeeName = (payee) => {
    if (!payee) return "";
    return typeof payee === "object" && payee.name ? payee.name : String(payee);
  };

  // Helper function to sort payees
  const sortPayees = (payeeList) => {
    return [...payeeList].sort((a, b) => {
      const nameA = getPayeeName(a).toLowerCase();
      const nameB = getPayeeName(b).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  };

  // Initialize payees from props if available
  useEffect(() => {
    if (open && rewardsPayees.length > 0) {
      setPayees(sortPayees(rewardsPayees));
    }
  }, [open, rewardsPayees]);

  // Safe function to update parent component
  const safeUpdate = (updatedPayees) => {
    try {
      if (typeof onUpdate === "function") {
        onUpdate(updatedPayees);
      }
    } catch (err) {
      console.error("Error in onUpdate callback:", err);
      setError("Internal error updating rewards payees list");
      notify("Internal error occurred while updating payees", "error");
    }
  };

  const fetchPayees = async () => {
    setIsFetching(true);
    try {
      const data = await callApi(REWARDS_PAYEES_API_PATH, { method: "GET" });
      if (Array.isArray(data)) {
        setPayees(sortPayees(data));
      } else {
        console.error("Unexpected response format:", data);
        throw new Error("Unexpected response format from server");
      }
    } catch (error) {
      console.error("Error fetching rewards payees:", error);
      notify(error.message || "Could not load rewards payees.", "error");
      setPayees(sortPayees(rewardsPayees));
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchPayees();
      setNewPayeeName("");
      setIsLoading(false);
      setError(null);
      setEditingPayeeName(null);
      setDeleteConfirmPayee(null);
      setDeletingPayee(null);
    }
  }, [open]);

  const handleAddPayee = async () => {
    const nameToAdd = newPayeeName.trim();
    if (!nameToAdd) {
      notify("Rewards payee name cannot be empty.", "warning");
      return;
    }

    // Check for duplicate names
    if (
      payees.some(
        (p) => getPayeeName(p).toLowerCase() === nameToAdd.toLowerCase()
      )
    ) {
      notify(`Rewards payee "${nameToAdd}" already exists.`, "warning");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await callApi(REWARDS_PAYEES_API_PATH, {
        method: "POST",
        body: JSON.stringify({ name: nameToAdd }),
      });
      if (result && result.success && Array.isArray(result.payees)) {
        const sortedPayees = sortPayees(result.payees);
        setPayees(sortedPayees);
        safeUpdate(sortedPayees);
        setNewPayeeName("");
        notify("Rewards payee added successfully!", "success");
      } else if (result && result.error) {
        throw new Error(result.error);
      } else {
        throw new Error("Unexpected response from server");
      }
    } catch (error) {
      console.error("Error adding rewards payee:", error);
      setError(error.message || "Failed to add rewards payee");
      notify(error.message || "An error occurred.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const requestDeleteConfirmation = (payee) => {
    setDeleteConfirmPayee(payee);
    setEditingPayeeName(null);
  };

  const cancelDeleteConfirmation = () => {
    setDeleteConfirmPayee(null);
  };

  const confirmAndDeletePayee = async (payee) => {
    if (!payee) return;

    const payeeName = getPayeeName(payee);
    const payeeId = typeof payee === "object" && payee.id ? payee.id : null;

    setDeletingPayee(payee);
    setDeleteConfirmPayee(null);
    setError(null);

    try {
      const requestBody = { name: payeeName };
      if (payeeId) {
        requestBody.id = payeeId;
      }

      const result = await callApi(REWARDS_PAYEES_API_PATH, {
        method: "DELETE",
        body: JSON.stringify(requestBody),
      });

      if (result && result.success && Array.isArray(result.payees)) {
        setPayees(sortPayees(result.payees));
        safeUpdate(result.payees);
        notify("Rewards payee deleted successfully.", "success");
      } else if (result && result.error) {
        throw new Error(result.error);
      } else {
        // Fallback to local update
        const updatedPayees = payees.filter((p) => {
          const currentName = getPayeeName(p);
          return currentName.toLowerCase() !== payeeName.toLowerCase();
        });
        setPayees(sortPayees(updatedPayees));
        safeUpdate(updatedPayees);
        notify("Rewards payee deleted (local update).", "success");
      }
    } catch (error) {
      console.error("Error deleting rewards payee:", error);
      setError(error.message || "Failed to delete rewards payee");
      notify(error.message || "An error occurred.", "error");
    } finally {
      setDeletingPayee(null);
    }
  };

  const handleEditPayee = (payee) => {
    setEditingPayeeName(payee);
    setEditPayeeValue(getPayeeName(payee));
    setDeleteConfirmPayee(null);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingPayeeName(null);
    setEditPayeeValue("");
    setError(null);
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    const originalPayee = editingPayeeName;
    if (!originalPayee) return;

    const originalName = getPayeeName(originalPayee);
    const originalId =
      typeof originalPayee === "object" ? originalPayee.id : null;
    const newName = editPayeeValue.trim();

    if (!newName) {
      setError("Rewards payee name cannot be empty.");
      return;
    }

    if (newName === originalName) {
      handleCancelEdit();
      return;
    }

    // Check for duplicate
    if (
      payees.some((p) => {
        const pName = getPayeeName(p);
        return (
          pName.toLowerCase() === newName.toLowerCase() &&
          pName.toLowerCase() !== originalName.toLowerCase()
        );
      })
    ) {
      setError(`Rewards payee "${newName}" already exists.`);
      return;
    }

    setIsSavingEdit(true);
    setError(null);

    try {
      const requestBody = {
        originalName: originalName,
        newName: newName,
      };

      if (originalId) {
        requestBody.id = originalId;
      }

      const result = await callApi(REWARDS_PAYEES_API_PATH, {
        method: "PUT",
        body: JSON.stringify(requestBody),
      });

      if (result && result.success && Array.isArray(result.payees)) {
        setPayees(sortPayees(result.payees));
        safeUpdate(result.payees);
        notify("Rewards payee updated successfully.", "success");
        handleCancelEdit();
      } else if (result && result.error) {
        throw new Error(result.error);
      } else {
        // Fallback to local update
        const updatedPayees = payees.map((p) => {
          if (getPayeeName(p).toLowerCase() === originalName.toLowerCase()) {
            return typeof p === "object" ? { ...p, name: newName } : newName;
          }
          return p;
        });

        setPayees(sortPayees(updatedPayees));
        safeUpdate(updatedPayees);
        notify("Rewards payee updated (local update).", "success");
        handleCancelEdit();
      }
    } catch (error) {
      console.error("Error updating rewards payee:", error);
      setError(error.message || "Failed to update rewards payee");
      notify(error.message || "An error occurred.", "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const isBusy =
    isLoading || isSavingEdit || !!deletingPayee || !!editingPayeeName;
  const canClose = !isBusy && !deleteConfirmPayee;

  return (
    <Modal
      open={open}
      onClose={canClose ? onClose : undefined}
      closeAfterTransition
      disableAutoFocus
      disableEnforceFocus
      disableRestoreFocus
      disableScrollLock
      keepMounted
      container={document.body}
      sx={{ zIndex: 1500 }}
      BackdropProps={{
        timeout: 500,
        onClick: (e) => {
          e.stopPropagation();
        },
      }}
    >
      <Paper
        elevation={6}
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "80%",
          maxWidth: "xs",
          p: 4,
          zIndex: 1500,
          backgroundColor: "background.paper",
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <DialogTitle>Manage Rewards Payees</DialogTitle>
        <DialogContent dividers>
          {error && (
            <Alert
              severity="error"
              sx={{ mb: 2 }}
              onClose={() => setError(null)}
            >
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
              {payees.length === 0 && !isLoading && (
                <ListItem>
                  <ListItemText primary="No rewards payees found." />
                </ListItem>
              )}
              {payees.map((payee, index) => {
                const payeeName = getPayeeName(payee);
                const payeeId =
                  typeof payee === "object" ? payee.id : index.toString();
                const isBeingDeleted =
                  deletingPayee && getPayeeName(deletingPayee) === payeeName;
                const isBeingEdited =
                  editingPayeeName &&
                  getPayeeName(editingPayeeName) === payeeName;
                const isConfirmingDelete =
                  deleteConfirmPayee &&
                  getPayeeName(deleteConfirmPayee) === payeeName;

                if (isConfirmingDelete) {
                  return (
                    <DeleteConfirmation
                      key={payeeId}
                      payee={payee}
                      onCancel={cancelDeleteConfirmation}
                      onConfirm={confirmAndDeletePayee}
                    />
                  );
                }
                if (isBeingEdited) {
                  return (
                    <ListItem key={payeeId} sx={{ pl: 1, pr: 1 }}>
                      <Box
                        component="form"
                        onSubmit={handleSaveEdit}
                        sx={{ display: "flex", width: "100%", gap: 1 }}
                      >
                        <TextField
                          value={editPayeeValue}
                          onChange={(e) => setEditPayeeValue(e.target.value)}
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
                    key={payeeId}
                    secondaryAction={
                      isBeingDeleted ? (
                        <CircularProgress size={20} />
                      ) : (
                        <Box>
                          <IconButton
                            edge="end"
                            aria-label="edit"
                            onClick={() => handleEditPayee(payee)}
                            disabled={isBusy || !!deleteConfirmPayee}
                            size="small"
                            sx={{ mr: 0.5 }}
                          >
                            <EditIcon fontSize="inherit" />
                          </IconButton>
                          <IconButton
                            edge="end"
                            aria-label="delete"
                            onClick={() => requestDeleteConfirmation(payee)}
                            disabled={isBusy || !!deleteConfirmPayee}
                            size="small"
                          >
                            <DeleteIcon fontSize="inherit" />
                          </IconButton>
                        </Box>
                      )
                    }
                  >
                    <ListItemText primary={payeeName} />
                  </ListItem>
                );
              })}
            </List>
          )}
          <Box
            component="form"
            onSubmit={(e) => {
              e.preventDefault();
              handleAddPayee();
            }}
            sx={{ mt: 2, display: "flex", gap: 1 }}
          >
            <TextField
              label="New Rewards Payee"
              variant="outlined"
              size="small"
              fullWidth
              value={newPayeeName}
              onChange={(e) => setNewPayeeName(e.target.value)}
              disabled={isLoading || isFetching}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={isLoading || isFetching || !newPayeeName.trim()}
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
      </Paper>
    </Modal>
  );
});

ManageRewardsPayeesModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  rewardsPayees: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
      }),
    ])
  ),
  onUpdate: PropTypes.func.isRequired,
};

export default ManageRewardsPayeesModal;
