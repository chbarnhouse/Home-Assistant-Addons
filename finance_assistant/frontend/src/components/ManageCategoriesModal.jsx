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

// Managed Categories API endpoint
const CATEGORIES_API_PATH = "managed_categories";

// Separate component for delete confirmation to isolate potential issues
const DeleteConfirmation = ({ category, onCancel, onConfirm }) => {
  // Safely wrap the confirm function to prevent errors
  const handleConfirm = useCallback(() => {
    try {
      if (onConfirm && typeof onConfirm === "function") {
        onConfirm(category);
      }
    } catch (err) {
      console.error("Error in delete confirmation:", err);
    }
  }, [category, onConfirm]);

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
          Delete "{category}"?
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
  category: PropTypes.string.isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

function ManageCategoriesModal({
  open,
  onClose,
  onUpdate,
  categories: initialCategories = [],
}) {
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [deletingMethod, setDeletingMethod] = useState(null);
  const [deleteConfirmMethod, setDeleteConfirmMethod] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState(null);
  const [editMethodValue, setEditMethodValue] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [error, setError] = useState(null);
  const { notify } = useSnackbar();

  // Update local state when prop changes
  useEffect(() => {
    setCategories(
      Array.isArray(initialCategories)
        ? [...initialCategories].sort((a, b) => a.name.localeCompare(b.name))
        : []
    );
  }, [initialCategories]);

  // Safe function to update parent component
  const safeUpdate = (updatedCategories) => {
    onUpdate(updatedCategories);
  };

  useEffect(() => {
    if (open) {
      // Set state from props when modal opens
      setCategories(
        Array.isArray(initialCategories)
          ? [...initialCategories].sort((a, b) => a.name.localeCompare(b.name))
          : []
      );
      setNewCategoryName("");
      setEditingCategoryName(null);
      setEditMethodValue("");
      setError(null);
      setIsLoading(false);
      setDeletingMethod(null);
      setDeleteConfirmMethod(null);
    }
  }, [open, initialCategories]);

  const handleAddCategory = async () => {
    const nameToAdd = newCategoryName.trim();
    if (!nameToAdd) {
      notify("Category name cannot be empty.", "warning");
      return;
    }
    if (
      categories.some((c) => c.name.toLowerCase() === nameToAdd.toLowerCase())
    ) {
      notify(`Category "${nameToAdd}" already exists.`, "warning");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await callApi(CATEGORIES_API_PATH, {
        method: "POST",
        body: JSON.stringify({ name: nameToAdd }),
      });

      if (!result || typeof result !== "object") {
        throw new Error("Failed to add category: Invalid response");
      }

      // Check for categories key in response
      if (result.success && Array.isArray(result.categories)) {
        const sortedCategories = [...result.categories].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        setCategories(sortedCategories);
        safeUpdate(sortedCategories);
        setNewCategoryName("");
        notify("Category added successfully!", "success");
      } else if (result.error) {
        throw new Error(result.error);
      } else {
        throw new Error("Unexpected response from server");
      }
    } catch (error) {
      console.error("Error adding category:", error);
      setError(error.message || "Failed to add category");
      notify(error.message || "An error occurred.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const requestDeleteConfirmation = (category) => {
    setDeleteConfirmMethod(category.id);
    setEditingCategoryName(null);
  };

  const cancelDeleteConfirmation = useCallback(() => {
    try {
      setDeleteConfirmMethod(null);
    } catch (err) {
      console.error("Error canceling delete confirmation:", err);
    }
  }, []);

  const confirmAndDeleteCategory = async (categoryToDelete) => {
    if (!categoryToDelete || !categoryToDelete.id) return;
    const categoryId = categoryToDelete.id;
    const categoryName = categoryToDelete.name;

    setDeletingMethod(categoryId);
    setDeleteConfirmMethod(null);
    setError(null);

    try {
      const result = await callApi(`${CATEGORIES_API_PATH}/${categoryId}`, {
        method: "DELETE",
      });

      if (result && typeof result === "object") {
        // Check for categories key in response
        if (result.success && Array.isArray(result.categories)) {
          setCategories(
            result.categories.sort((a, b) => a.name.localeCompare(b.name))
          );
          safeUpdate(result.categories);
          notify("Category deleted successfully.", "success");
        } else if (result.error) {
          throw new Error(result.error);
        } else {
          // Fallback: Update local state
          const updatedCategories = categories.filter(
            (cat) => cat.id !== categoryId
          );
          setCategories(updatedCategories);
          safeUpdate(updatedCategories);
          notify(
            "Category deleted successfully (using local update).",
            "success"
          );
        }
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error) {
      console.error("Error deleting category:", error);
      setError(error.message || "Failed to delete category");
      notify(error.message || "An error occurred.", "error");
    } finally {
      setDeletingMethod(null);
    }
  };

  const handleEditCategory = (category) => {
    setEditingCategoryName(category.id);
    setEditMethodValue(category.name);
    setDeleteConfirmMethod(null);
    setError(null);
  };

  const handleCancelEdit = () => {
    setError(null);
    setEditingCategoryName(null);
    setEditMethodValue("");
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    const originalName = editingCategoryName;
    const newName = editMethodValue.trim();

    if (
      categories.some((c) => c.name.toLowerCase() === newName.toLowerCase())
    ) {
      setError(`Category "${newName}" already exists.`);
      return;
    }

    setIsSavingEdit(true);
    setError(null);
    try {
      const result = await callApi(CATEGORIES_API_PATH, {
        method: "PUT",
        body: JSON.stringify({
          original_name: originalName,
          new_name: newName,
        }),
      });

      if (result && typeof result === "object") {
        // Check for categories key in response
        if (result.success && Array.isArray(result.categories)) {
          setCategories(
            result.categories.sort((a, b) => a.name.localeCompare(b.name))
          );
          safeUpdate(result.categories);
          handleCancelEdit();
          notify("Category updated successfully!", "success");
        } else if (result.error) {
          throw new Error(result.error);
        } else {
          // Fallback update
          const updatedCategories = categories.map((cat) =>
            cat.id === originalName ? { ...cat, name: newName } : cat
          );
          setCategories(
            updatedCategories.sort((a, b) => a.name.localeCompare(b.name))
          );
          safeUpdate(
            updatedCategories.sort((a, b) => a.name.localeCompare(b.name))
          );
          handleCancelEdit();
          notify("Category updated successfully (local update)!", "success");
        }
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error) {
      console.error("Error updating category:", error);
      setError(error.message || "Failed to update category");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const isFetching = isLoading || !!deletingMethod || !!editingCategoryName;
  const canClose =
    !isLoading &&
    !deletingMethod &&
    !editingCategoryName &&
    !deleteConfirmMethod;

  return (
    <Dialog
      open={open}
      onClose={canClose ? onClose : undefined}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>Manage Categories</DialogTitle>
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
            handleAddCategory();
          }}
          sx={{ display: "flex", gap: 1, mb: 2 }}
        >
          <TextField
            label="New Category Name"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            fullWidth
            size="small"
            disabled={isFetching}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={isFetching || !newCategoryName.trim()}
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
            {categories.map((category) => {
              const isEditing = editingCategoryName === category.id;
              const isDeleting = deletingMethod === category.id;
              const showConfirm = deleteConfirmMethod === category.id;

              return (
                <React.Fragment key={category.id}>
                  {showConfirm ? (
                    <DeleteConfirmation
                      category={category.name}
                      onCancel={cancelDeleteConfirmation}
                      onConfirm={() => confirmAndDeleteCategory(category)}
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
                      key={category.id}
                      divider
                      sx={{ opacity: isDeleting ? 0.5 : 1 }}
                      secondaryAction={
                        <>
                          <IconButton
                            edge="end"
                            aria-label="edit"
                            onClick={() => handleEditCategory(category)}
                            sx={{ mr: 0.5 }}
                            disabled={isDeleting || isSavingEdit}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            edge="end"
                            aria-label="delete"
                            onClick={() => requestDeleteConfirmation(category)}
                            disabled={isDeleting || isSavingEdit}
                            color="error"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </>
                      }
                    >
                      <ListItemText primary={category.name} />
                    </ListItem>
                  )}
                </React.Fragment>
              );
            })}
            {categories.length === 0 && !isFetching && (
              <Typography
                sx={{ textAlign: "center", mt: 2, color: "text.secondary" }}
              >
                No categories defined yet.
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

ManageCategoriesModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onUpdate: PropTypes.func.isRequired,
  categories: PropTypes.array,
};

export default ManageCategoriesModal;
