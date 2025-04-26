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

// Rewards categories API endpoint
const REWARDS_CATEGORIES_API_PATH = "rewards_categories";

// Delete confirmation component
const DeleteConfirmation = ({ category, onCancel, onConfirm }) => {
  return (
    <ListItem sx={{ backgroundColor: "rgba(211, 47, 47, 0.1)", py: 1 }}>
      <Box sx={{ width: "100%" }}>
        <Typography variant="body2" sx={{ color: "error.main", mb: 0.5 }}>
          Delete "{category}"?
        </Typography>
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button size="small" sx={{ mr: 1 }} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={() => onConfirm(category)}
          >
            Delete
          </Button>
        </Box>
      </Box>
    </ListItem>
  );
};

DeleteConfirmation.propTypes = {
  category: PropTypes.string.isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

const ManageRewardsCategoriesModal = memo(
  function ManageRewardsCategoriesModal({
    open,
    onClose,
    rewardsCategories = [],
    onUpdate,
  }) {
    const [categories, setCategories] = useState([]);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [deleteConfirmCategory, setDeleteConfirmCategory] = useState(null);
    const [editingCategoryName, setEditingCategoryName] = useState(null);
    const [editCategoryValue, setEditCategoryValue] = useState("");
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [deletingCategory, setDeletingCategory] = useState(null);
    const [error, setError] = useState(null);
    const { notify } = useSnackbar();

    // Initialize categories from props if available
    useEffect(() => {
      if (open && rewardsCategories.length > 0) {
        setCategories(rewardsCategories.sort());
      }
    }, [open, rewardsCategories]);

    // Safe function to update parent component
    const safeUpdate = (updatedCategories) => {
      try {
        if (typeof onUpdate === "function") {
          onUpdate(updatedCategories);
        }
      } catch (err) {
        console.error("Error in onUpdate callback:", err);
        setError("Internal error updating rewards categories list");
        notify("Internal error occurred while updating categories", "error");
      }
    };

    const fetchCategories = async () => {
      setIsFetching(true);
      try {
        const data = await callApi(REWARDS_CATEGORIES_API_PATH, {
          method: "GET",
        });
        if (Array.isArray(data)) {
          setCategories(data.sort());
        } else {
          console.error("Unexpected response format:", data);
          throw new Error("Unexpected response format from server");
        }
      } catch (error) {
        console.error("Error fetching rewards categories:", error);
        notify(error.message || "Could not load rewards categories.", "error");
        setCategories(rewardsCategories.sort());
      } finally {
        setIsFetching(false);
      }
    };

    useEffect(() => {
      if (open) {
        fetchCategories();
        setNewCategoryName("");
        setIsLoading(false);
        setError(null);
        setEditingCategoryName(null);
        setDeleteConfirmCategory(null);
        setDeletingCategory(null);
      }
    }, [open]);

    const handleAddCategory = async () => {
      const nameToAdd = newCategoryName.trim();
      if (!nameToAdd) {
        notify("Rewards category name cannot be empty.", "warning");
        return;
      }
      if (categories.some((c) => c.toLowerCase() === nameToAdd.toLowerCase())) {
        notify(`Rewards category "${nameToAdd}" already exists.`, "warning");
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const result = await callApi(REWARDS_CATEGORIES_API_PATH, {
          method: "POST",
          body: JSON.stringify({ name: nameToAdd }),
        });
        if (result && result.success && Array.isArray(result.categories)) {
          const sortedCategories = [...result.categories].sort();
          setCategories(sortedCategories);
          safeUpdate(sortedCategories);
          setNewCategoryName("");
          notify("Rewards category added successfully!", "success");
        } else if (result && result.error) {
          throw new Error(result.error);
        } else {
          throw new Error("Unexpected response from server");
        }
      } catch (error) {
        console.error("Error adding rewards category:", error);
        setError(error.message || "Failed to add rewards category");
        notify(error.message || "An error occurred.", "error");
      } finally {
        setIsLoading(false);
      }
    };

    const requestDeleteConfirmation = (categoryName) => {
      setDeleteConfirmCategory(categoryName);
      setEditingCategoryName(null);
    };

    const cancelDeleteConfirmation = () => {
      setDeleteConfirmCategory(null);
    };

    const confirmAndDeleteCategory = async (categoryName) => {
      if (!categoryName) return;
      setDeletingCategory(categoryName);
      setDeleteConfirmCategory(null);
      setError(null);
      try {
        const result = await callApi(REWARDS_CATEGORIES_API_PATH, {
          method: "DELETE",
          body: JSON.stringify({ name: categoryName }),
        });
        if (result && result.success && Array.isArray(result.categories)) {
          setCategories(result.categories.sort());
          safeUpdate(result.categories);
          notify("Rewards category deleted successfully.", "success");
        } else if (result && result.error) {
          throw new Error(result.error);
        } else {
          const updatedCategories = categories.filter(
            (c) => c.toLowerCase() !== categoryName.toLowerCase()
          );
          setCategories(updatedCategories);
          safeUpdate(updatedCategories);
          notify("Rewards category deleted (local update).", "success");
        }
      } catch (error) {
        console.error("Error deleting rewards category:", error);
        setError(error.message || "Failed to delete rewards category");
        notify(error.message || "An error occurred.", "error");
      } finally {
        setDeletingCategory(null);
      }
    };

    const handleEditCategory = (categoryName) => {
      setEditingCategoryName(categoryName);
      setEditCategoryValue(categoryName);
      setDeleteConfirmCategory(null);
      setError(null);
    };

    const handleCancelEdit = () => {
      setEditingCategoryName(null);
      setEditCategoryValue("");
      setError(null);
    };

    const handleSaveEdit = async (event) => {
      event.preventDefault();
      const originalName = editingCategoryName;
      const newName = editCategoryValue.trim();
      if (!newName) {
        setError("Rewards category name cannot be empty.");
        return;
      }
      if (newName === originalName) {
        handleCancelEdit();
        return;
      }
      if (categories.some((c) => c.toLowerCase() === newName.toLowerCase())) {
        setError(`Rewards category "${newName}" already exists.`);
        return;
      }
      setIsSavingEdit(true);
      setError(null);
      try {
        const result = await callApi(REWARDS_CATEGORIES_API_PATH, {
          method: "PUT",
          body: JSON.stringify({ originalName, newName }),
        });
        if (result && result.success && Array.isArray(result.categories)) {
          setCategories(result.categories.sort());
          safeUpdate(result.categories);
          notify("Rewards category updated successfully.", "success");
          handleCancelEdit();
        } else if (result && result.error) {
          throw new Error(result.error);
        } else {
          const updatedCategories = categories
            .map((c) => (c === originalName ? newName : c))
            .sort();
          setCategories(updatedCategories);
          safeUpdate(updatedCategories);
          notify("Rewards category updated (local update).", "success");
          handleCancelEdit();
        }
      } catch (error) {
        console.error("Error updating rewards category:", error);
        setError(error.message || "Failed to update rewards category");
        notify(error.message || "An error occurred.", "error");
      } finally {
        setIsSavingEdit(false);
      }
    };

    const isBusy =
      isLoading || isSavingEdit || !!deletingCategory || !!editingCategoryName;
    const canClose = !isBusy && !deleteConfirmCategory;

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
          <DialogTitle>Manage Rewards Categories</DialogTitle>
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
                {categories.length === 0 && !isLoading && (
                  <ListItem>
                    <ListItemText primary="No rewards categories found." />
                  </ListItem>
                )}
                {categories.map((categoryName) => {
                  const isBeingDeleted = deletingCategory === categoryName;
                  const isBeingEdited = editingCategoryName === categoryName;
                  const isConfirmingDelete =
                    deleteConfirmCategory === categoryName;

                  if (isConfirmingDelete) {
                    return (
                      <DeleteConfirmation
                        key={categoryName}
                        category={categoryName}
                        onCancel={cancelDeleteConfirmation}
                        onConfirm={confirmAndDeleteCategory}
                      />
                    );
                  }
                  if (isBeingEdited) {
                    return (
                      <ListItem key={categoryName} sx={{ pl: 1, pr: 1 }}>
                        <Box
                          component="form"
                          onSubmit={handleSaveEdit}
                          sx={{ display: "flex", width: "100%", gap: 1 }}
                        >
                          <TextField
                            value={editCategoryValue}
                            onChange={(e) =>
                              setEditCategoryValue(e.target.value)
                            }
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
                      key={categoryName}
                      secondaryAction={
                        isBeingDeleted ? (
                          <CircularProgress size={20} />
                        ) : (
                          <Box>
                            <IconButton
                              edge="end"
                              aria-label="edit"
                              onClick={() => handleEditCategory(categoryName)}
                              disabled={isBusy || !!deleteConfirmCategory}
                              size="small"
                              sx={{ mr: 0.5 }}
                            >
                              <EditIcon fontSize="inherit" />
                            </IconButton>
                            <IconButton
                              edge="end"
                              aria-label="delete"
                              onClick={() =>
                                requestDeleteConfirmation(categoryName)
                              }
                              disabled={isBusy || !!deleteConfirmCategory}
                              size="small"
                            >
                              <DeleteIcon fontSize="inherit" />
                            </IconButton>
                          </Box>
                        )
                      }
                    >
                      <ListItemText primary={categoryName} />
                    </ListItem>
                  );
                })}
              </List>
            )}
            <Box
              component="form"
              onSubmit={(e) => {
                e.preventDefault();
                handleAddCategory();
              }}
              sx={{ mt: 2, display: "flex", gap: 1 }}
            >
              <TextField
                label="New Rewards Category"
                variant="outlined"
                size="small"
                fullWidth
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                disabled={isLoading || isFetching}
              />
              <Button
                type="submit"
                variant="contained"
                disabled={isLoading || isFetching || !newCategoryName.trim()}
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
  }
);

ManageRewardsCategoriesModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  rewardsCategories: PropTypes.array,
  onUpdate: PropTypes.func.isRequired,
};

export default ManageRewardsCategoriesModal;
