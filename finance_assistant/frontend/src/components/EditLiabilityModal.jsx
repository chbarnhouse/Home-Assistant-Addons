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
import { useSnackbar } from "../context/SnackbarContext"; // Import hook
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import ManageBanksButton from "./ManageBanksButton";
import ManageLiabilityTypesButton from "./ManageLiabilityTypesButton";
import FormHelperText from "@mui/material/FormHelperText";
import Autocomplete from "@mui/material/Autocomplete";

// Banks API endpoint for adding new banks
const BANKS_API = "/api/banks";

function EditLiabilityModal({
  open,
  onClose,
  onUpdateLiability,
  liabilityToEdit,
  liabilityTypes = [],
  banks = [],
  onOpenManageTypes,
  onOpenManageBanks,
}) {
  const initialFormData = {
    name: "",
    type: "",
    value: "",
    bank: "",
    interest_rate: "",
    start_date: "",
    notes: "",
    minimum_payment: "",
    payment_due_date: "",
  };
  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingBank, setIsAddingBank] = useState(false);
  const { notify } = useSnackbar(); // Use snackbar

  useEffect(() => {
    if (open && liabilityToEdit) {
      setFormData({
        name: liabilityToEdit.name || "",
        type: liabilityToEdit.type || "",
        value: liabilityToEdit.value?.toString() || "0",
        bank: liabilityToEdit.bank || "",
        interest_rate: liabilityToEdit.interest_rate?.toString() || "",
        start_date: liabilityToEdit.start_date || "",
        notes: liabilityToEdit.notes || "",
        minimum_payment: liabilityToEdit.minimum_payment?.toString() || "",
        payment_due_date: liabilityToEdit.payment_due_date || "",
      });
      setErrors({});
      setIsLoading(false);
    } else if (!open) {
      setFormData(initialFormData);
      setErrors({});
    }
  }, [open, liabilityToEdit]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  // Handle bank selection or creation via Autocomplete
  const handleBankChange = (event, newValue) => {
    if (typeof newValue === "string") {
      // User entered a custom value
      handleAddNewBank(newValue);
    } else {
      // User selected an existing bank or cleared the selection
      setFormData((prev) => ({
        ...prev,
        bank: newValue || "",
      }));
    }
  };

  // Function to handle adding a new bank
  const handleAddNewBank = async (bankName) => {
    if (!bankName.trim()) return;

    setIsAddingBank(true);
    try {
      const response = await fetch(BANKS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: bankName.trim() }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          errData.error || `HTTP error! status: ${response.status}`
        );
      }

      const result = await response.json();
      if (result.success) {
        // Update the bank in form data
        setFormData((prev) => ({
          ...prev,
          bank: bankName.trim(),
        }));

        // Notify about successful bank addition
        notify("Bank added successfully", "success");

        // Update the banks list if needed
        if (onUpdateLiability && typeof onUpdateLiability === "function") {
          // This assumes there's a way to update banks list via callback
          // You might need a different approach depending on your app structure
        }
      }
    } catch (err) {
      console.error("Error adding bank:", err);
      notify(err.message || "Failed to add bank", "error");
    } finally {
      setIsAddingBank(false);
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
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (formData.start_date && !dateRegex.test(formData.start_date)) {
      newErrors.start_date = "Start date must be in YYYY-MM-DD format.";
    }
    if (
      formData.payment_due_date &&
      !dateRegex.test(formData.payment_due_date)
    ) {
      newErrors.payment_due_date =
        "Payment due date must be in YYYY-MM-DD format.";
    }
    if (
      formData.minimum_payment &&
      (isNaN(formData.minimum_payment) ||
        parseFloat(formData.minimum_payment) < 0)
    ) {
      newErrors.minimum_payment =
        "Minimum payment must be a non-negative number.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!liabilityToEdit || !liabilityToEdit.id) {
      notify("Cannot update liability: Invalid data provided.", "error");
      return;
    }

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
      minimum_payment: formData.minimum_payment
        ? parseFloat(formData.minimum_payment)
        : null,
      payment_due_date: formData.payment_due_date || null,
    };

    try {
      const response = await fetch(`/api/liabilities/${liabilityToEdit.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (response.ok) {
        onUpdateLiability(result.liability || result);
        notify("Liability updated successfully!", "success");
        onClose();
      } else if (response.status === 400 && result.errors) {
        setErrors(result.errors);
        notify("Validation failed. Please check the fields.", "warning");
      } else {
        throw new Error(result.error || "Failed to update liability.");
      }
    } catch (error) {
      console.error("Error updating liability:", error);
      notify(error.message || "An unexpected error occurred.", "error");
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
      <DialogTitle>Edit Manual Liability: {liabilityToEdit?.name}</DialogTitle>
      <DialogContent dividers>
        {liabilityToEdit ? (
          <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            sx={{ mt: 1 }}
          >
            {/* Basic Information Section */}
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Basic Information
            </Typography>

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
              sx={{ mb: 2 }}
            />

            {/* Type Select with Manage Types Button */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
              <FormControl
                fullWidth
                margin="dense"
                variant="outlined"
                required
                error={!!errors.type}
                disabled={isLoading}
              >
                <InputLabel id="liability-type-label-edit">
                  Liability Type
                </InputLabel>
                <Select
                  labelId="liability-type-label-edit"
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
                {errors.type && <FormHelperText>{errors.type}</FormHelperText>}
              </FormControl>
              {onOpenManageTypes && (
                <ManageLiabilityTypesButton
                  onClick={onOpenManageTypes}
                  disabled={isLoading}
                />
              )}
            </Box>

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
                inputProps: { min: 0.01, step: "any" },
              }}
              sx={{ mb: 2 }}
            />

            {/* Replace Bank Select with Autocomplete */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
              <Autocomplete
                freeSolo
                fullWidth
                id="liability-bank-autocomplete"
                options={banks.map((bank) =>
                  typeof bank === "string" ? bank : bank.name
                )}
                value={formData.bank || null}
                onChange={handleBankChange}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Bank/Lender (Optional)"
                    name="bank"
                    disabled={isLoading || isAddingBank}
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {isAddingBank ? (
                            <CircularProgress size={20} />
                          ) : (
                            params.InputProps.endAdornment
                          )}
                        </>
                      ),
                    }}
                  />
                )}
                disabled={isLoading}
              />
              {onOpenManageBanks && (
                <ManageBanksButton
                  onClick={onOpenManageBanks}
                  disabled={isLoading}
                />
              )}
            </Box>

            {/* Financial Details Section */}
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Financial Details
            </Typography>

            <TextField
              margin="dense"
              label="Interest Rate"
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
              sx={{ mb: 2 }}
            />

            <TextField
              margin="dense"
              label="Minimum Payment"
              type="number"
              fullWidth
              variant="outlined"
              name="minimum_payment"
              value={formData.minimum_payment}
              onChange={handleInputChange}
              error={!!errors.minimum_payment}
              helperText={errors.minimum_payment}
              disabled={isLoading}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">$</InputAdornment>
                ),
                inputProps: { min: 0, step: "any" },
              }}
              sx={{ mb: 2 }}
            />

            {/* Timeline Section */}
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Timeline
            </Typography>

            <TextField
              margin="dense"
              label="Start Date"
              type="date"
              fullWidth
              variant="outlined"
              name="start_date"
              value={formData.start_date}
              onChange={handleInputChange}
              error={!!errors.start_date}
              helperText={errors.start_date || "YYYY-MM-DD"}
              disabled={isLoading}
              InputLabelProps={{
                shrink: true,
              }}
              sx={{ mb: 2 }}
            />

            <TextField
              margin="dense"
              label="Payment Due Date"
              type="date"
              fullWidth
              variant="outlined"
              name="payment_due_date"
              value={formData.payment_due_date}
              onChange={handleInputChange}
              error={!!errors.payment_due_date}
              helperText={errors.payment_due_date || "YYYY-MM-DD"}
              disabled={isLoading}
              InputLabelProps={{
                shrink: true,
              }}
              sx={{ mb: 2 }}
            />

            {/* Additional Information Section */}
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Additional Information
            </Typography>

            <TextField
              margin="dense"
              label="Notes"
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
        ) : (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: 100,
            }}
          >
            <CircularProgress />
            <Typography sx={{ ml: 2 }}>Loading liability data...</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isLoading || !liabilityToEdit}
        >
          {isLoading ? (
            <CircularProgress size={24} color="inherit" />
          ) : (
            "Save Changes"
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

EditLiabilityModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onUpdateLiability: PropTypes.func.isRequired,
  liabilityToEdit: PropTypes.object,
  liabilityTypes: PropTypes.array.isRequired,
  banks: PropTypes.array.isRequired,
  onOpenManageTypes: PropTypes.func,
  onOpenManageBanks: PropTypes.func,
};

export default EditLiabilityModal;
