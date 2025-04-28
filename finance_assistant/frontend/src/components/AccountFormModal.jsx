import React, { useState, useEffect, useCallback } from "react";
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
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import { useSnackbar } from "../context/SnackbarContext";
import { callApi } from "../utils/api";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import AddIcon from "@mui/icons-material/Add";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import Divider from "@mui/material/Divider";
import InputAdornment from "@mui/material/InputAdornment";
import { v4 as uuidv4 } from "uuid";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import Autocomplete from "@mui/material/Autocomplete";
import { getApiBaseUrl } from "../utils/api";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";

const MANUAL_ACCOUNT_API = "manual_account"; // API endpoint prefix
const BANKS_API = "banks"; // Backend endpoint without /api/ prefix
const ACCOUNT_TYPES_API = "account_types"; // Fixed: Backend endpoint for account types (removed 'accounts/')
const ALLOCATION_STATUSES = ["Liquid", "Frozen", "Deep Freeze"];
const RULE_TYPES = ["fixed", "percentage"];

const initialFormData = {
  accountName: "",
  bank: "",
  includeBankInName: true,
  accountType: "",
  last_4_digits: "",
  notes: "",
  apy: "",
  min_balance: "",
  allocation_rules: [], // Add rules here
};

function AddEditAccountModal({
  open,
  onClose,
  account, // Full account object from /all_data initially
  onSave, // Callback after successful save
  banks: initialBanks = [],
  accountTypes: initialAccountTypes = [],
}) {
  // Log received props
  console.log("AccountFormModal received accountTypes:", initialAccountTypes);
  console.log("AccountFormModal received banks:", initialBanks);

  const [formData, setFormData] = useState(initialFormData);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingBank, setIsAddingBank] = useState(false);
  const [isAddingAccountType, setIsAddingAccountType] = useState(false);
  const [error, setError] = useState(null);
  const [errors, setErrors] = useState({}); // Field validation errors
  const { notify } = useSnackbar();

  // State for inline rule editing
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [editRuleFormData, setEditRuleFormData] = useState({});

  // Add state for the initial Account Type object needed by Autocomplete
  const [initialAccountTypeObject, setInitialAccountTypeObject] =
    useState(null);

  // Derived state based on props
  const isEditing = !!account; // If account prop exists, we're editing
  const accountId = account?.id;

  // Load initial data when modal opens or account changes
  useEffect(() => {
    if (account) {
      console.log("Loading account data into form:", account);

      // Extract the bank field, checking both in the account object directly
      // and in the account.details object if available
      const bankValue = account.details?.bank || account.bank || "";
      console.log("Bank value from account:", bankValue);

      // --- Simplified Account Type Initialization ---
      // Prioritize the account.account_type field directly from the processed data
      const accountTypeString = account.account_type || ""; // Use the field set in AccountsPage

      // Find the matching object in initialAccountTypes based on the name string
      const matchingTypeObject = initialAccountTypes.find(
        (type) => type.name === accountTypeString
      );

      // The value for the Autocomplete should be the matching object or null
      // STORE THE OBJECT IN STATE
      setInitialAccountTypeObject(matchingTypeObject || null);

      // Store the *string* name in formData for submission consistency
      const accountTypeStringForFormData = accountTypeString;
      // --- End Simplified Logic ---

      // --- Load and Validate Allocation Rules ---
      let rules =
        account.allocation_rules || account.details?.allocation_rules || [];
      if (!Array.isArray(rules)) {
        console.warn("Allocation rules was not an array, resetting.");
        rules = [];
      }

      // Find index of existing remaining rule
      const remainingIndex = rules.findIndex((r) => r?.id === "remaining");

      if (remainingIndex !== -1) {
        // If found, ensure it's at the end
        if (remainingIndex < rules.length - 1) {
          console.log("Moving existing remaining rule to the end.");
          const remainingRule = rules.splice(remainingIndex, 1)[0];
          rules.push(remainingRule);
        }
      } else {
        // If not found, add a default one based on account type
        const defaultStatus =
          accountTypeString?.toLowerCase() === "savings" ? "Frozen" : "Liquid";
        console.log(
          `No remaining rule found, adding default with status: ${defaultStatus}`
        );
        rules.push({
          id: "remaining",
          type: "remaining",
          value: null,
          status: defaultStatus, // Use calculated default status
        });
      }
      // --- End Allocation Rule Handling ---

      setFormData({
        accountId: account.id,
        accountName: account.name || "",
        bank: bankValue,
        includeBankInName:
          account.include_bank_in_name ??
          account.details?.include_bank_in_name ??
          true,
        accountType: accountTypeStringForFormData,
        last_4_digits:
          account.last_4_digits || account.details?.last_4_digits || "",
        notes: account.notes || account.details?.notes || "",
        apy: account.apy || account.details?.apy || "",
        min_balance: account.min_balance || account.details?.min_balance || "",
        allocation_rules: rules,
      });

      // Ensure we reset errors when loading new account
      setError(null);
      setErrors({});
    } else {
      setFormData(initialFormData);
    }
  }, [account, initialAccountTypes]);

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    const newValue = type === "checkbox" ? checked : value;
    setFormData((prev) => ({ ...prev, [name]: newValue }));
    // Clear validation error on change
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  // Handle bank selection or creation via Autocomplete
  const handleBankChange = async (event, selectedBankName) => {
    console.log(
      "Bank change called with:",
      selectedBankName,
      typeof selectedBankName
    );

    // Set the bank in form data immediately regardless of type
    setFormData((prev) => ({
      ...prev,
      bank: selectedBankName,
    }));

    // Removed auto-add logic as bank dropdown is now restrictive
    // if (typeof selectedBankName === "string" && selectedBankName.trim() !== "") {
    //   // Check if this bank already exists (case-insensitive)
    //   const exists = initialBanks.some(
    //     (bank) => bank.toLowerCase() === selectedBankName.toLowerCase()
    //   );
    //
    //   if (exists) {
    //     // If it exists, find the properly capitalized version
    //     const existingBank = initialBanks.find(
    //       (bank) => bank.toLowerCase() === selectedBankName.toLowerCase()
    //     );
    //     // Use the existing bank with proper capitalization
    //     setFormData((prev) => ({
    //       ...prev,
    //       bank: existingBank,
    //     }));
    //   } else {
    //     // Only create a new bank if it doesn't exist
    //     // await handleAddNewBank(selectedBankName); // Removed auto-add
    //   }
    // }
  };

  // Function to add a new bank - Keep for potential future use but not called now
  const handleAddNewBank = async (bankName) => {
    if (!bankName || !bankName.trim()) return;

    setIsAddingBank(true);
    try {
      // Preserve exact capitalization when adding a new bank
      const exactBankName = bankName.trim();
      console.log(
        `Adding new bank with exact capitalization: "${exactBankName}"`
      );

      // Use the callApi utility function which handles endpoint formatting correctly
      const result = await callApi(BANKS_API, {
        method: "POST",
        body: JSON.stringify({ name: exactBankName }),
      });

      // Update the bank in form data with the exact same name
      setFormData((prev) => ({
        ...prev,
        bank: exactBankName,
      }));

      // Update the banks list
      if (onBanksUpdate && typeof onBanksUpdate === "function") {
        onBanksUpdate();
      }

      notify("Bank added successfully", "success");
    } catch (err) {
      console.error("Error adding bank:", err);
      notify(err.message || "Failed to add bank", "error");
    } finally {
      setIsAddingBank(false);
    }
  };

  // Handle account type selection or creation via Autocomplete
  const handleAccountTypeChange = async (event, selectedTypeName) => {
    setError(null);

    // Directly set the selected string name (or null)
    setFormData((prev) => ({
      ...prev,
      accountType: selectedTypeName, // Store the name string directly
    }));

    // Auto-add logic removed as per previous comments
  };

  // Function to add a new account type - Can likely be removed if managed elsewhere
  const handleAddNewAccountType = async (typeName) => {
    if (!typeName || !typeName.trim()) return;

    setIsAddingAccountType(true);
    try {
      console.log(`Attempting to add account type: "${typeName}"`);

      // Normalize the type name with proper capitalization
      const normalizedTypeName = typeName.trim();

      // Check if this account type already exists with different casing
      const typeNameLower = normalizedTypeName.toLowerCase();
      const existingType = initialAccountTypes.find(
        (type) => type.toLowerCase() === typeNameLower
      );

      if (existingType) {
        console.log(
          `Account type already exists with different case: "${existingType}"`
        );
        // Use the existing type with proper capitalization
        setFormData((prev) => ({
          ...prev,
          accountType: existingType,
        }));
        return;
      }

      // Apply standard capitalization
      const capitalizedTypeName =
        normalizedTypeName.charAt(0).toUpperCase() +
        normalizedTypeName.slice(1).toLowerCase();

      console.log(
        `Sending account type API request: ${ACCOUNT_TYPES_API}, name: "${capitalizedTypeName}"`
      );

      // Use the callApi utility function which handles endpoint formatting correctly
      const result = await callApi(ACCOUNT_TYPES_API, {
        method: "POST",
        body: JSON.stringify({ name: capitalizedTypeName }),
      });

      console.log("Account type API response:", result);

      // Update the account type in form data
      setFormData((prev) => ({
        ...prev,
        accountType: capitalizedTypeName,
      }));

      // Update the account types list
      if (onAccountTypesUpdate && typeof onAccountTypesUpdate === "function") {
        onAccountTypesUpdate();
      }

      notify("Account type added successfully", "success");
    } catch (err) {
      console.error("Error adding account type:", err);
      const errorMessage = err.message || "Failed to add account type";
      console.error("Detailed error info:", errorMessage);
      notify(`Error adding account type: ${errorMessage}`, "error");
    } finally {
      setIsAddingAccountType(false);
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.accountType) {
      newErrors.accountType = "Account Type is required";
    }
    if (formData.last_4_digits && !/^\d{4}$/.test(formData.last_4_digits)) {
      newErrors.last_4_digits = "Must be exactly 4 digits";
    }
    // Add other validations if needed
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Allocation Rule Handlers ---
  const handleAddRule = () => {
    const newRule = {
      id: uuidv4(),
      type: "fixed",
      value: 0,
      status: "Liquid",
      isRemaining: false,
    };
    // Insert before the 'remaining' rule
    const rules = formData.allocation_rules || [];
    const remainingIndex = rules.findIndex((r) => r.id === "remaining");
    const newRules = [...rules];
    if (remainingIndex > -1) {
      newRules.splice(remainingIndex, 0, newRule);
    } else {
      newRules.push(newRule); // Should have remaining rule, but handle anyway
    }
    setFormData((prev) => ({ ...prev, allocation_rules: newRules }));
    setEditingRuleId(newRule.id); // Start editing the new rule
    setEditRuleFormData({ ...newRule, value: String(newRule.value) });
  };

  const handleDeleteRule = (idToDelete) => {
    if (idToDelete === "remaining") return; // Cannot delete remaining rule
    setFormData((prev) => ({
      ...prev,
      allocation_rules: prev.allocation_rules.filter(
        (rule) => rule.id !== idToDelete
      ),
    }));
    if (editingRuleId === idToDelete) {
      setEditingRuleId(null);
    }
  };

  const handleStartEditRule = (rule) => {
    setEditingRuleId(rule.id);
    setEditRuleFormData({
      ...rule,
      value: rule.value != null ? String(rule.value) : "",
    });
  };

  const handleCancelEditRule = () => {
    // If cancelling edit on a newly added (but not saved) rule, remove it
    const isNewUnsaved = formData.allocation_rules.find(
      (r) =>
        r.id === editingRuleId &&
        !account?.allocation_rules.find((orig) => orig.id === editingRuleId)
    );
    if (isNewUnsaved) {
      handleDeleteRule(editingRuleId);
    }
    setEditingRuleId(null);
    setEditRuleFormData({});
    setError(null); // Clear errors on cancel
  };

  const handleEditRuleInputChange = (event) => {
    const { name, value } = event.target;
    setEditRuleFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveEditRule = () => {
    // Basic Validation
    if (
      editRuleFormData.type !== "remaining" &&
      (editRuleFormData.value === null ||
        String(editRuleFormData.value).trim() === "") // Check empty string too
    ) {
      setError(`Value cannot be empty for rule ${editingRuleId}`);
      return;
    }
    let numericValue;
    if (editRuleFormData.type !== "remaining") {
      try {
        numericValue = parseFloat(editRuleFormData.value);
        if (
          editRuleFormData.type === "percentage" &&
          (numericValue <= 0 || numericValue > 100)
        ) {
          setError(
            `Percentage must be > 0 and <= 100 for rule ${editingRuleId}`
          );
          return;
        }
        if (editRuleFormData.type === "fixed" && numericValue < 0) {
          setError(`Fixed value cannot be negative for rule ${editingRuleId}`);
          return;
        }
      } catch {
        setError(`Invalid numeric value for rule ${editingRuleId}`);
        return;
      }
    } else {
      numericValue = null; // Value is not applicable for remaining
    }

    const updatedRules = formData.allocation_rules.map((rule) => {
      if (rule.id === editingRuleId) {
        return {
          ...rule, // Keep original ID and isRemaining flag
          type: editRuleFormData.type,
          // Save numeric value, or null for 'remaining'
          value: editRuleFormData.type === "remaining" ? null : numericValue,
          status: editRuleFormData.status,
        };
      }
      return rule;
    });

    setFormData((prev) => ({ ...prev, allocation_rules: updatedRules }));
    setEditingRuleId(null);
    setEditRuleFormData({});
    setError(null); // Clear error on successful save
  };
  // ---------------------------

  // --- Reordering Handlers ---
  const handleMoveRule = (index, direction) => {
    const newIndex = index + direction;
    const rules = [...formData.allocation_rules];

    // Basic bounds check and ensure we don't move the 'remaining' rule or swap with it
    if (
      newIndex < 0 ||
      newIndex >= rules.length - 1 || // Can't move into the last (remaining) position
      index === rules.length - 1 || // Can't move the last (remaining) rule
      newIndex === rules.length - 1 // Can't move a rule into the last slot (use down on second-last)
    ) {
      return;
    }

    // Swap elements
    [rules[index], rules[newIndex]] = [rules[newIndex], rules[index]];

    setFormData((prev) => ({ ...prev, allocation_rules: rules }));
  };
  // -------------------------

  const handleSubmit = async (event) => {
    event.preventDefault();
    // If a rule is being edited, try to save it first
    if (editingRuleId) {
      handleSaveEditRule();
      // If there's still an error after trying to save the rule, don't proceed
      if (error) {
        notify("Please fix the issues with the current rule first.", "warning");
        return;
      }
    }

    if (!validateForm()) return; // Removed accountId check, rely on onSave check

    setIsLoading(true);
    setError(null);

    // <<< ADD LOGGING HERE >>>
    console.log("--- handleSubmit: Checking formData before payload ---");
    console.log("formData.accountType:", formData.accountType);
    console.log("formData.bank:", formData.bank);
    // <<< END LOGGING >>>

    // Make sure we send both account_type and type fields to ensure consistency
    // This will help both the backend and frontend use the same fields
    const payload = {
      bank: formData.bank || null,
      include_bank_in_name: formData.includeBankInName,
      account_type: formData.accountType,
      type: formData.accountType, // Also include as type for consistency
      last_4_digits: formData.last_4_digits || null,
      notes: formData.notes || null,
      apy: formData.apy || null,
      min_balance: formData.min_balance || null,
      allocation_rules: formData.allocation_rules, // Send the rules
    };

    // <<< ADD LOGGING HERE (Ensure payload is logged) >>>
    console.log("--- Preparing to submit payload ---");
    console.log("Submitting account details payload:", payload);
    // <<< END LOGGING >>>

    try {
      // Log the bank value before submission
      console.log("Bank value being submitted:", formData.bank);

      // Send the update to the backend API
      // NOTE: This API call inside the modal might be redundant if onSave handles it.
      // const response = await callApi(`${MANUAL_ACCOUNT_API}/${accountId}`, {
      //   method: "POST", // Should likely be PUT for update
      //   body: JSON.stringify(payload),
      // });
      // console.log("Account API response:", response);

      // Create a properly updated account object to pass back to the parent
      const updatedAccount = {
        ...account,
        bank: payload.bank,
        include_bank_in_name: payload.include_bank_in_name,
        type: payload.account_type,
        account_type: payload.account_type,
        last_4_digits: payload.last_4_digits,
        notes: payload.notes,
        apy: payload.apy,
        min_balance: payload.min_balance,
        allocation_rules: payload.allocation_rules,
        // Make sure it's properly updated in the details object too
        details: {
          ...(account.details || {}),
          bank: payload.bank, // Ensure bank is properly copied to details
          include_bank_in_name: payload.include_bank_in_name,
          type: payload.account_type,
          account_type: payload.account_type,
          last_4_digits: payload.last_4_digits,
          notes: payload.notes,
          apy: payload.apy,
          min_balance: payload.min_balance,
          allocation_rules: payload.allocation_rules,
        },
      };

      console.log("Updated account object for callback:", updatedAccount);

      // Call onSave with the original account ID and the payload containing changes
      onSave(accountId, payload); // Pass ID and payload, not the reconstructed object
      onClose();
    } catch (err) {
      console.error("Error saving account details:", err);
      setError(err.message || "Failed to save account details.");
      notify(err.message || "Failed to save account details.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // --- Allocation Calculation for Display ---
  const formatCurrencyLocal = (value, isMilliunits = true) => {
    if (value == null) return "N/A";
    const numericValue = isMilliunits ? value / 1000.0 : value;
    return numericValue.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
    });
  };

  const calculateEstimatedAllocations = useCallback(() => {
    const totalBalance = account?.balance || 0;
    let liquid = 0;
    let frozen = 0;
    let deepFreeze = 0;
    let remaining = totalBalance;
    const rules = formData.allocation_rules || [];

    // Process fixed
    rules.forEach((rule) => {
      if (rule.type === "fixed" && rule.id !== "remaining") {
        const valueMilli = (rule.value || 0) * 1000;
        const amount = Math.min(valueMilli, remaining);
        if (amount > 0) {
          if (rule.status === "Liquid") liquid += amount;
          else if (rule.status === "Frozen") frozen += amount;
          else if (rule.status === "Deep Freeze") deepFreeze += amount;
          remaining -= amount;
        }
      }
    });

    const balanceAfterFixed = remaining;
    // Process percentage
    rules.forEach((rule) => {
      if (rule.type === "percentage" && rule.id !== "remaining") {
        const percentage = rule.value || 0;
        if (percentage > 0 && percentage <= 100) {
          const amount = Math.min(
            Math.floor(balanceAfterFixed * (percentage / 100)),
            remaining
          );
          if (amount > 0) {
            if (rule.status === "Liquid") liquid += amount;
            else if (rule.status === "Frozen") frozen += amount;
            else if (rule.status === "Deep Freeze") deepFreeze += amount;
            remaining -= amount;
          }
        }
      }
    });

    // Apply remaining
    const remainingRule = rules.find((r) => r.id === "remaining");
    if (remainingRule && remaining > 0) {
      if (remainingRule.status === "Liquid") liquid += remaining;
      else if (remainingRule.status === "Frozen") frozen += remaining;
      else if (remainingRule.status === "Deep Freeze") deepFreeze += remaining;
    } else if (remaining > 0) {
      // Fallback if somehow remaining rule is missing (shouldn't happen)
      liquid += remaining;
    }

    return { liquid, frozen, deepFreeze, remaining: Math.max(0, remaining) }; // Ensure remaining isn't negative visually
  }, [account?.balance, formData.allocation_rules]);

  const estimatedAllocations = calculateEstimatedAllocations();
  // ---------------------------------------

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {isEditing
          ? `Edit Details & Allocations: ${formData.accountName}`
          : "Add New Account"}
      </DialogTitle>
      <DialogContent dividers>
        {isLoading && (
          <CircularProgress sx={{ display: "block", margin: "auto", mb: 2 }} />
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {!isLoading && (
          <Box component="form" onSubmit={handleSubmit} noValidate>
            {/* === Left Column: Account Details === */}
            <Box sx={{ display: "flex", gap: 3 }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" gutterBottom>
                  Account Details
                </Typography>
                {/* Account Name (Readonly?) */}
                <TextField
                  margin="dense"
                  id="accountName"
                  label="Account Name (from YNAB)"
                  type="text"
                  fullWidth
                  variant="filled" // Make it look readonly
                  value={formData.accountName}
                  InputProps={{
                    readOnly: true,
                  }}
                  sx={{ mb: 2 }}
                />

                {/* Bank Selection with Autocomplete */}
                <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                  <Autocomplete
                    fullWidth
                    id="bank-select-autocomplete"
                    options={initialBanks || []} // Ensure options is an array
                    getOptionLabel={(option) => option.name || ""} // Display the name
                    // Find the object in options that matches the name stored in formData.bank
                    value={
                      initialBanks.find((opt) => opt.name === formData.bank) ||
                      null
                    }
                    onChange={(event, newValue) => {
                      // Update formData with the name string from the selected object
                      handleBankChange(event, newValue ? newValue.name : null);
                    }}
                    isOptionEqualToValue={(option, value) =>
                      option.name === value?.name
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        error={!!errors.bank}
                        helperText={errors.bank}
                        label="Bank"
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
                </Box>

                {/* Include Bank in Name Checkbox */}
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={formData.includeBankInName}
                      onChange={handleInputChange}
                      name="includeBankInName"
                    />
                  }
                  label="Include Bank in Account Name (Display Only)"
                  sx={{ mb: 1, display: "block" }}
                />

                {/* Account Type Selection with Autocomplete */}
                <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                  <Autocomplete
                    options={initialAccountTypes || []} // Ensure it's always an array
                    // Find the object in options that matches the name stored in formData.accountType
                    value={initialAccountTypeObject} // Use the state variable
                    onChange={(event, newValue) => {
                      // Update formData with the name string from the selected object
                      handleAccountTypeChange(
                        event,
                        newValue ? newValue.name : null
                      );
                    }}
                    getOptionLabel={(option) => option.name || ""} // Display the name property
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        required
                        error={!!errors.accountType}
                        helperText={errors.accountType}
                        label="Account Type"
                        name="accountType"
                        disabled={isLoading || isAddingAccountType}
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {isAddingAccountType ? (
                                <CircularProgress size={20} />
                              ) : (
                                params.InputProps.endAdornment
                              )}
                            </>
                          ),
                        }}
                      />
                    )}
                    sx={{ flexGrow: 1 }}
                    // Compare the option object's name with the selected value object's name
                    isOptionEqualToValue={(option, value) =>
                      option.name === value?.name
                    }
                  />
                </Box>

                {/* Last 4 Digits */}
                <TextField
                  margin="dense"
                  id="last_4_digits"
                  label="Last 4 Digits"
                  type="text" // Keep as text for flexibility, validate as number
                  name="last_4_digits"
                  fullWidth
                  variant="outlined"
                  value={formData.last_4_digits}
                  onChange={handleInputChange}
                  error={!!errors.last_4_digits}
                  helperText={
                    errors.last_4_digits || "Optional, 4 numeric digits"
                  }
                  inputProps={{ maxLength: 4 }}
                  sx={{ mb: 2 }}
                />

                {/* Notes */}
                <TextField
                  margin="dense"
                  id="notes"
                  label="Notes"
                  type="text"
                  name="notes"
                  fullWidth
                  multiline
                  rows={3}
                  variant="outlined"
                  value={formData.notes}
                  onChange={handleInputChange}
                  sx={{ mb: 2 }}
                />

                {/* APY */}
                <TextField
                  margin="dense"
                  id="apy"
                  label="APY (%)"
                  type="number"
                  name="apy"
                  fullWidth
                  variant="outlined"
                  value={formData.apy}
                  onChange={handleInputChange}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">%</InputAdornment>
                    ),
                    inputProps: { step: 0.01, min: 0 },
                  }}
                  helperText="Annual Percentage Yield"
                  sx={{ mb: 2 }}
                />

                {/* Minimum Balance */}
                <TextField
                  margin="dense"
                  id="min_balance"
                  label="Minimum Balance"
                  type="number"
                  name="min_balance"
                  fullWidth
                  variant="outlined"
                  value={formData.min_balance}
                  onChange={handleInputChange}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">$</InputAdornment>
                    ),
                    inputProps: { step: 0.01, min: 0 },
                  }}
                  helperText="Required minimum balance to avoid fees"
                  sx={{ mb: 2 }}
                />
              </Box>

              {/* === Right Column: Allocation Rules === */}
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" gutterBottom>
                  Allocation Rules
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 1 }}
                >
                  Current Balance: {formatCurrencyLocal(account?.balance)}
                </Typography>
                {/* Display Estimated Allocations */}
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-around",
                    mb: 2,
                    p: 1,
                    backgroundColor: "action.hover",
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="body2">
                    Liquid: {formatCurrencyLocal(estimatedAllocations.liquid)}
                  </Typography>
                  <Typography variant="body2">
                    Frozen: {formatCurrencyLocal(estimatedAllocations.frozen)}
                  </Typography>
                  <Typography variant="body2">
                    Deep Freeze:{" "}
                    {formatCurrencyLocal(estimatedAllocations.deepFreeze)}
                  </Typography>
                </Box>
                {error && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                  </Alert>
                )}
                <List dense disablePadding>
                  {(formData.allocation_rules || []).map((rule) => (
                    <ListItem
                      key={rule.id}
                      disableGutters
                      disablePadding
                      sx={{
                        mb: 1,
                        p: 1.5,
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "stretch", // Ensure children stretch
                      }}
                    >
                      {editingRuleId === rule.id ? (
                        // --- Editing Form ---
                        <Box sx={{ width: "100%" }}>
                          <Box
                            sx={{
                              display: "flex",
                              gap: 2,
                              flexWrap: "wrap", // Allow wrapping on smaller screens
                              alignItems: "flex-start", // Align items top
                            }}
                          >
                            {/* Rule Type Select */}
                            <FormControl
                              size="small"
                              sx={{ minWidth: 150, flex: "1 1 150px" }} // Flex properties for responsiveness
                              disabled={rule.type === "remaining"}
                            >
                              <InputLabel>Type</InputLabel>
                              <Select
                                name="type"
                                value={editRuleFormData.type || ""}
                                label="Type"
                                onChange={handleEditRuleInputChange}
                                disabled={rule.type === "remaining"} // Disable type change for remaining rule
                              >
                                {RULE_TYPES.map((type) => (
                                  <MenuItem key={type} value={type}>
                                    {type.charAt(0).toUpperCase() +
                                      type.slice(1)}
                                  </MenuItem>
                                ))}
                                {/* Show 'Remaining' only if the current rule IS remaining */}
                                {rule.type === "remaining" && (
                                  <MenuItem value="remaining" disabled>
                                    Remaining
                                  </MenuItem>
                                )}
                              </Select>
                            </FormControl>

                            {/* Rule Value Input (Conditional) - Hide for 'remaining' */}
                            {editRuleFormData.type !== "remaining" && (
                              <FormControl
                                size="small"
                                sx={{ minWidth: 120, flex: "1 1 120px" }}
                              >
                                <TextField
                                  name="value"
                                  label="Value"
                                  type="number"
                                  size="small"
                                  value={editRuleFormData.value || ""}
                                  onChange={handleEditRuleInputChange}
                                  InputProps={{
                                    startAdornment: (
                                      <InputAdornment position="start">
                                        {editRuleFormData.type === "fixed"
                                          ? "$"
                                          : "%"}
                                      </InputAdornment>
                                    ),
                                    inputProps: {
                                      step:
                                        editRuleFormData.type === "fixed"
                                          ? "0.01"
                                          : "1",
                                      min: 0,
                                      max:
                                        editRuleFormData.type === "percentage"
                                          ? 100
                                          : undefined,
                                    },
                                  }}
                                />
                                <FormHelperText sx={{ ml: 0 }}>
                                  {editRuleFormData.type === "fixed"
                                    ? "Dollar amount"
                                    : "Percentage of remaining"}
                                </FormHelperText>
                              </FormControl>
                            )}

                            {/* Rule Status Select */}
                            <FormControl
                              size="small"
                              sx={{ minWidth: 150, flex: "1 1 150px" }}
                            >
                              <InputLabel>Status</InputLabel>
                              <Select
                                name="status"
                                value={editRuleFormData.status || ""}
                                label="Status"
                                onChange={handleEditRuleInputChange}
                              >
                                {ALLOCATION_STATUSES.map((status) => (
                                  <MenuItem key={status} value={status}>
                                    {status}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </Box>
                          {/* Save/Cancel Buttons for Edit Form */}
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "flex-end",
                              mt: 1.5,
                              gap: 1,
                            }}
                          >
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={handleCancelEditRule}
                              startIcon={<CancelIcon />}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="contained"
                              size="small"
                              onClick={handleSaveEditRule}
                              startIcon={<SaveIcon />}
                            >
                              Save Rule
                            </Button>
                          </Box>
                        </Box>
                      ) : (
                        // --- Display View ---
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            width: "100%",
                            flexWrap: "wrap", // Allow wrapping
                          }}
                        >
                          <Box sx={{ flexGrow: 1, mr: 1 }}>
                            <Typography variant="body1" component="span">
                              {rule.type === "remaining"
                                ? "Remaining Balance"
                                : `${
                                    rule.type === "fixed"
                                      ? formatCurrencyLocal(rule.value, false) // Assume value is dollars if fixed
                                      : `${rule.value}%`
                                  } `}
                            </Typography>
                            <Typography
                              variant="body1"
                              component="span"
                              sx={{ fontWeight: "bold" }}
                            >
                              {rule.type !== "remaining" && ` → ${rule.status}`}
                              {rule.type === "remaining" &&
                                ` set to ${rule.status}`}
                            </Typography>
                          </Box>
                          <Box sx={{ flexShrink: 0 }}>
                            <Tooltip title="Edit Rule">
                              <IconButton
                                size="small"
                                onClick={() => handleStartEditRule(rule)}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete Rule">
                              <span>
                                <IconButton
                                  size="small"
                                  onClick={() => handleDeleteRule(rule.id)}
                                  disabled={rule.type === "remaining"}
                                  color="error"
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            {/* --- Reorder Buttons --- */}
                            <Tooltip title="Move Rule Up">
                              <span>
                                {" "}
                                {/* Span needed for tooltip on disabled button */}
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    handleMoveRule(
                                      formData.allocation_rules.findIndex(
                                        (r) => r.id === rule.id
                                      ),
                                      -1
                                    )
                                  }
                                  disabled={
                                    rule.type === "remaining" ||
                                    formData.allocation_rules.findIndex(
                                      (r) => r.id === rule.id
                                    ) === 0
                                  }
                                >
                                  <ArrowUpwardIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Move Rule Down">
                              <span>
                                {" "}
                                {/* Span needed for tooltip on disabled button */}
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    handleMoveRule(
                                      formData.allocation_rules.findIndex(
                                        (r) => r.id === rule.id
                                      ),
                                      1
                                    )
                                  }
                                  disabled={
                                    rule.type === "remaining" ||
                                    formData.allocation_rules.findIndex(
                                      (r) => r.id === rule.id
                                    ) >=
                                      formData.allocation_rules.length - 2
                                  }
                                  // Disable if it's the 'remaining' rule OR the second-to-last rule
                                >
                                  <ArrowDownwardIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            {/* --- End Reorder Buttons --- */}
                          </Box>
                        </Box>
                      )}
                    </ListItem>
                  ))}
                </List>
                <Button
                  startIcon={<AddIcon />}
                  onClick={handleAddRule}
                  sx={{ mt: 1 }}
                  disabled={!!editingRuleId} // Disable adding if already editing
                >
                  Add Allocation Rule
                </Button>
              </Box>
            </Box>
          </Box>
        )}
      </DialogContent>

      {editingRuleId !== null && (
        <Box sx={{ mx: 3, mb: 1 }}>
          <Alert severity="warning">
            You have unsaved changes to a rule. Click the blue checkmark to save
            the rule, or "Save Rule & Account" to save everything at once.
          </Alert>
        </Box>
      )}

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isLoading}
          color={editingRuleId !== null ? "warning" : "primary"}
          startIcon={editingRuleId !== null ? <SaveIcon /> : null}
        >
          {isLoading ? (
            <CircularProgress size={24} />
          ) : editingRuleId !== null ? (
            "Save Rule & Account"
          ) : (
            "Save Account"
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

AddEditAccountModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  account: PropTypes.object, // Account object, null if adding
  onSave: PropTypes.func.isRequired,
  banks: PropTypes.arrayOf(PropTypes.string).isRequired,
  accountTypes: PropTypes.arrayOf(PropTypes.string).isRequired,
};

export default AddEditAccountModal;
