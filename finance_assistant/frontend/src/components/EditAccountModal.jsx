import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import InputAdornment from "@mui/material/InputAdornment";
import Autocomplete from "@mui/material/Autocomplete";
import { useSnackbar } from "../context/SnackbarContext";

const initialErrorState = {
  accountName: "",
  bank: "",
  accountType: "",
  last4: "",
};

function EditAccountModal({
  open,
  onClose,
  account,
  banks = [],
  accountTypes = [],
  onUpdate,
}) {
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState(initialErrorState);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null); // For general save errors
  const [allocationSliders, setAllocationSliders] = useState({
    liquid: 100,
    frozen: 0,
    deepFreeze: 0,
  });
  const { notify } = useSnackbar();

  useEffect(() => {
    if (account) {
      console.log("EditAccountModal initializing with account:", account);

      const liquidPercent = account.allocation_rules?.liquid || 100;
      const frozenPercent = account.allocation_rules?.frozen || 0;
      const deepFreezePercent = account.allocation_rules?.deep_freeze || 0;

      const bankValue = account.details?.bank || account.bank || "";
      const accountTypeValue =
        account.details?.type ||
        account.details?.account_type ||
        account.type ||
        "";

      setFormData({
        accountName: account.name || "",
        bank: bankValue,
        includeBankInName:
          account.includeBankInName !== undefined
            ? account.includeBankInName
            : true,
        accountType: accountTypeValue,
        last4: account.last4 || account.details?.last_4_digits || "",
        notes: account.notes || account.details?.notes || "",
        id: account.id,
        balance: account.balance,
        is_ynab: account.is_ynab,
        allocation_rules: account.allocation_rules || {
          liquid: 100,
          frozen: 0,
          deep_freeze: 0,
        },
      });

      setAllocationSliders({
        liquid: liquidPercent,
        frozen: frozenPercent,
        deepFreeze: deepFreezePercent,
      });

      setError(null);
      setErrors(initialErrorState);
    } else {
      setFormData({});
      setAllocationSliders({ liquid: 100, frozen: 0, deepFreeze: 0 });
    }
  }, [account]);

  useEffect(() => {
    let newErrors = { ...errors };
    let hasChanges = false;
    if (errors.accountName && formData.accountName) {
      newErrors.accountName = "";
      hasChanges = true;
    }
    if (errors.bank && formData.bank) {
      newErrors.bank = "";
      hasChanges = true;
    }
    if (errors.accountType && formData.accountType) {
      newErrors.accountType = "";
      hasChanges = true;
    }
    if (errors.last4 && formData.last4) {
      newErrors.last4 = "";
      hasChanges = true;
    }
    if (hasChanges) setErrors(newErrors);
  }, [formData, errors]);

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleLast4Change = (event) => {
    const value = event.target.value.replace(/[^0-9]/g, "");
    if (value.length <= 4) {
      setFormData((prevData) => ({ ...prevData, last4: value }));
    }
  };

  const handleAllocationChange = (name) => (event, newValue) => {
    const updatedSliders = { ...allocationSliders, [name]: newValue };
    const total = Object.values(updatedSliders).reduce(
      (sum, val) => sum + val,
      0
    );

    if (total !== 100) {
      const adjustment = 100 - total;
      const otherKeys = Object.keys(updatedSliders).filter(
        (key) => key !== name
      );
      let remainingAdjustment = adjustment;
      let otherTotalOriginal = otherKeys.reduce(
        (sum, k) => sum + allocationSliders[k],
        0
      );

      // Prevent division by zero or negative distribution if others were already zero
      if (otherTotalOriginal <= 0) otherTotalOriginal = 1;

      for (let i = 0; i < otherKeys.length; i++) {
        const key = otherKeys[i];
        const originalValue = allocationSliders[key];
        let adjustmentShare = 0;
        if (i === otherKeys.length - 1) {
          // Last slider takes the remainder to avoid floating point issues
          adjustmentShare = remainingAdjustment;
        } else {
          adjustmentShare = Math.round(
            adjustment * (originalValue / otherTotalOriginal)
          );
          remainingAdjustment -= adjustmentShare;
        }

        updatedSliders[key] = Math.max(
          0,
          Math.min(100, updatedSliders[key] + adjustmentShare)
        );
      }

      // Final check to ensure total is exactly 100 due to rounding
      const finalTotal = Object.values(updatedSliders).reduce(
        (sum, val) => sum + val,
        0
      );
      if (finalTotal !== 100) {
        // Adjust the last modified slider if necessary
        updatedSliders[name] = Math.max(
          0,
          Math.min(100, updatedSliders[name] + (100 - finalTotal))
        );
      }
    }

    setAllocationSliders(updatedSliders);
    // Update formData allocation_rules immediately
    setFormData((prevData) => ({
      ...prevData,
      allocation_rules: {
        liquid: updatedSliders.liquid,
        frozen: updatedSliders.frozen,
        deep_freeze: updatedSliders.deepFreeze, // Correct key name
      },
    }));
  };

  const handleBankChange = (event, newValue) => {
    const selectedBank =
      typeof newValue === "string" ? newValue : newValue?.name || "";
    setFormData((prevData) => ({ ...prevData, bank: selectedBank }));
  };

  const handleAccountTypeChange = (event, newValue) => {
    const selectedType =
      typeof newValue === "string" ? newValue : newValue?.name || "";
    setFormData((prevData) => ({ ...prevData, accountType: selectedType }));
  };

  const validateForm = () => {
    let isValid = true;
    let newErrors = { ...initialErrorState };

    if (!formData.accountName?.trim()) {
      newErrors.accountName = "Account Name is required.";
      isValid = false;
    }
    if (
      !formData.bank ||
      !banks.some((b) => (typeof b === "string" ? b : b.name) === formData.bank)
    ) {
      newErrors.bank = "Please select a valid bank.";
      isValid = false;
    }
    if (
      !formData.accountType ||
      !accountTypes.some(
        (at) => (typeof at === "string" ? at : at.name) === formData.accountType
      )
    ) {
      newErrors.accountType = "Please select a valid account type.";
      isValid = false;
    }
    if (
      formData.last4 &&
      (formData.last4.length !== 4 || !/^[0-9]{4}$/.test(formData.last4))
    ) {
      newErrors.last4 = "Must be exactly 4 digits.";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSaveEdit = async () => {
    setError(null);
    if (!validateForm()) {
      notify("Please fix validation errors.", "warning");
      return;
    }

    setIsSaving(true);

    const payload = {
      name: formData.accountName,
      bank: formData.bank,
      include_bank_in_name: formData.includeBankInName,
      account_type: formData.accountType,
      last_4_digits: formData.last4,
      notes: formData.notes,
      allocation_rules: formData.allocation_rules,
      is_ynab: formData.is_ynab,
    };

    try {
      console.log("Saving account details (Simplified):", payload);
      await onUpdate(account.id, payload);
      notify("Account details saved successfully!", "success");
      onClose();
    } catch (err) {
      console.error("Error saving account details:", err);
      setError(err.message || "An unknown error occurred while saving.");
      notify("Failed to save account details.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const renderSlider = (name, label, value) => (
    <Box sx={{ width: "95%", mx: "auto", mb: 1 }}>
      <Typography gutterBottom>{`${label}: ${value}%`}</Typography>
      <Slider
        aria-label={label}
        value={value}
        onChange={handleAllocationChange(name)}
        valueLabelDisplay="auto"
        step={1}
        marks
        min={0}
        max={100}
      />
    </Box>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Edit Account Details</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          autoFocus
          margin="dense"
          name="accountName"
          label="Account Name"
          type="text"
          fullWidth
          variant="outlined"
          value={formData.accountName || ""}
          onChange={handleInputChange}
          error={!!errors.accountName}
          helperText={errors.accountName}
          sx={{ mb: 2 }}
        />

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <Autocomplete
            options={banks}
            value={
              banks.find(
                (b) => (typeof b === "string" ? b : b.name) === formData.bank
              ) || null
            }
            onChange={handleBankChange}
            getOptionLabel={(option) =>
              typeof option === "string" ? option : option?.name || ""
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Bank"
                variant="outlined"
                error={!!errors.bank}
                helperText={errors.bank}
              />
            )}
            sx={{ flexGrow: 1 }}
          />
        </Box>

        <FormControlLabel
          control={
            <Checkbox
              name="includeBankInName"
              checked={formData.includeBankInName || false}
              onChange={handleInputChange}
              size="small"
            />
          }
          label="Include Bank in Account Name"
          sx={{ display: "block", mb: 2 }}
        />

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <Autocomplete
            options={accountTypes}
            value={
              accountTypes.find(
                (at) =>
                  (typeof at === "string" ? at : at.name) ===
                  formData.accountType
              ) || null
            }
            onChange={handleAccountTypeChange}
            getOptionLabel={(option) =>
              typeof option === "string" ? option : option?.name || ""
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Account Type"
                variant="outlined"
                error={!!errors.accountType}
                helperText={errors.accountType}
              />
            )}
            sx={{ flexGrow: 1 }}
          />
        </Box>

        <TextField
          margin="dense"
          name="last4"
          label="Last 4 Digits"
          type="text"
          fullWidth
          variant="outlined"
          value={formData.last4 || ""}
          onChange={handleLast4Change}
          inputProps={{ maxLength: 4 }}
          error={!!errors.last4}
          helperText={errors.last4}
          sx={{ mb: 2 }}
        />

        {!formData.is_ynab && (
          <Box sx={{ mt: 2, mb: 2 }}>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Allocation
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Define how this account's balance should be categorized.
            </Typography>
            {renderSlider("liquid", "Liquid", allocationSliders.liquid)}
            {renderSlider("frozen", "Frozen", allocationSliders.frozen)}
            {renderSlider(
              "deepFreeze",
              "Deep Freeze",
              allocationSliders.deepFreeze
            )}
          </Box>
        )}

        <Divider sx={{ mb: 2 }} />

        <TextField
          margin="dense"
          name="notes"
          label="Notes"
          type="text"
          fullWidth
          multiline
          rows={4}
          variant="outlined"
          value={formData.notes || ""}
          onChange={handleInputChange}
        />
      </DialogContent>
      <DialogActions sx={{ p: "16px 24px" }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSaveEdit}
          variant="contained"
          disabled={isSaving}
        >
          {isSaving ? <CircularProgress size={24} color="inherit" /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

EditAccountModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  account: PropTypes.object, // Account data to edit
  banks: PropTypes.array.isRequired,
  accountTypes: PropTypes.array.isRequired,
  onUpdate: PropTypes.func.isRequired, // Function to call with updated data
};

export default EditAccountModal;
