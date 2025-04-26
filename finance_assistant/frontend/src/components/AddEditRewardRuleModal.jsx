import React, { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import Modal from "@mui/material/Modal";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import SettingsIcon from "@mui/icons-material/Settings";
import InputAdornment from "@mui/material/InputAdornment";
import { useSnackbar } from "../context/SnackbarContext";
import { v4 as uuidv4 } from "uuid";
import { callApi } from "../utils/api";
import Chip from "@mui/material/Chip";

const style = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: 500, // Slightly smaller width for this modal
  bgcolor: "background.paper",
  border: "2px solid #000",
  boxShadow: 24,
  p: 4,
};

// Filter for Autocomplete
const filter = createFilterOptions();

// Initial state for a new rule
const initialRuleState = {
  id: null, // Will be set on save if new
  type: "category", // Default type?
  categories: [], // For multi-select category
  payees: [], // For multi-select payee
  payment_methods: [], // CHANGE: Rename and default to array for multi-select
  rate: "",
  is_static: false, // Default to rotating if applicable
};

function AddEditRewardRuleModal({
  open,
  onClose,
  onSubmit,
  ruleToEdit,
  rewardsCategories = [],
  rewardsPayees = [],
  paymentMethods = [],
  onOpenManageCategories,
  onOpenManagePayees,
  onOpenManagePaymentMethods,
  onPaymentMethodsUpdate,
  cardRewardsRotate,
  cardRotationFrequency,
}) {
  const [ruleData, setRuleData] = useState(initialRuleState);
  const [errors, setErrors] = useState({});
  const { notify } = useSnackbar();

  const isEditing = ruleToEdit !== null;
  const showRotatingCheckbox = cardRewardsRotate === true;

  useEffect(() => {
    if (open) {
      if (isEditing) {
        // Populate form if editing
        setRuleData({
          id: ruleToEdit.id,
          type: ruleToEdit.type || "category",
          categories: ruleToEdit.categories || [],
          payees: ruleToEdit.payees || [],
          payment_methods: ruleToEdit.payment_methods || [], // CHANGE: Use renamed field
          rate: ruleToEdit.rate != null ? String(ruleToEdit.rate) : "",
          is_static: ruleToEdit.is_static === true,
        });
      } else {
        // Reset form if adding
        setRuleData({
          ...initialRuleState,
          is_static: !showRotatingCheckbox, // If not a rotating card, rule is static by default
        });
      }
      setErrors({}); // Clear errors when modal opens
    }
  }, [open, ruleToEdit, isEditing, showRotatingCheckbox]);

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    setRuleData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    if (errors[name]) {
      setErrors({ ...errors, [name]: null });
    }
  };

  // --- Autocomplete Handlers ---
  const handleCategoryChange = (event, newValue) => {
    // Stop propagation to prevent potential issues with nested forms/events
    if (event) event.stopPropagation();

    console.log("Categories changed:", newValue);

    // Re-add logic to find and add new items
    const newCategoriesToAdd = [];
    const processedValues = (Array.isArray(newValue) ? newValue : [newValue])
      .map((item) => {
        if (!item) return null;
        if (typeof item === "object" && item.inputValue) {
          const newItemValue = item.inputValue.trim();
          if (newItemValue && !rewardsCategories.includes(newItemValue)) {
            newCategoriesToAdd.push(newItemValue);
          }
          return newItemValue;
        }
        return typeof item === "string" ? item : item;
      })
      .filter(Boolean);

    console.log("Setting categories to:", processedValues);

    // Update state immediately with the values
    setRuleData((prev) => ({
      ...prev,
      categories: processedValues || [],
    }));

    // Re-add API calls for new items
    newCategoriesToAdd.forEach((newItem) => {
      callApi("rewards_categories", {
        method: "POST",
        body: JSON.stringify({ name: newItem }),
      })
        .then((result) => {
          if (result && result.success) {
            notify(`Category "${newItem}" added successfully`, "success");
            // TODO: Consider updating rewardsCategories list via callback if needed
          } else {
            throw new Error(result?.error || "Failed to add category");
          }
        })
        .catch((error) => {
          console.error("Error adding category:", error);
          notify(`Failed to add category "${newItem}"`, "error");
        });
    });

    if (errors.categories) setErrors({ ...errors, categories: null });
  };

  const handlePayeeChange = (event, newValue) => {
    // Stop propagation
    if (event) event.stopPropagation();

    console.log("Payees changed:", newValue);

    // Re-add logic to find and add new items
    const newPayeesToAdd = [];
    const processedValues = (Array.isArray(newValue) ? newValue : [newValue])
      .map((item) => {
        if (!item) return null;
        if (typeof item === "object" && item.inputValue) {
          const newItemValue = item.inputValue.trim();
          if (newItemValue && !rewardsPayees.includes(newItemValue)) {
            newPayeesToAdd.push(newItemValue);
          }
          return newItemValue;
        }
        return typeof item === "string" ? item : item;
      })
      .filter(Boolean);

    console.log("Setting payees to:", processedValues);

    setRuleData((prev) => ({
      ...prev,
      payees: processedValues || [],
    }));

    // Re-add API calls for new items
    newPayeesToAdd.forEach((newItem) => {
      callApi("rewards_payees", {
        method: "POST",
        body: JSON.stringify({ name: newItem }),
      })
        .then((result) => {
          if (result && result.success) {
            notify(`Payee "${newItem}" added successfully`, "success");
            // TODO: Consider updating rewardsPayees list via callback if needed
          } else {
            throw new Error(result?.error || "Failed to add payee");
          }
        })
        .catch((error) => {
          console.error("Error adding payee:", error);
          notify(`Failed to add payee "${newItem}"`, "error");
        });
    });

    if (errors.payees) setErrors({ ...errors, payees: null });
  };

  const handlePaymentMethodsChange = (event, newValue) => {
    // Stop propagation
    if (event) event.stopPropagation();

    console.log("Payment methods changed:", newValue); // Plural

    // Logic similar to categories/payees
    const newMethodsToAdd = [];
    const processedValues = (Array.isArray(newValue) ? newValue : [newValue])
      .map((item) => {
        if (!item) return null;
        if (typeof item === "object" && item.inputValue) {
          const newItemValue = item.inputValue.trim();
          // Check against existing list from props
          if (newItemValue && !paymentMethods.includes(newItemValue)) {
            newMethodsToAdd.push(newItemValue);
          }
          return newItemValue;
        }
        return typeof item === "string" ? item : item;
      })
      .filter(Boolean);

    console.log("Setting payment methods to:", processedValues);
    setRuleData((prev) => ({
      ...prev,
      payment_methods: processedValues || [], // Use plural name
    }));

    // API call logic
    newMethodsToAdd.forEach((newItem) => {
      console.log("Attempting to add new payment method:", newItem);
      callApi("payment_methods", {
        method: "POST",
        body: JSON.stringify({ name: newItem }),
      })
        .then((result) => {
          console.log("Add payment method API result:", result);
          if (result && result.success) {
            notify(`Payment Method "${newItem}" added successfully`, "success");
            if (result.methods && Array.isArray(result.methods)) {
              console.log(
                "Calling onPaymentMethodsUpdate with new list:",
                result.methods
              );
              if (typeof onPaymentMethodsUpdate === "function") {
                onPaymentMethodsUpdate(result.methods);
              }
            } else {
              console.error(
                "Backend did not return updated payment methods list after add."
              );
              notify(
                "Payment method added, but failed to refresh list.",
                "warning"
              );
            }
          } else {
            throw new Error(result?.error || "Failed to add payment method");
          }
        })
        .catch((error) => {
          console.error("Error adding payment method:", error);
          notify(`Failed to add payment method "${newItem}"`, "error");
        });
    });

    // Use plural name for errors
    if (errors.payment_methods) setErrors({ ...errors, payment_methods: null });
  };
  // --------------------------

  const validateRule = () => {
    const newErrors = {};
    if (
      ruleData.rate === "" ||
      isNaN(ruleData.rate) ||
      parseFloat(ruleData.rate) <= 0
    ) {
      newErrors.rate = "Rate must be a positive number";
    }
    // Add more validation if needed (e.g., ensure at least one target is selected?)
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validateRule()) {
      notify("Please fix errors before submitting.", "warning");
      return;
    }

    const finalRule = {
      id: ruleData.id || uuidv4(), // Ensure ID exists
      rate: parseFloat(ruleData.rate),
      is_static: showRotatingCheckbox ? ruleData.is_static : true,
      // Send selected items, backend interprets empty array as "All"
      categories: ruleData.categories,
      payees: ruleData.payees,
      payment_methods: ruleData.payment_methods, // Use plural name
    };

    onSubmit(finalRule);
    onClose(); // Close modal after submit
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="reward-rule-modal-title"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Box sx={style} component="form" onSubmit={handleSubmit} noValidate>
        <Typography
          id="reward-rule-modal-title"
          variant="h6"
          component="h2"
          gutterBottom
        >
          {isEditing ? "Edit" : "Add"} Reward Rule
        </Typography>

        {/* Category Autocomplete */}
        <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
          <Autocomplete
            multiple
            freeSolo
            fullWidth
            id="categories-autocomplete"
            options={rewardsCategories || []}
            value={ruleData.categories || []}
            onChange={handleCategoryChange}
            filterOptions={(options, params) => {
              const filtered = filter(options, params);
              const { inputValue } = params;
              const isExisting = options.some(
                (option) => inputValue === option
              );
              if (inputValue !== "" && !isExisting) {
                filtered.push({
                  inputValue: inputValue,
                  title: `Add "${inputValue}"`,
                });
              }
              return filtered;
            }}
            getOptionLabel={(option) => {
              if (typeof option === "object" && option.title) {
                return option.title;
              }
              return option;
            }}
            renderOption={(props, option) => (
              <li {...props}>
                {typeof option === "object" ? option.title : option}
              </li>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Categories"
                placeholder="Select categories (default: All)"
                error={!!errors.categories}
                helperText={errors.categories}
              />
            )}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  key={option}
                  variant="outlined"
                  label={option}
                  {...getTagProps({ index })}
                />
              ))
            }
            selectOnFocus
            clearOnBlur
            handleHomeEndKeys
          />
          {onOpenManageCategories && (
            <IconButton
              onClick={onOpenManageCategories}
              title="Manage Categories"
            >
              <SettingsIcon />
            </IconButton>
          )}
        </Box>

        {/* Payee Autocomplete */}
        <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
          <Autocomplete
            multiple
            freeSolo
            fullWidth
            id="payees-autocomplete"
            options={rewardsPayees || []}
            value={ruleData.payees || []}
            onChange={handlePayeeChange}
            filterOptions={(options, params) => {
              const filtered = filter(options, params);
              const { inputValue } = params;
              const isExisting = options.some(
                (option) => inputValue === option
              );
              if (inputValue !== "" && !isExisting) {
                filtered.push({
                  inputValue: inputValue,
                  title: `Add "${inputValue}"`,
                });
              }
              return filtered;
            }}
            getOptionLabel={(option) => {
              if (typeof option === "object" && option.title) {
                return option.title;
              }
              return option;
            }}
            renderOption={(props, option) => (
              <li {...props}>
                {typeof option === "object" ? option.title : option}
              </li>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Payees"
                placeholder="Select payees (default: All)"
                error={!!errors.payees}
                helperText={errors.payees}
              />
            )}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  key={option}
                  variant="outlined"
                  label={option}
                  {...getTagProps({ index })}
                />
              ))
            }
            selectOnFocus
            clearOnBlur
            handleHomeEndKeys
          />
          {onOpenManagePayees && (
            <IconButton onClick={onOpenManagePayees} title="Manage Payees">
              <SettingsIcon />
            </IconButton>
          )}
        </Box>

        {/* Payment Method Autocomplete */}
        <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
          <Autocomplete
            multiple
            freeSolo
            fullWidth
            id="payment-method-autocomplete"
            options={paymentMethods || []}
            value={ruleData.payment_methods}
            onChange={handlePaymentMethodsChange}
            filterOptions={(options, params) => {
              const filtered = filter(options, params);
              const { inputValue } = params;
              if (inputValue !== "") {
                const isExisting = options.some(
                  (option) =>
                    option && option.toLowerCase() === inputValue.toLowerCase()
                );
                if (!isExisting) {
                  filtered.push({
                    inputValue: inputValue,
                    title: `Add "${inputValue}"`,
                  });
                }
              }
              return filtered;
            }}
            getOptionLabel={(option) => {
              if (typeof option === "object" && option.title) {
                return option.title;
              }
              return option || ""; // Return empty string for null/undefined
            }}
            renderOption={(props, option) => (
              <li {...props}>
                {typeof option === "object" ? option.title : option}
              </li>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Payment Methods"
                placeholder="Select methods (default: All)"
                error={!!errors.payment_methods}
                helperText={errors.payment_methods}
              />
            )}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  key={option}
                  variant="outlined"
                  label={option}
                  {...getTagProps({ index })}
                />
              ))
            }
            selectOnFocus
            clearOnBlur
            handleHomeEndKeys
          />
          {onOpenManagePaymentMethods && (
            <IconButton
              onClick={onOpenManagePaymentMethods}
              title="Manage Payment Methods"
            >
              <SettingsIcon />
            </IconButton>
          )}
        </Box>

        {/* Rate Input */}
        <TextField
          margin="normal"
          required
          fullWidth
          id="rate"
          label="Reward Rate"
          name="rate"
          type="number"
          value={ruleData.rate}
          onChange={handleInputChange}
          error={!!errors.rate}
          helperText={
            errors.rate ||
            "Enter the specific rate for this rule (e.g., 5 for 5%)"
          }
          InputProps={{
            inputProps: { min: 0, step: "any" },
            endAdornment: <InputAdornment position="end">%</InputAdornment>,
          }}
          sx={{ mb: 2 }}
        />

        {/* Conditionally render the Static/Rotating checkbox */}
        {showRotatingCheckbox && (
          <FormControlLabel
            control={
              <Checkbox
                checked={!ruleData.is_static} // Check means it IS rotating (NOT static)
                onChange={(e) =>
                  setRuleData((prev) => ({
                    ...prev,
                    is_static: !e.target.checked,
                  }))
                }
                name="is_rotating" // Logical name, state stores is_static
              />
            }
            label={`This is a rotating rule (clears ${
              cardRotationFrequency || "periodically"
            })`}
            sx={{ mt: 1, mb: 2 }}
          />
        )}

        {/* Action Buttons */}
        <Box sx={{ mt: 3, display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={onClose} sx={{ mr: 1 }}>
            Cancel
          </Button>
          <Button variant="contained" type="button" onClick={handleSubmit}>
            {isEditing ? "Save Changes" : "Add Rule"}
          </Button>
        </Box>
      </Box>
    </Modal>
  );
}

AddEditRewardRuleModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  ruleToEdit: PropTypes.object,
  rewardsCategories: PropTypes.array,
  rewardsPayees: PropTypes.array,
  paymentMethods: PropTypes.array,
  onOpenManageCategories: PropTypes.func,
  onOpenManagePayees: PropTypes.func,
  onOpenManagePaymentMethods: PropTypes.func,
  onPaymentMethodsUpdate: PropTypes.func,
  cardRewardsRotate: PropTypes.bool,
  cardRotationFrequency: PropTypes.string,
};

// Add default props
AddEditRewardRuleModal.defaultProps = {
  cardRewardsRotate: false,
};

export default AddEditRewardRuleModal;
