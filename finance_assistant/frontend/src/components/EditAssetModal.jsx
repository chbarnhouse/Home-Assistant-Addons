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
import { useSnackbar } from "../context/SnackbarContext"; // Import Snackbar hook
import ManageBanksButton from "./ManageBanksButton";
import ManageAssetTypesButton from "./ManageAssetTypesButton";
import FormHelperText from "@mui/material/FormHelperText";

const ASSETS_API = "/api/assets"; // Base API endpoint

function EditAssetModal({
  open,
  onClose,
  onUpdateAsset,
  assetToEdit,
  assetTypes = [],
  banks = [],
  onOpenManageAssetTypes,
  onOpenManageBanks,
}) {
  const initialFormData = {
    name: "",
    type: "",
    value: "",
    bank: "",
    symbol: "",
    shares: "",
    value_last_updated: "",
  };
  const [formData, setFormData] = useState(initialFormData);
  const [isStock, setIsStock] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({}); // For field-specific errors
  const { notify } = useSnackbar(); // Get notify function

  // Populate form when assetToEdit changes or modal opens
  useEffect(() => {
    if (open && assetToEdit) {
      setFormData({
        name: assetToEdit.name || "",
        type: assetToEdit.type || "",
        value: assetToEdit.value?.toString() || "0", // Convert value to string for TextField
        bank: assetToEdit.bank || "",
        symbol: assetToEdit.symbol || "",
        shares: assetToEdit.shares?.toString() || "", // Convert shares to string
        value_last_updated:
          assetToEdit.value_last_updated || new Date().toISOString(),
      });
      // Check if the initial asset type is 'Stock'
      const initialTypeIsStock = assetToEdit.type === "Stocks";
      setIsStock(initialTypeIsStock || false);
      setErrors({});
      setIsLoading(false);
    } else if (!open) {
      // Reset form when closed
      setFormData(initialFormData);
      setIsStock(false);
      setErrors({});
    }
  }, [open, assetToEdit, assetTypes]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    let updatedFormData = { ...formData, [name]: value };

    if (name === "type") {
      // Update isStock state when asset type changes
      const isStockType = value === "Stocks";
      setIsStock(isStockType);
      setErrors({});

      // Reset fields if type changes attributes
      if (!isStockType) {
        updatedFormData.symbol = "";
        updatedFormData.shares = "";
      }
    }

    setFormData(updatedFormData);

    // Clear error for the field being changed
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = "Asset name is required.";
    if (!formData.type) newErrors.type = "Asset type is required."; // Should always be set
    if (
      !formData.value ||
      isNaN(formData.value) ||
      parseFloat(formData.value) < 0
    ) {
      newErrors.value = "Valid asset value is required.";
    }
    if (isStock) {
      if (!formData.symbol.trim())
        newErrors.symbol = "Stock symbol is required.";
      if (
        !formData.shares ||
        isNaN(formData.shares) ||
        parseFloat(formData.shares) <= 0
      ) {
        newErrors.shares = "Valid number of shares is required.";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!assetToEdit) return; // Should not happen if modal is open

    if (!validateForm()) {
      notify("Please correct the errors in the form.", "warning");
      return;
    }

    setIsLoading(true);
    setErrors({}); // Clear old errors before submission

    // Construct payload
    const payload = {
      name: formData.name.trim(),
      type: formData.type,
      value: parseFloat(formData.value),
      bank: formData.bank || null,
      value_last_updated:
        formData.value_last_updated || new Date().toISOString(),
    };

    // Include optional fields only if applicable based on the type
    if (isStock) {
      payload.symbol = formData.symbol.trim();
      payload.shares = parseFloat(formData.shares);
    }

    try {
      const response = await fetch(`${ASSETS_API}/${assetToEdit.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (response.ok && result.success) {
        onUpdateAsset(result.asset); // Pass the updated asset data back
        notify("Asset updated successfully.", "success");
        onClose(); // Close modal on success
      } else if (response.status === 400 && result.errors) {
        // Handle validation errors from backend
        setErrors(result.errors);
        notify("Validation failed. Please check the fields.", "warning");
      } else {
        // Handle other errors (e.g., 404, 500)
        throw new Error(
          result.error || "Failed to update asset. Please try again."
        );
      }
    } catch (error) {
      console.error("Error updating asset:", error);
      // Use Snackbar for general errors
      notify(
        error.message ||
          "An unexpected error occurred while updating the asset.",
        "error"
      );
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
      <DialogTitle>Edit Asset: {assetToEdit?.name}</DialogTitle>
      <DialogContent dividers>
        {/* Removed general Alert, using Snackbar now */}
        {assetToEdit ? (
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              margin="dense"
              label="Asset Name"
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

            {/* Asset Type with Manage Types Button */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                mt: 2,
                mb: 1,
              }}
            >
              <FormControl fullWidth error={!!errors.type} disabled={isLoading}>
                <InputLabel id="asset-type-label">Asset Type</InputLabel>
                <Select
                  labelId="asset-type-label"
                  name="type"
                  value={formData.type}
                  onChange={handleInputChange}
                  label="Asset Type"
                >
                  {assetTypes.map((type) => (
                    <MenuItem
                      key={typeof type === "string" ? type : type.name}
                      value={typeof type === "string" ? type : type.name}
                    >
                      {typeof type === "string" ? type : type.name}
                    </MenuItem>
                  ))}
                </Select>
                {errors.type && <FormHelperText>{errors.type}</FormHelperText>}
              </FormControl>
              {onOpenManageAssetTypes && (
                <ManageAssetTypesButton
                  onClick={onOpenManageAssetTypes}
                  disabled={isLoading}
                />
              )}
            </Box>

            {/* Bank with Manage Banks Button */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                mt: 2,
                mb: 1,
              }}
            >
              <FormControl fullWidth disabled={isLoading}>
                <InputLabel id="bank-label">
                  Bank/Brokerage (Optional)
                </InputLabel>
                <Select
                  labelId="bank-label"
                  name="bank"
                  value={formData.bank}
                  onChange={handleInputChange}
                  label="Bank/Brokerage (Optional)"
                >
                  <MenuItem value="">
                    <em>None</em>
                  </MenuItem>
                  {banks.map((bank) => (
                    <MenuItem
                      key={typeof bank === "string" ? bank : bank.name}
                      value={typeof bank === "string" ? bank : bank.name}
                    >
                      {typeof bank === "string" ? bank : bank.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {onOpenManageBanks && (
                <ManageBanksButton
                  onClick={onOpenManageBanks}
                  disabled={isLoading}
                />
              )}
            </Box>

            {/* Stock-specific fields */}
            {isStock && (
              <Box sx={{ display: "flex", gap: 2, mt: 2 }}>
                <TextField
                  margin="dense"
                  label="Stock Symbol"
                  type="text"
                  name="symbol"
                  value={formData.symbol}
                  onChange={handleInputChange}
                  required
                  error={!!errors.symbol}
                  helperText={errors.symbol}
                  disabled={isLoading}
                  sx={{ flexGrow: 1 }}
                />
                <TextField
                  margin="dense"
                  label="Number of Shares"
                  type="number"
                  name="shares"
                  value={formData.shares}
                  onChange={handleInputChange}
                  required
                  error={!!errors.shares}
                  helperText={errors.shares}
                  disabled={isLoading}
                  sx={{ flexGrow: 1 }}
                  InputProps={{
                    inputProps: { min: 0.000001, step: "any" },
                  }}
                />
              </Box>
            )}

            <TextField
              margin="dense"
              label="Current Value"
              type="number"
              fullWidth
              variant="outlined"
              name="value"
              value={formData.value}
              onChange={handleInputChange}
              required
              error={!!errors.value}
              helperText={errors.value}
              disabled={isLoading}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">$</InputAdornment>
                ),
                inputProps: { min: 0, step: "any" },
              }}
              sx={{ mt: 2 }}
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
          disabled={isLoading || !assetToEdit}
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

EditAssetModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onUpdateAsset: PropTypes.func.isRequired,
  assetToEdit: PropTypes.object,
  assetTypes: PropTypes.array.isRequired,
  banks: PropTypes.array.isRequired,
  onOpenManageAssetTypes: PropTypes.func,
  onOpenManageBanks: PropTypes.func,
};

export default EditAssetModal;
