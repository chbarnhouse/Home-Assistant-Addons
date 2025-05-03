import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Autocomplete,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  CircularProgress,
  Box,
} from "@mui/material";
import { parse, format } from "date-fns";

// Function to convert dollar amount to milliunits
const toMilliunits = (amount) => {
  if (amount === null || amount === undefined || isNaN(Number(amount))) {
    return 0;
  }
  return Math.round(Number(amount) * 1000);
};

// Function to convert milliunits to dollar amount for display
const fromMilliunits = (milliunits) => {
  if (
    milliunits === null ||
    milliunits === undefined ||
    isNaN(Number(milliunits))
  ) {
    return ""; // Return empty string for invalid input to clear field
  }
  return (Number(milliunits) / 1000).toFixed(2);
};

const AddEditTransactionModal = ({
  open,
  onClose,
  onSubmit,
  transactionToEdit = null,
  accounts = [], // Expect full account objects {id, name}
  payees = [], // Expect full payee objects {id, name}
  categories = [], // Expect full category objects {id, name}
}) => {
  const [formData, setFormData] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    account_id: "",
    payee_id: null,
    payee_name: "",
    category_id: null,
    memo: "",
    cleared: "uncleared",
    amount: "", // Store display amount (dollars)
  });
  const [errors, setErrors] = useState({});
  const [payeeInputValue, setPayeeInputValue] = useState("");

  const isEditMode = Boolean(transactionToEdit);

  useEffect(() => {
    if (isEditMode && transactionToEdit) {
      setFormData({
        date: transactionToEdit.date
          ? format(
              parse(transactionToEdit.date, "yyyy-MM-dd", new Date()),
              "yyyy-MM-dd"
            )
          : format(new Date(), "yyyy-MM-dd"),
        account_id: transactionToEdit.account_id || "",
        payee_id: transactionToEdit.payee_id || null,
        payee_name: transactionToEdit.payee_name || "", // Keep original payee_name if no payee_id matched
        category_id: transactionToEdit.category_id || null,
        memo: transactionToEdit.memo || "",
        cleared: transactionToEdit.cleared || "uncleared",
        amount: fromMilliunits(transactionToEdit.amount), // Convert milliunits to dollars for display
      });
      // Set initial payee input value if editing
      const initialPayee = payees.find(
        (p) => p.id === transactionToEdit.payee_id
      );
      setPayeeInputValue(
        initialPayee ? initialPayee.name : transactionToEdit.payee_name || ""
      );
    } else {
      // Reset form for adding
      setFormData({
        date: format(new Date(), "yyyy-MM-dd"),
        account_id: "",
        payee_id: null,
        payee_name: "",
        category_id: null,
        memo: "",
        cleared: "uncleared",
        amount: "",
      });
      setPayeeInputValue("");
      setErrors({});
    }
  }, [transactionToEdit, isEditMode, open, payees]); // Add payees dependency for initial value

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear specific errors when field changes
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleAutocompleteChange = (name, newValue) => {
    let valueToSet = null;
    if (newValue) {
      if (typeof newValue === "string") {
        // Handle case where user types and blurs (newValue is string)
        // For payee, allow free text entry if no match selected
        if (name === "payee") {
          setFormData((prev) => ({
            ...prev,
            payee_id: null,
            payee_name: newValue,
          }));
        } else {
          // For account/category, find match or handle error (should ideally select from list)
          const match = (name === "account" ? accounts : categories).find(
            (item) => item.name === newValue
          );
          valueToSet = match ? match.id : null;
          setFormData((prev) => ({ ...prev, [`${name}_id`]: valueToSet }));
        }
      } else {
        // Handle case where user selects from list (newValue is object)
        valueToSet = newValue.id;
        if (name === "payee") {
          setFormData((prev) => ({
            ...prev,
            payee_id: valueToSet,
            payee_name: newValue.name,
          }));
        } else {
          setFormData((prev) => ({ ...prev, [`${name}_id`]: valueToSet }));
        }
      }
    } else {
      // Handle clearing the selection
      if (name === "payee") {
        setFormData((prev) => ({ ...prev, payee_id: null, payee_name: "" }));
      } else {
        setFormData((prev) => ({ ...prev, [`${name}_id`]: null }));
      }
    }
    // Clear errors for autocomplete fields
    if (errors[`${name}_id`]) {
      setErrors((prev) => ({ ...prev, [`${name}_id`]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.date) newErrors.date = "Date is required";
    if (!formData.account_id) newErrors.account_id = "Account is required";
    if (formData.amount === "" || isNaN(Number(formData.amount)))
      newErrors.amount = "Valid amount is required";
    // Payee is complex: require either payee_id or payee_name if payee_id is null
    if (!formData.payee_id && !formData.payee_name) {
      newErrors.payee_id = "Payee selection or name is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validateForm()) {
      return;
    }

    const submissionData = {
      ...formData,
      amount: toMilliunits(formData.amount), // Convert to milliunits before submitting
      // Ensure payee_name is null if payee_id is set, required by YNAB API
      payee_name: formData.payee_id ? null : formData.payee_name,
    };

    // Remove the display 'amount' field if it causes issues with API model
    // delete submissionData.amount; // This might be needed depending on SaveTransaction model

    onSubmit(submissionData);
    // onClose(); // Optionally close modal on successful submit call
  };

  // Prepare options for Autocomplete
  const accountOptions = accounts || [];
  const payeeOptions = payees || [];
  const categoryOptions = categories || [];

  // Find selected values for Autocomplete defaultValues
  const selectedAccount =
    accountOptions.find((acc) => acc.id === formData.account_id) || null;
  const selectedPayee =
    payeeOptions.find((p) => p.id === formData.payee_id) || null;
  const selectedCategory =
    categoryOptions.find((cat) => cat.id === formData.category_id) || null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isEditMode ? "Edit Transaction" : "Add Transaction"}
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                name="date"
                label="Date"
                type="date"
                value={formData.date}
                onChange={handleChange}
                error={!!errors.date}
                helperText={errors.date}
                InputLabelProps={{ shrink: true }}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="amount"
                label="Amount"
                type="number"
                value={formData.amount}
                onChange={handleChange}
                error={!!errors.amount}
                helperText={
                  errors.amount ||
                  "Enter positive for inflow, negative for outflow"
                }
                inputProps={{ step: "0.01" }}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                options={accountOptions}
                getOptionLabel={(option) => option.name || ""}
                value={selectedAccount}
                onChange={(event, newValue) =>
                  handleAutocompleteChange("account", newValue)
                }
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Account"
                    variant="outlined"
                    error={!!errors.account_id}
                    helperText={errors.account_id}
                    required
                  />
                )}
              />
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                freeSolo // Allow typing custom payee names
                options={payeeOptions}
                getOptionLabel={(option) =>
                  (typeof option === "string" ? option : option.name) || ""
                }
                value={selectedPayee ?? (formData.payee_name || null)} // Handle both object and string value based on state
                inputValue={payeeInputValue} // Control input value separately
                onInputChange={(event, newInputValue) => {
                  setPayeeInputValue(newInputValue);
                  // If user clears input, also clear payee state
                  if (!newInputValue) {
                    setFormData((prev) => ({
                      ...prev,
                      payee_id: null,
                      payee_name: "",
                    }));
                  }
                }}
                onChange={(event, newValue) =>
                  handleAutocompleteChange("payee", newValue)
                }
                isOptionEqualToValue={(option, value) =>
                  option.id === value?.id
                } // Added null check
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Payee"
                    variant="outlined"
                    error={!!errors.payee_id}
                    helperText={errors.payee_id || "Select or type payee name"}
                    required
                  />
                )}
              />
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                options={categoryOptions}
                getOptionLabel={(option) => option.name || ""}
                value={selectedCategory}
                onChange={(event, newValue) =>
                  handleAutocompleteChange("category", newValue)
                }
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Category (Optional)"
                    variant="outlined"
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel id="cleared-select-label">Status</InputLabel>
                <Select
                  labelId="cleared-select-label"
                  name="cleared"
                  value={formData.cleared}
                  label="Status"
                  onChange={handleChange}
                >
                  <MenuItem value={"cleared"}>Cleared</MenuItem>
                  <MenuItem value={"uncleared"}>Uncleared</MenuItem>
                  <MenuItem value={"reconciled"}>Reconciled</MenuItem>{" "}
                  {/* Note: Usually set by reconciliation */}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="memo"
                label="Memo (Optional)"
                value={formData.memo}
                onChange={handleChange}
                multiline
                rows={2}
                fullWidth
                variant="outlined"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: "16px 24px" }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained">
            {isEditMode ? "Save Changes" : "Add Transaction"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

AddEditTransactionModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  transactionToEdit: PropTypes.object, // Shape can be more specific later
  accounts: PropTypes.arrayOf(
    PropTypes.shape({ id: PropTypes.string, name: PropTypes.string })
  ).isRequired,
  payees: PropTypes.arrayOf(
    PropTypes.shape({ id: PropTypes.string, name: PropTypes.string })
  ).isRequired,
  categories: PropTypes.arrayOf(
    PropTypes.shape({ id: PropTypes.string, name: PropTypes.string })
  ).isRequired,
};

export default AddEditTransactionModal;
