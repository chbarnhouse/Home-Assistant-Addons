import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import { useSnackbar } from "../context/SnackbarContext";
import ManageBanksButton from "./ManageBanksButton";
import ManageAssetTypesButton from "./ManageAssetTypesButton";

const ASSETS_API = "/api/assets";

const initialFormState = {
  name: "",
  type: "",
  bank: "",
  value: "",
  symbol: "",
  shares: "",
  value_last_updated: new Date().toISOString(),
};

const initialErrorState = {
  name: "",
  type: "",
  value: "",
  shares: "",
  symbol: "",
};

function AddAssetModal({
  open,
  onClose,
  assetTypes = [],
  banks = [],
  onAdd,
  onOpenManageAssetTypes,
  onOpenManageBanks
}) {
  const [formData, setFormData] = useState(initialFormState);
  const [errors, setErrors] = useState(initialErrorState);
  const [isSaving, setIsSaving] = useState(false);
  const [isStock, setIsStock] = useState(false);
  const { notify } = useSnackbar();

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setFormData(initialFormState);
      setErrors(initialErrorState);
      setIsSaving(false);
      setIsStock(false);
    }
  }, [open]);

  // Clear specific field errors when user types
  useEffect(() => {
    let changed = false;
    const newErrors = { ...errors };

    Object.keys(formData).forEach(key => {
      if (errors[key] && formData[key]) {
        newErrors[key] = "";
        changed = true;
      }
    });

    if (changed) setErrors(newErrors);
  }, [formData, errors]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;

    if (name === "type") {
      // Check if asset type is stock
      const isStockType = value === "Stocks";
      setIsStock(isStockType);
    }

    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  // Specific handler for numeric fields like value/shares
  const handleNumericInputChange = (event) => {
    const { name, value } = event.target;
    // Allow empty string, numbers, and a single decimal point
    if (value === "" || /^[0-9]*\.?[0-9]*$/.test(value)) {
      setFormData((prevData) => ({
        ...prevData,
        [name]: value,
      }));
    }
  };

  const validateForm = () => {
    let tempErrors = { ...initialErrorState };
    let isValid = true;

    if (!formData.name?.trim()) {
      tempErrors.name = "Asset name is required.";
      isValid = false;
    }

    if (!formData.type) {
      tempErrors.type = "Asset Type selection is required.";
      isValid = false;
    }

    // Validate based on asset type
    if (isStock) {
      if (!formData.symbol?.trim()) {
        tempErrors.symbol = "Stock symbol is required for Stocks.";
        isValid = false;
      }
      if (!formData.shares?.trim() || parseFloat(formData.shares) <= 0) {
        tempErrors.shares = "Valid number of shares is required for Stocks.";
        isValid = false;
      }
    }

    // Validate value for all asset types
    if (formData.value && isNaN(parseFloat(formData.value))) {
      tempErrors.value = "Invalid number for Asset Value.";
      isValid = false;
    }

    if (formData.value === "" || parseFloat(formData.value) < 0) {
      tempErrors.value = "Valid asset value is required.";
      isValid = false;
    }

    setErrors(tempErrors);
    return isValid;
  };

  const handleAdd = async () => {
    if (!validateForm()) {
      console.log("Add Asset validation failed");
      return;
    }

    setIsSaving(true);

    // Construct payload
    const payload = {
      name: formData.name.trim(),
      type: formData.type,
      bank: formData.bank || null,
      value: formData.value ? parseFloat(formData.value) : 0,
      value_last_updated: formData.value_last_updated,
    };

    // Add stock-specific fields if applicable
    if (isStock) {
      payload.symbol = formData.symbol.trim();
      payload.shares = formData.shares ? parseFloat(formData.shares) : null;
    }

    console.log("Adding asset:", payload);

    try {
      const response = await fetch(ASSETS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          errData.error || `HTTP error! status: ${response.status}`
        );
      }

      const newAsset = await response.json();
      onAdd(newAsset); // Call parent handler with the new asset
      notify("Asset added successfully!", "success");
      onClose(); // Close modal on success
    } catch (err) {
      console.error("Error adding asset:", err);
      notify(err.message || "Failed to add asset.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={isSaving ? undefined : onClose}
      disableEscapeKeyDown={isSaving}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Add New Asset</DialogTitle>
      <DialogContent>
        <TextField
          required
          error={!!errors.name}
          helperText={errors.name}
          margin="dense"
          id="name"
          name="name"
          label="Asset Name"
          type="text"
          fullWidth
          variant="outlined"
          value={formData.name}
          onChange={handleInputChange}
          disabled={isSaving}
          sx={{ mb: 2, mt: 1 }}
        />

        {/* Asset Type with Manage Button */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <FormControl
            fullWidth
            margin="dense"
            required
            error={!!errors.type}
            disabled={isSaving}
          >
            <InputLabel id="asset-type-select-label">Asset Type</InputLabel>
            <Select
              labelId="asset-type-select-label"
              id="type"
              name="type"
              value={formData.type}
              label="Asset Type"
              onChange={handleInputChange}
              autoFocus
            >
              {assetTypes.map((type) => (
                <MenuItem
                  key={typeof type === 'string' ? type : type.name}
                  value={typeof type === 'string' ? type : type.name}
                >
                  {typeof type === 'string' ? type : type.name}
                </MenuItem>
              ))}
            </Select>
            {errors.type && <FormHelperText>{errors.type}</FormHelperText>}
          </FormControl>
          {onOpenManageAssetTypes && (
            <ManageAssetTypesButton onClick={onOpenManageAssetTypes} disabled={isSaving} />
          )}
        </Box>

        {/* Bank with Manage Button */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <FormControl
            fullWidth
            margin="dense"
            disabled={isSaving}
          >
            <InputLabel id="asset-bank-select-label">
              Bank/Brokerage (Optional)
            </InputLabel>
            <Select
              labelId="asset-bank-select-label"
              id="bank"
              name="bank"
              value={formData.bank}
              label="Bank/Brokerage (Optional)"
              onChange={handleInputChange}
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {banks.map((bank) => {
                const bankName = typeof bank === 'string' ? bank : bank.name;
                const bankKey = typeof bank === 'string' ? bankName : bank.id;
                return (
                  <MenuItem key={bankKey} value={bankName}>
                    {bankName}
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
          {onOpenManageBanks && (
            <ManageBanksButton onClick={onOpenManageBanks} disabled={isSaving} />
          )}
        </Box>

        {/* Conditional fields for Stocks */}
        {isStock && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 2 }}>
            <TextField
              required
              error={!!errors.symbol}
              helperText={errors.symbol}
              margin="dense"
              id="symbol"
              name="symbol"
              label="Stock Symbol"
              type="text"
              fullWidth
              variant="outlined"
              value={formData.symbol}
              onChange={handleInputChange}
              disabled={isSaving}
            />
            <TextField
              required
              error={!!errors.shares}
              helperText={errors.shares}
              margin="dense"
              id="shares"
              name="shares"
              label="Number of Shares"
              type="text"
              inputMode="decimal"
              fullWidth
              variant="outlined"
              value={formData.shares}
              onChange={handleNumericInputChange}
              disabled={isSaving}
            />
          </Box>
        )}

        {/* Asset Value (required for all types) */}
        <TextField
          required
          error={!!errors.value}
          helperText={errors.value}
          margin="dense"
          id="value"
          name="value"
          label="Asset Value"
          type="text"
          inputMode="decimal"
          fullWidth
          variant="outlined"
          value={formData.value}
          onChange={handleNumericInputChange}
          disabled={isSaving}
          sx={{ mb: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">$</InputAdornment>
            ),
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleAdd} variant="contained" disabled={isSaving}>
          {isSaving ? (
            <CircularProgress size={24} color="inherit" />
          ) : (
            "Add Asset"
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

AddAssetModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  assetTypes: PropTypes.array.isRequired,
  banks: PropTypes.array.isRequired,
  onAdd: PropTypes.func.isRequired,
  onOpenManageAssetTypes: PropTypes.func,
  onOpenManageBanks: PropTypes.func,
};

export default AddAssetModal;
