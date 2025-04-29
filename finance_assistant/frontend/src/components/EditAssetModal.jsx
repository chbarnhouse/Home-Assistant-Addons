import React, { useState, useEffect, useCallback } from "react";
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
import { callApi } from "../utils/api"; // Import callApi

const ASSETS_API = "/api/assets"; // Base API endpoint for *manual* assets
const MANUAL_ASSET_API = "/api/manual_asset"; // API for manual details (incl. YNAB linked)

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
    type_id: "",
    bank: "",
    bank_id: "",
    symbol: "",
    shares: "",
    value: "",
  };
  const [formData, setFormData] = useState(initialFormData);
  const [isStock, setIsStock] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [errors, setErrors] = useState({}); // For field-specific errors
  const { notify } = useSnackbar(); // Get notify function

  const isYnabAsset = assetToEdit?.is_ynab || false;

  // Fetch manual details when modal opens for a specific asset
  const fetchManualDetails = useCallback(async () => {
    if (!open || !assetToEdit?.id) return;

    setIsFetchingDetails(true);
    setErrors({});
    try {
      console.log(`Fetching manual details for asset ID: ${assetToEdit.id}`);
      const details = await callApi(`${MANUAL_ASSET_API}/${assetToEdit.id}`);
      console.log("Received manual details:", details);

      // Determine initial state based on YNAB data + manual details
      const initialTypeObj =
        assetTypes.find((t) => t.id === details?.type_id) ||
        assetTypes.find((t) => t.name === assetToEdit.type);
      const initialBankObj =
        banks.find((b) => b.id === details?.bank_id) ||
        banks.find((b) => b.name === assetToEdit.bank);
      const initialTypeIsStock = initialTypeObj?.name === "Stocks";

      setFormData({
        name: assetToEdit.name || "",
        type: initialTypeObj?.name || "",
        type_id: initialTypeObj?.id || details?.type_id || "",
        bank: initialBankObj?.name || "",
        bank_id: initialBankObj?.id || details?.bank_id || "",
        symbol:
          details?.symbol ||
          (initialTypeIsStock ? assetToEdit.symbol : "") ||
          "",
        shares:
          details?.shares?.toString() ||
          (initialTypeIsStock ? assetToEdit.shares : "") ||
          "",
        value: isYnabAsset ? "" : assetToEdit.value?.toString() || "0",
      });
      setIsStock(initialTypeIsStock);
    } catch (error) {
      console.error("Error fetching manual asset details:", error);
      notify("Failed to load existing details for this asset.", "error");
      // Initialize with base asset data if fetch fails
      setFormData({
        name: assetToEdit.name || "",
        type: assetToEdit.type || "",
        type_id: "",
        bank: assetToEdit.bank || "",
        bank_id: "",
        symbol: assetToEdit.symbol || "",
        shares: assetToEdit.shares?.toString() || "",
        value: isYnabAsset ? "" : assetToEdit.value?.toString() || "0",
      });
      setIsStock(assetToEdit.type === "Stocks");
    } finally {
      setIsFetchingDetails(false);
    }
  }, [open, assetToEdit, assetTypes, banks, notify, isYnabAsset]);

  useEffect(() => {
    fetchManualDetails();
  }, [fetchManualDetails]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    let updatedFormData = { ...formData, [name]: value };
    let newIsStock = isStock;

    if (name === "type_id") {
      const selectedType = assetTypes.find((t) => t.id === value);
      updatedFormData.type = selectedType ? selectedType.name : "";
      newIsStock = selectedType?.name === "Stocks";
      setIsStock(newIsStock);
      setErrors((prev) => ({ ...prev, type_id: null }));
    } else if (name === "bank_id") {
      const selectedBank = banks.find((b) => b.id === value);
      updatedFormData.bank = selectedBank ? selectedBank.name : "";
      setErrors((prev) => ({ ...prev, bank_id: null }));
    }

    if (name === "type_id" && !newIsStock) {
      updatedFormData.symbol = "";
      updatedFormData.shares = "";
    }

    setFormData(updatedFormData);

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = "Asset name is required.";
    if (!formData.type_id) newErrors.type_id = "Asset type is required.";

    if (!isYnabAsset) {
      if (
        !formData.value ||
        isNaN(formData.value) ||
        parseFloat(formData.value) < 0
      ) {
        newErrors.value = "Valid current value is required for manual assets.";
      }
    }

    if (isStock) {
      if (!formData.symbol.trim())
        newErrors.symbol = "Stock symbol is required.";
      if (
        formData.shares &&
        (isNaN(formData.shares) || parseFloat(formData.shares) <= 0)
      ) {
        newErrors.shares = "Shares must be a positive number.";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!assetToEdit) return;

    if (!validateForm()) {
      notify("Please correct the errors in the form.", "warning");
      return;
    }

    setIsLoading(true);
    setErrors({});

    const payload = {
      name: formData.name.trim(),
      type_id: formData.type_id,
      bank_id: formData.bank_id || null,
      symbol: isStock ? formData.symbol.trim() : null,
      shares: isStock && formData.shares ? parseFloat(formData.shares) : null,
    };

    if (!isYnabAsset) {
      payload.value = parseFloat(formData.value);
    }

    console.log("Submitting payload:", payload);

    try {
      const response = await callApi(`${MANUAL_ASSET_API}/${assetToEdit.id}`, {
        method: "POST",
        body: payload,
      });

      console.log("Save manual asset details response:", response);

      onUpdateAsset(response.details || payload);
      notify("Asset details updated successfully.", "success");
      onClose();
    } catch (error) {
      console.error("Error saving asset details:", error);
      notify(error.message || "Failed to save asset details.", "error");
      if (error.details) {
        setErrors(error.details);
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
      <DialogTitle>Edit Asset: {formData.name}</DialogTitle>
      <DialogContent dividers>
        {isFetchingDetails ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            sx={{ mt: 1 }}
          >
            <TextField
              margin="normal"
              required
              fullWidth
              id="name"
              label="Asset Name"
              name="name"
              autoComplete="off"
              value={formData.name}
              onChange={handleInputChange}
              error={!!errors.name}
              helperText={errors.name}
              disabled={isLoading}
            />

            <FormControl
              fullWidth
              margin="normal"
              required
              error={!!errors.type_id}
            >
              <InputLabel id="type-select-label">Asset Type</InputLabel>
              <Select
                labelId="type-select-label"
                id="type"
                name="type_id"
                value={formData.type_id}
                label="Asset Type"
                onChange={handleInputChange}
                disabled={isLoading}
              >
                <MenuItem value="">
                  <em>Select Type...</em>
                </MenuItem>
                {assetTypes.map((type) => (
                  <MenuItem key={type.id} value={type.id}>
                    {type.name}
                  </MenuItem>
                ))}
              </Select>
              {errors.type_id && (
                <FormHelperText>{errors.type_id}</FormHelperText>
              )}
            </FormControl>

            <FormControl fullWidth margin="normal" error={!!errors.bank_id}>
              <InputLabel id="bank-select-label">
                Bank/Brokerage (Optional)
              </InputLabel>
              <Select
                labelId="bank-select-label"
                id="bank"
                name="bank_id"
                value={formData.bank_id}
                label="Bank/Brokerage (Optional)"
                onChange={handleInputChange}
                disabled={isLoading}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {banks.map((bank) => (
                  <MenuItem key={bank.id} value={bank.id}>
                    {bank.name}
                  </MenuItem>
                ))}
              </Select>
              {errors.bank_id && (
                <FormHelperText>{errors.bank_id}</FormHelperText>
              )}
            </FormControl>

            {isStock && (
              <>
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  id="symbol"
                  label="Stock Symbol"
                  name="symbol"
                  autoComplete="off"
                  value={formData.symbol}
                  onChange={handleInputChange}
                  error={!!errors.symbol}
                  helperText={errors.symbol}
                  disabled={isLoading}
                />
                <TextField
                  margin="normal"
                  fullWidth
                  id="shares"
                  label="Number of Shares"
                  name="shares"
                  type="number"
                  inputProps={{ step: "any" }}
                  autoComplete="off"
                  value={formData.shares}
                  onChange={handleInputChange}
                  error={!!errors.shares}
                  helperText={errors.shares}
                  disabled={isLoading}
                />
              </>
            )}

            {!isYnabAsset && (
              <TextField
                margin="normal"
                required
                fullWidth
                id="value"
                label="Current Value"
                name="value"
                type="number"
                inputProps={{ step: "0.01" }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">$</InputAdornment>
                  ),
                }}
                value={formData.value}
                onChange={handleInputChange}
                error={!!errors.value}
                helperText={errors.value}
                disabled={isLoading}
              />
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading || isFetchingDetails}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isLoading || isFetchingDetails}
        >
          {isLoading ? <CircularProgress size={24} /> : "Save Changes"}
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
  assetTypes: PropTypes.arrayOf(
    PropTypes.shape({ id: PropTypes.string, name: PropTypes.string })
  ).isRequired,
  banks: PropTypes.arrayOf(
    PropTypes.shape({ id: PropTypes.string, name: PropTypes.string })
  ).isRequired,
};

export default EditAssetModal;
