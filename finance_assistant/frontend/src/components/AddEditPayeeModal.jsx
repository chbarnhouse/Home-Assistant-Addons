import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";

const initialFormData = { name: "" };

function AddEditPayeeModal({
  open,
  onClose,
  onSubmit,
  payeeToEdit,
  existingPayees = [], // Receive existing for validation
}) {
  const [formData, setFormData] = useState(initialFormData);
  const [error, setError] = useState(null); // Specific error for the modal
  const isEditing = !!payeeToEdit;

  useEffect(() => {
    if (open) {
      if (isEditing) {
        setFormData({ name: payeeToEdit.name || "" });
      } else {
        setFormData(initialFormData);
      }
      setError(null);
    } else {
      // Clear form when closed
      // setFormData(initialFormData);
      // setError(null);
    }
  }, [open, payeeToEdit, isEditing]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null); // Clear error on input change
  };

  const validateForm = () => {
    const { name } = formData;
    if (!name.trim()) {
      setError("Payee name cannot be empty.");
      return false;
    }

    // Check for duplicates (case-insensitive)
    const currentId = payeeToEdit?.id;
    const lowerCaseName = name.trim().toLowerCase();

    const duplicate = existingPayees.find(
      (p) => p.id !== currentId && p.name.trim().toLowerCase() === lowerCaseName
    );

    if (duplicate) {
      setError(`A payee named "${name.trim()}" already exists.`);
      return false;
    }

    setError(null);
    return true;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validateForm()) {
      return;
    }
    onSubmit({ name: formData.name.trim() });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{isEditing ? "Edit Payee" : "Add New Payee"}</DialogTitle>
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
            id="payee-name"
            label="Payee Name"
            type="text"
            name="name"
            fullWidth
            variant="outlined"
            value={formData.name}
            onChange={handleInputChange}
            required
          />
        </form>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained">
          {isEditing ? "Save Changes" : "Add Payee"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

AddEditPayeeModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  payeeToEdit: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
  }),
  existingPayees: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
    })
  ).isRequired,
};

export default AddEditPayeeModal;
