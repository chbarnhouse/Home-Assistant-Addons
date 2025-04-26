import React, { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import Modal from "@mui/material/Modal";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import InputAdornment from "@mui/material/InputAdornment";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import { v4 as uuidv4 } from "uuid";
import Paper from "@mui/material/Paper";
import { callApi } from "../utils/api";

const style = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: 600, // Wider for rules
  bgcolor: "background.paper",
  border: "2px solid #000",
  boxShadow: 24,
  p: 4,
  maxHeight: "90vh",
  overflowY: "auto",
};

const ALLOCATION_STATUSES = ["Liquid", "Frozen", "Deep Freeze"];
const RULE_TYPES = ["fixed", "percentage"];
const MANUAL_ACCOUNT_API = "manual_account";

function EditAllocationModal({ open, onClose, account, onSave }) {
  const [rules, setRules] = useState([]);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const formatCurrency = (value, isMilliunits = true) => {
    if (value == null) return "N/A";
    const numericValue = isMilliunits ? value / 1000.0 : value;
    return numericValue.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
    });
  };

  // Initialize rules state when modal opens or account changes
  useEffect(() => {
    if (open && account?.allocation_rules) {
      // Deep copy and ensure the remaining rule is last
      const initialRules = JSON.parse(JSON.stringify(account.allocation_rules));
      const remainingRuleIndex = initialRules.findIndex(
        (r) => r.id === "remaining"
      );
      if (
        remainingRuleIndex > -1 &&
        remainingRuleIndex !== initialRules.length - 1
      ) {
        const [remaining] = initialRules.splice(remainingRuleIndex, 1);
        initialRules.push(remaining);
      }
      setRules(initialRules);
      setEditingRuleId(null); // Reset editing state
      setError(null);
    } else if (!open) {
      setRules([]); // Clear rules when closed
      setEditingRuleId(null);
      setError(null);
    }
  }, [open, account]);

  const handleAddRule = () => {
    const newRule = {
      id: uuidv4(),
      type: "fixed",
      value: 0,
      status: "Liquid",
      isRemaining: false,
    };
    // Insert before the 'remaining' rule
    const remainingIndex = rules.findIndex((r) => r.id === "remaining");
    const newRules = [...rules];
    if (remainingIndex > -1) {
      newRules.splice(remainingIndex, 0, newRule);
    } else {
      newRules.push(newRule); // Should ideally not happen
    }
    setRules(newRules);
    setEditingRuleId(newRule.id); // Start editing the new rule
    setEditFormData({ ...newRule, value: String(newRule.value) });
  };

  const handleDeleteRule = (idToDelete) => {
    if (idToDelete === "remaining") return; // Cannot delete remaining rule
    setRules((prev) => prev.filter((rule) => rule.id !== idToDelete));
    if (editingRuleId === idToDelete) {
      setEditingRuleId(null);
    }
  };

  const handleStartEdit = (rule) => {
    setEditingRuleId(rule.id);
    setEditFormData({
      ...rule,
      value: rule.value != null ? String(rule.value) : "",
    });
  };

  const handleCancelEdit = () => {
    // If cancelling edit on a newly added (but not saved) rule, remove it
    const isNewUnsaved = rules.find(
      (r) =>
        r.id === editingRuleId &&
        !account?.allocation_rules.find((orig) => orig.id === editingRuleId)
    );
    if (isNewUnsaved) {
      handleDeleteRule(editingRuleId);
    }
    setEditingRuleId(null);
    setEditFormData({});
    setError(null); // Clear errors on cancel
  };

  const handleEditInputChange = (event) => {
    const { name, value } = event.target;
    setEditFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveEdit = () => {
    // Basic Validation
    if (editFormData.value === "") {
      setError(`Value cannot be empty for rule ${editingRuleId}`);
      return;
    }
    let numericValue;
    try {
      numericValue = parseFloat(editFormData.value);
      if (
        editFormData.type === "percentage" &&
        (numericValue <= 0 || numericValue > 100)
      ) {
        setError(
          `Percentage must be between 0 (exclusive) and 100 for rule ${editingRuleId}`
        );
        return;
      }
      if (editFormData.type === "fixed" && numericValue < 0) {
        setError(`Fixed value cannot be negative for rule ${editingRuleId}`);
        return;
      }
    } catch {
      setError(`Invalid numeric value for rule ${editingRuleId}`);
      return;
    }

    const updatedRules = rules.map((rule) => {
      if (rule.id === editingRuleId) {
        return {
          ...rule, // Keep original ID and isRemaining flag
          type: editFormData.type,
          value: numericValue,
          status: editFormData.status,
        };
      }
      return rule;
    });

    setRules(updatedRules);
    setEditingRuleId(null);
    setEditFormData({});
    setError(null); // Clear error on successful save
  };

  const handleSaveAll = async () => {
    if (!account) return;
    setIsLoading(true);
    setError(null);

    const payload = {
      ...account, // Send existing account details
      allocation_rules: rules, // Send the updated rules array
    };

    try {
      const result = await callApi(`${MANUAL_ACCOUNT_API}/${account.id}`, {
        method: "POST", // Or PUT, depending on API design
        body: JSON.stringify(payload),
      });

      onSave(result.details || result); // Call the onSave callback with the result
      onClose(); // Close the modal on success
    } catch (err) {
      console.error("Error saving allocation rules:", err);
      setError(err.message || "Failed to save allocation rules.");
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate estimated allocation amounts for display
  const calculateEstimatedAllocations = useCallback(() => {
    if (!account) return {};
    const totalBalance = account.balance || 0;
    let liquid = 0;
    let frozen = 0;
    let deepFreeze = 0;
    let remaining = totalBalance;

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

    // Remaining
    const remainingRule = rules.find((r) => r.id === "remaining");
    if (remainingRule && remaining > 0) {
      if (remainingRule.status === "Liquid") liquid += remaining;
      else if (remainingRule.status === "Frozen") frozen += remaining;
      else if (remainingRule.status === "Deep Freeze") deepFreeze += remaining;
    } else if (remaining > 0) {
      liquid += remaining; // Default remaining to liquid
    }

    return { liquid, frozen, deepFreeze };
  }, [rules, account]);

  const estimated = calculateEstimatedAllocations();

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="edit-allocation-modal-title"
    >
      <Box sx={style}>
        <Typography
          id="edit-allocation-modal-title"
          variant="h6"
          component="h2"
        >
          Edit Allocations for: {account?.name}
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Current Balance: {formatCurrency(account?.balance)}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2">Allocation Rules</Typography>
          <List dense>
            {rules.map((rule) => (
              <ListItem
                key={rule.id}
                sx={{
                  display: "flex",
                  gap: 1,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                {editingRuleId === rule.id ? (
                  // --- Edit Form ---
                  <>
                    <FormControl size="small" sx={{ minWidth: 100 }}>
                      <InputLabel>Type</InputLabel>
                      <Select
                        name="type"
                        value={editFormData.type || ""}
                        label="Type"
                        onChange={handleEditInputChange}
                        disabled={rule.id === "remaining"}
                      >
                        {RULE_TYPES.map((t) => (
                          <MenuItem key={t} value={t}>
                            {t}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <TextField
                      name="value"
                      label="Value"
                      size="small"
                      type="number"
                      value={editFormData.value || ""}
                      onChange={handleEditInputChange}
                      InputProps={{
                        startAdornment:
                          editFormData.type === "fixed" ? (
                            <InputAdornment position="start">$</InputAdornment>
                          ) : null,
                        endAdornment:
                          editFormData.type === "percentage" ? (
                            <InputAdornment position="end">%</InputAdornment>
                          ) : null,
                        inputProps: {
                          step: editFormData.type === "percentage" ? 0.1 : 0.01,
                          min: 0,
                        },
                      }}
                      sx={{ width: 120 }}
                      disabled={rule.id === "remaining"}
                    />
                    <FormControl size="small" sx={{ minWidth: 120 }}>
                      <InputLabel>Status</InputLabel>
                      <Select
                        name="status"
                        value={editFormData.status || ""}
                        label="Status"
                        onChange={handleEditInputChange}
                      >
                        {ALLOCATION_STATUSES.map((s) => (
                          <MenuItem key={s} value={s}>
                            {s}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <IconButton
                      onClick={handleSaveEdit}
                      color="primary"
                      size="small"
                    >
                      <SaveIcon />
                    </IconButton>
                    <IconButton onClick={handleCancelEdit} size="small">
                      <CancelIcon />
                    </IconButton>
                  </>
                ) : (
                  // --- Display Row ---
                  <>
                    <Typography sx={{ flexBasis: "100px", flexShrink: 0 }}>
                      {rule.id === "remaining" ? "Remaining" : rule.type}
                    </Typography>
                    <Typography
                      sx={{
                        flexBasis: "120px",
                        flexShrink: 0,
                        textAlign: "right",
                      }}
                    >
                      {rule.id !== "remaining"
                        ? rule.type === "fixed"
                          ? formatCurrency(rule.value * 1000)
                          : `${rule.value}%`
                        : "-"}
                    </Typography>
                    <Typography
                      sx={{
                        flexBasis: "120px",
                        flexShrink: 0,
                        fontWeight: "bold",
                      }}
                    >
                      {rule.status}
                    </Typography>
                    <Box sx={{ ml: "auto" }}>
                      {rule.id !== "remaining" && (
                        <IconButton
                          onClick={() => handleStartEdit(rule)}
                          size="small"
                        >
                          <EditIcon fontSize="inherit" />
                        </IconButton>
                      )}
                      {rule.id !== "remaining" && (
                        <IconButton
                          onClick={() => handleDeleteRule(rule.id)}
                          size="small"
                        >
                          <DeleteIcon fontSize="inherit" />
                        </IconButton>
                      )}
                    </Box>
                  </>
                )}
              </ListItem>
            ))}
          </List>
          <Button
            startIcon={<AddIcon />}
            onClick={handleAddRule}
            size="small"
            sx={{ mt: 1 }}
          >
            Add Fixed/Percentage Rule
          </Button>
        </Paper>

        <Paper
          variant="outlined"
          sx={{ p: 2, mb: 2, backgroundColor: "#f5f5f5" }}
        >
          <Typography variant="subtitle2">
            Estimated Allocations Based on Rules Above
          </Typography>
          <Box sx={{ display: "flex", justifyContent: "space-around", mt: 1 }}>
            <Typography>Liquid: {formatCurrency(estimated.liquid)}</Typography>
            <Typography>Frozen: {formatCurrency(estimated.frozen)}</Typography>
            <Typography>
              Deep Freeze: {formatCurrency(estimated.deepFreeze)}
            </Typography>
          </Box>
          {Math.abs(
            (account?.balance || 0) -
              (estimated.liquid + estimated.frozen + estimated.deepFreeze)
          ) > 10 && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              Total allocated does not match current balance.
            </Alert>
          )}
        </Paper>

        <Box sx={{ mt: 3, display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={onClose} disabled={isLoading} sx={{ mr: 1 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveAll}
            disabled={isLoading}
          >
            {isLoading ? <CircularProgress size={24} /> : "Save All Rules"}
          </Button>
        </Box>
      </Box>
    </Modal>
  );
}

EditAllocationModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  account: PropTypes.object, // Account object from YNAB/all_data
  onSave: PropTypes.func.isRequired, // Callback with updated account object
};

export default EditAllocationModal;
