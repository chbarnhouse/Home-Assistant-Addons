import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import { useSnackbar } from "../context/SnackbarContext";
import { callApi } from "../utils/api"; // Import the API utility function

function AddLiabilityModal({
  open,
  onClose,
  onAddLiability,
  liabilityTypes = [],
  banks = [],
}) {
  const initialFormData = {
    name: "",
    type: "", // Liability type (e.g., 'Manual Loan', 'Other Manual')
    value: "", // Amount owed (positive number)
    bank: "", // Optional bank/lender name
    interest_rate: "", // Optional interest rate
    start_date: "", // Optional start date YYYY-MM-DD
    notes: "",
  };
  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const { notify } = useSnackbar();

  useEffect(() => {
    if (open) {
      setFormData(initialFormData);
      setErrors({});
      setIsLoading(false);
    }
  }, [open]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = "Liability name is required.";
    if (!formData.type) newErrors.type = "Liability type is required.";
    if (
      !formData.value ||
      isNaN(formData.value) ||
      parseFloat(formData.value) <= 0
    ) {
      newErrors.value = "Valid, positive liability amount is required.";
    }
    if (
      formData.interest_rate &&
      (isNaN(formData.interest_rate) || parseFloat(formData.interest_rate) < 0)
    ) {
      newErrors.interest_rate = "Interest rate must be a non-negative number.";
    }
    // Basic date format validation (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (formData.start_date && !dateRegex.test(formData.start_date)) {
      newErrors.start_date = "Start date must be in YYYY-MM-DD format.";
    }
    // TODO: More robust date validation (e.g., check month/day validity)

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validateForm()) {
      notify("Please correct the errors in the form.", "warning");
      return;
    }

    setIsLoading(true);
    setErrors({});

    const payload = {
      name: formData.name.trim(),
      type: formData.type,
      value: parseFloat(formData.value),
      bank: formData.bank || null,
      interest_rate: formData.interest_rate
        ? parseFloat(formData.interest_rate)
        : null,
      start_date: formData.start_date || null,
      notes: formData.notes.trim() || null,
    };

    try {
      const result = await callApi("liabilities", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // Backend returns the created liability object on success
      onAddLiability(result); // Pass the new liability data back
      notify("Manual liability added successfully!", "success");
      onClose();
    } catch (error) {
      console.error("Error adding liability:", error);
      if (error.response && error.response.status === 400 && error.errors) {
        setErrors(error.errors);
        notify("Validation failed. Please check the fields.", "warning");
      } else {
        notify(error.message || "An unexpected error occurred.", "error");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={isLoading ? undefined : onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Add New Manual Liability</DialogTitle>
      <DialogContent dividers>
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
          <TextField
            margin="dense"
            label="Liability Name"
            type="text"
            fullWidth
            variant="outlined"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            required
            error={!!errors.name}
            helperText={errors.name}
            disabled={isLoading}
          />
          <FormControl
            fullWidth
            margin="dense"
            variant="outlined"
            required
            error={!!errors.type}
            disabled={isLoading}
          >
            <InputLabel id="liability-type-label">Liability Type</InputLabel>
            <Select
              labelId="liability-type-label"
              label="Liability Type"
              name="type"
              value={formData.type}
              onChange={handleInputChange}
            >
              <MenuItem value="" disabled>
                <em>Select a type...</em>
              </MenuItem>
              {liabilityTypes.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </Select>
            {errors.type && (
              <p
                style={{
                  color: "red",
                  fontSize: "0.75rem",
                  margin: "3px 14px 0",
                }}
              >
                {errors.type}
              </p>
            )}
          </FormControl>
          <TextField
            margin="dense"
            label="Amount Owed"
            type="number"
            fullWidth
            variant="outlined"
            name="value"
            value={formData.value}
            onChange={handleInputChange}
            required
            error={!!errors.value}
            helperText={
              errors.value ||
              "Enter the total amount owed as a positive number."
            }
            disabled={isLoading}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">$</InputAdornment>
              ),
              inputProps: { min: 0.01, step: "any" }, // Ensure positive value > 0
            }}
          />
          <FormControl
            fullWidth
            margin="dense"
            variant="outlined"
            disabled={isLoading}
          >
            <InputLabel id="liability-bank-label">
              Bank/Lender (Optional)
            </InputLabel>
            <Select
              labelId="liability-bank-label"
              label="Bank/Lender (Optional)"
              name="bank"
              value={formData.bank}
              onChange={handleInputChange}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {banks.map((bank) => (
                <MenuItem key={bank.name} value={bank.name}>
                  {bank.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            margin="dense"
            label="Interest Rate (Optional)"
            type="number"
            fullWidth
            variant="outlined"
            name="interest_rate"
            value={formData.interest_rate}
            onChange={handleInputChange}
            error={!!errors.interest_rate}
            helperText={errors.interest_rate}
            disabled={isLoading}
            InputProps={{
              endAdornment: <InputAdornment position="end">%</InputAdornment>,
              inputProps: { min: 0, step: "any" },
            }}
          />
          <TextField
            margin="dense"
            label="Start Date (Optional)"
            type="date" // Use date type input
            fullWidth
            variant="outlined"
            name="start_date"
            value={formData.start_date} // Should be in YYYY-MM-DD format
            onChange={handleInputChange}
            error={!!errors.start_date}
            helperText={errors.start_date || "YYYY-MM-DD"}
            disabled={isLoading}
            InputLabelProps={{
              shrink: true, // Keep label shrunk for date input
            }}
          />
          <TextField
            margin="dense"
            label="Notes (Optional)"
            type="text"
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            disabled={isLoading}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={isLoading}>
          {isLoading ? (
            <CircularProgress size={24} color="inherit" />
          ) : (
            "Add Liability"
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

AddLiabilityModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onAddLiability: PropTypes.func.isRequired,
  liabilityTypes: PropTypes.arrayOf(PropTypes.string).isRequired,
  banks: PropTypes.arrayOf(
    PropTypes.shape({ name: PropTypes.string.isRequired })
  ).isRequired,
};

export default AddLiabilityModal;
