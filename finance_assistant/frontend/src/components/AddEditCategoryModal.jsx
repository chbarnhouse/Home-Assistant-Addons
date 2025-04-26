import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";

const initialFormData = {
  name: "",
  group_name: "", // Optional
};

function AddEditCategoryModal({
  open,
  onClose,
  onSubmit,
  categoryToEdit,
  existingCategories = [], // Receive existing categories for validation
}) {
  const [formData, setFormData] = useState(initialFormData);
  const [error, setError] = useState(null); // Specific error for the modal
  const isEditing = !!categoryToEdit;

  useEffect(() => {
    if (open) {
      if (isEditing) {
        // Populate form if editing
        setFormData({
          name: categoryToEdit.name || "",
          group_name: categoryToEdit.group_name || "",
        });
      } else {
        // Reset form if adding
        setFormData(initialFormData);
      }
      setError(null); // Clear error when modal opens or switches mode
    } else {
      // Optionally clear form data when closed, if desired
      // setFormData(initialFormData);
      // setError(null);
    }
  }, [open, categoryToEdit, isEditing]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null); // Clear error on input change
  };

  const validateForm = () => {
    const { name, group_name } = formData;
    if (!name.trim()) {
      setError("Category name cannot be empty.");
      return false;
    }

    // Check for duplicates (case-insensitive, within the same group)
    const currentId = categoryToEdit?.id;
    const lowerCaseName = name.trim().toLowerCase();
    const targetGroup = group_name?.trim() || "Uncategorized";

    const duplicate = existingCategories.find(
      (cat) =>
        cat.id !== currentId && // Don't compare against itself when editing
        cat.name.trim().toLowerCase() === lowerCaseName &&
        (cat.group_name?.trim() || "Uncategorized") === targetGroup
    );

    if (duplicate) {
      setError(
        `A category named "${name.trim()}" already exists` +
          (targetGroup !== "Uncategorized"
            ? ` in the group "${targetGroup}".`
            : ".")
      );
      return false;
    }

    setError(null);
    return true;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validateForm()) {
      return; // Stop submission if validation fails
    }
    // Submit the validated data (trimming whitespace)
    onSubmit({
      name: formData.name.trim(),
      group_name: formData.group_name.trim() || null, // Send null if empty/whitespace
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {isEditing ? "Edit Category" : "Add New Category"}
      </DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <form onSubmit={handleSubmit}>
          <TextField
            autoFocus
            margin="dense"
            id="category-name"
            label="Category Name"
            type="text"
            name="name"
            fullWidth
            variant="outlined"
            value={formData.name}
            onChange={handleInputChange}
            required
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            id="category-group-name"
            label="Group Name (Optional)"
            type="text"
            name="group_name"
            fullWidth
            variant="outlined"
            value={formData.group_name}
            onChange={handleInputChange}
            helperText="Leave blank for 'Uncategorized'"
          />
        </form>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained">
          {isEditing ? "Save Changes" : "Add Category"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

AddEditCategoryModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  categoryToEdit: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    group_name: PropTypes.string,
  }),
  existingCategories: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      group_name: PropTypes.string,
    })
  ).isRequired,
};

export default AddEditCategoryModal;
