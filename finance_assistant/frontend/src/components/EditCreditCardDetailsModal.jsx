import React, { useState, useEffect, useRef, useCallback } from "react";
import PropTypes from "prop-types";
import Modal from "@mui/material/Modal";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import TextField from "@mui/material/TextField";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Autocomplete from "@mui/material/Autocomplete";
import Grid from "@mui/material/Grid";
import Chip from "@mui/material/Chip";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import Tooltip from "@mui/material/Tooltip";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import { callApi } from "../utils/api";
import { useSnackbar } from "../context/SnackbarContext";

function EditCreditCardDetailsModal({
  open,
  onClose,
  cardToEdit,
  onUpdate,
  banks = [],
  paymentMethods = [],
  categories = [],
  payees = [],
  rewardsPayees = [],
  pointsPrograms = [],
}) {
  const [cardName, setCardName] = useState("");
  const [bankName, setBankName] = useState("");
  const [last4Digits, setLast4Digits] = useState("");
  const [includeBank, setIncludeBank] = useState(false);
  const [annualFee, setAnnualFee] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [autoPayDay1, setAutoPayDay1] = useState("");
  const [autoPayDay2, setAutoPayDay2] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState([]);
  const [rewardType, setRewardType] = useState("Static");
  const [baseRate, setBaseRate] = useState("");
  const [rewardSystem, setRewardSystem] = useState("Cashback");
  const [pointsProgram, setPointsProgram] = useState(null);
  const [staticRewards, setStaticRewards] = useState([
    { category: [], payee: [], paymentMethod: [], rate: "" },
  ]);
  const [dynamicPeriod, setDynamicPeriod] = useState("Monthly");
  const [dynamicTiers, setDynamicTiers] = useState([
    {
      tierName: "Tier 1",
      tierRate: "",
      maxActiveRules: 1,
      eligibleRules: [{ category: [], payee: [], paymentMethod: [], rank: 1 }],
    },
  ]);
  const [rotatingPeriod, setRotatingPeriod] = useState("Quarterly");
  const [rotatingRules, setRotatingRules] = useState([
    {
      category: [],
      payee: [],
      paymentMethod: [],
      rate: "",
      isRotating: true,
      applicablePeriod: "Q1",
    },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { notify } = useSnackbar();

  const handleBankAutocompleteChange = (event, newValue) => {
    const selectedBankName =
      typeof newValue === "string" ? newValue : newValue?.name || "";
    setBankName(selectedBankName);
  };

  const handlePaymentMethodAutocompleteChange = (event, newValue) => {
    setSelectedPaymentMethods(newValue);
  };

  const handlePointsProgramChange = (event, newValue) => {
    setPointsProgram(newValue);
  };

  const handleStaticRewardCategoryChange = (index, newValue) => {
    handleStaticRewardChange(index, "category", newValue);
  };

  const handleStaticRewardPayeeChange = (index, newValue) => {
    handleStaticRewardChange(index, "payee", newValue);
  };

  const handleStaticRewardPaymentMethodChange = (index, newValue) => {
    handleStaticRewardChange(index, "paymentMethod", newValue);
  };

  const handleRotatingRuleCategoryChange = (index, newValue) => {
    handleRotatingRuleChange(index, "category", newValue);
  };

  const handleRotatingRulePayeeChange = (index, newValue) => {
    handleRotatingRuleChange(index, "payee", newValue);
  };

  const handleRotatingRulePaymentMethodChange = (index, newValue) => {
    handleRotatingRuleChange(index, "paymentMethod", newValue);
  };

  const handleEligibleRuleCategoryChange = (tierIndex, ruleIndex, newValue) => {
    handleEligibleRuleChange(tierIndex, ruleIndex, "category", newValue);
  };

  const handleEligibleRulePayeeChange = (tierIndex, ruleIndex, newValue) => {
    handleEligibleRuleChange(tierIndex, ruleIndex, "payee", newValue);
  };

  const handleEligibleRulePaymentMethodChange = (
    tierIndex,
    ruleIndex,
    newValue
  ) => {
    handleEligibleRuleChange(tierIndex, ruleIndex, "paymentMethod", newValue);
  };

  const handleClose = () => {
    setError(null);
    if (onClose) onClose();
  };

  const handleSave = async () => {
    setError(null);
    setLoading(true);

    const errors = [];
    if (!cardName.trim()) errors.push("Card Name is required.");
    if (
      !bankName ||
      !banks.some((b) => (typeof b === "string" ? b : b.name) === bankName)
    )
      errors.push("Valid Bank is required.");
    if (expirationDate.trim() && !/^\d{2}\/\d{4}$/.test(expirationDate.trim()))
      errors.push("Expiration Date must be in MM/YYYY format.");
    if (!selectedPaymentMethods.every((pm) => paymentMethods.includes(pm)))
      errors.push("Invalid Payment Method selected.");
    if (baseRate && isNaN(parseFloat(baseRate))) {
      errors.push("Base Rate must be a number.");
    }
    if (rewardSystem === "Points" && !pointsProgram) {
      errors.push(
        "Points Program is required when Reward System is set to Points."
      );
    }

    if (errors.length > 0) {
      setError(errors.join(" "));
      setLoading(false);
      return;
    }

    // Map reward rule arrays to format expected by backend (names instead of objects)
    const mapRulePaymentMethodsToNames = (rules) => {
      if (!Array.isArray(rules)) return [];
      return rules.map((rule) => ({
        ...rule,
        paymentMethod: Array.isArray(rule.paymentMethod)
          ? rule.paymentMethod.map((pm) => pm.name || pm) // Extract name, fallback to original if already string
          : [],
        // Assuming category/payee are already arrays of strings/expected format
        category: Array.isArray(rule.category) ? rule.category : [],
        payee: Array.isArray(rule.payee) ? rule.payee : [],
      }));
    };

    const mapDynamicTierPaymentMethodsToNames = (tiers) => {
      if (!Array.isArray(tiers)) return [];
      return tiers.map((tier) => ({
        ...tier,
        eligibleRules: mapRulePaymentMethodsToNames(tier.eligibleRules),
      }));
    };

    const updatedDetails = {
      id: cardToEdit?.id,
      card_name: cardName,
      bank: bankName,
      include_bank_in_name: includeBank,
      last_4_digits: last4Digits,
      annual_fee: annualFee ? parseFloat(annualFee) : null,
      credit_limit: creditLimit ? parseFloat(creditLimit) : null,
      // Map top-level payment methods to names
      payment_methods: Array.isArray(selectedPaymentMethods)
        ? selectedPaymentMethods.map((pm) => pm.name || pm)
        : [],
      auto_pay_day_1: autoPayDay1 ? parseInt(autoPayDay1, 10) : null,
      auto_pay_day_2: autoPayDay2 ? parseInt(autoPayDay2, 10) : null,
      notes: notes || "",
      expiration_date: expirationDate || null,
      base_rate: baseRate ? parseFloat(baseRate) : null,
      reward_system: rewardSystem,
      // Map points program object to name/ID if necessary (assuming backend expects string/ID)
      points_program: rewardSystem === "Points" ? (pointsProgram?.name || pointsProgram || null) : null,
      reward_structure_type: rewardType,
      // Map reward rules' payment methods to names
      static_rewards: mapRulePaymentMethodsToNames(staticRewards),
      rotating_rules: mapRulePaymentMethodsToNames(rotatingRules),
      dynamic_tiers: mapDynamicTierPaymentMethodsToNames(dynamicTiers),
      rotation_period: rotatingPeriod,
      activation_period: dynamicPeriod,
    };

    console.log("Saving updated card details (mapped):", updatedDetails);

    try {
      const result = await callApi(`manual_credit_card/${cardToEdit.id}`, {
        method: "PUT",
        body: JSON.stringify(updatedDetails),
      });

      if (result && result.id) {
        notify("Card details saved successfully.", "success");
        if (onUpdate) {
          onUpdate(result);
        }
        handleClose();
      } else {
        _LOGGER.error("API returned success status but invalid data:", result);
        throw new Error("Received invalid data from server after save.");
      }
    } catch (err) {
      console.error("Error saving card details:", err);
      setError(err.message || "An unknown error occurred while saving.");
      notify("Failed to save card details.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && cardToEdit) {
      setLoading(true);
      setError(null);

      setCardName(cardToEdit.card_name || cardToEdit.name || "");
      const initialBank = cardToEdit.bank || "";
      setBankName(initialBank);
      setLast4Digits(cardToEdit.last_4_digits || "");
      setIncludeBank(cardToEdit.include_bank_in_name ?? false);
      setAnnualFee(cardToEdit.annual_fee || "");
      setExpirationDate(cardToEdit.expiration_date || "");
      setAutoPayDay1(cardToEdit.auto_pay_day_1 || "");
      setAutoPayDay2(cardToEdit.auto_pay_day_2 || "");
      setCreditLimit(cardToEdit.credit_limit || "");
      setNotes(cardToEdit.notes || "");
      setSelectedPaymentMethods(
        Array.isArray(cardToEdit.payment_methods)
          ? cardToEdit.payment_methods
              .map((pmName) =>
                paymentMethods.find((pmObj) => pmObj.name === pmName)
              )
              .filter(Boolean)
          : []
      );
      setRewardType(cardToEdit?.reward_structure_type || "Static");
      setBaseRate(cardToEdit?.base_rate || "");
      setRewardSystem(cardToEdit?.reward_system || "Cashback");
      setPointsProgram(cardToEdit?.points_program || null);

      setStaticRewards(
        Array.isArray(cardToEdit?.static_rewards) &&
          cardToEdit.static_rewards.length > 0
          ? cardToEdit.static_rewards.map((rule) => ({
              ...rule,
              category: Array.isArray(rule.category) ? rule.category : [],
              payee: Array.isArray(rule.payee) ? rule.payee : [],
              paymentMethod: Array.isArray(rule.paymentMethod)
                ? rule.paymentMethod
                    .map((pmName) =>
                      paymentMethods.find((pmObj) => pmObj.name === pmName)
                    )
                    .filter(Boolean)
                : [],
            }))
          : [{ category: [], payee: [], paymentMethod: [], rate: "" }]
      );
      setDynamicPeriod(cardToEdit?.activation_period || "Monthly");
      setDynamicTiers(
        Array.isArray(cardToEdit?.dynamic_tiers) &&
          cardToEdit.dynamic_tiers.length > 0
          ? cardToEdit.dynamic_tiers.map((tier) => ({
              ...tier,
              eligibleRules: Array.isArray(tier.eligibleRules)
                ? tier.eligibleRules.map((rule) => ({
                    ...rule,
                    category: Array.isArray(rule.category) ? rule.category : [],
                    payee: Array.isArray(rule.payee) ? rule.payee : [],
                    paymentMethod: Array.isArray(rule.paymentMethod)
                      ? rule.paymentMethod
                          .map((pmName) =>
                            paymentMethods.find(
                              (pmObj) => pmObj.name === pmName
                            )
                          )
                          .filter(Boolean)
                      : [],
                  }))
                : [
                    {
                      category: [],
                      payee: [],
                      paymentMethod: [],
                      rank: 1,
                    },
                  ],
            }))
          : [
              {
                tierName: "Tier 1",
                tierRate: "",
                maxActiveRules: 1,
                eligibleRules: [
                  { category: [], payee: [], paymentMethod: [], rank: 1 },
                ],
              },
            ]
      );
      setRotatingPeriod(cardToEdit?.rotation_period || "Quarterly");
      setRotatingRules(
        Array.isArray(cardToEdit?.rotating_rules) &&
          cardToEdit.rotating_rules.length > 0
          ? cardToEdit.rotating_rules.map((rule) => ({
              ...rule,
              category: Array.isArray(rule.category) ? rule.category : [],
              payee: Array.isArray(rule.payee) ? rule.payee : [],
              paymentMethod: Array.isArray(rule.paymentMethod)
                ? rule.paymentMethod
                    .map((pmName) =>
                      paymentMethods.find((pmObj) => pmObj.name === pmName)
                    )
                    .filter(Boolean)
                : [],
            }))
          : [
              {
                category: [],
                payee: [],
                paymentMethod: [],
                rate: "",
                isRotating: true,
                applicablePeriod: "Q1",
              },
            ]
      );

      setLoading(false);
    } else if (!open) {
    }
  }, [open, cardToEdit, paymentMethods]);

  const handleStaticRewardChange = (index, field, value) => {
    const updatedRewards = [...staticRewards];
    updatedRewards[index] = { ...updatedRewards[index], [field]: value };
    setStaticRewards(updatedRewards);
  };

  const addStaticReward = () => {
    setStaticRewards([
      ...staticRewards,
      { category: [], payee: [], paymentMethod: [], rate: "" },
    ]);
  };

  const removeStaticReward = (index) => {
    if (staticRewards.length <= 1) return;
    const updatedRewards = staticRewards.filter((_, i) => i !== index);
    setStaticRewards(updatedRewards);
  };

  const addDynamicTier = () => {
    setDynamicTiers([
      ...dynamicTiers,
      {
        tierName: `Tier ${dynamicTiers.length + 1}`,
        tierRate: "",
        maxActiveRules: 1,
        eligibleRules: [
          { category: [], payee: [], paymentMethod: [], rank: 1 },
        ],
      },
    ]);
  };

  const removeDynamicTier = (index) => {
    if (dynamicTiers.length <= 1) return;
    const updatedTiers = dynamicTiers.filter((_, i) => i !== index);
    setDynamicTiers(updatedTiers);
  };

  const handleDynamicTierChange = (index, field, value) => {
    setDynamicTiers((currentTiers) =>
      currentTiers.map((tier, i) =>
        i === index ? { ...tier, [field]: value } : tier
      )
    );
  };

  const addEligibleRule = (tierIndex) => {
    setDynamicTiers((currentTiers) =>
      currentTiers.map((tier, i) => {
        if (i === tierIndex) {
          return {
            ...tier,
            eligibleRules: [
              ...tier.eligibleRules,
              {
                category: [],
                payee: [],
                paymentMethod: [],
                rank: tier.eligibleRules.length + 1,
              },
            ],
          };
        }
        return tier;
      })
    );
  };

  const removeEligibleRule = (tierIndex, ruleIndex) => {
    setDynamicTiers((currentTiers) =>
      currentTiers.map((tier, i) => {
        if (i === tierIndex) {
          if (tier.eligibleRules.length <= 1) return tier;
          const updatedRules = tier.eligibleRules.filter(
            (_, rIdx) => rIdx !== ruleIndex
          );
          const rerankedRules = updatedRules.map((rule, newIndex) => ({
            ...rule,
            rank: newIndex + 1,
          }));
          return { ...tier, eligibleRules: rerankedRules };
        }
        return tier;
      })
    );
  };

  const handleEligibleRuleChange = (tierIndex, ruleIndex, field, value) => {
    setDynamicTiers((currentTiers) =>
      currentTiers.map((tier, i) => {
        if (i === tierIndex) {
          const updatedRules = tier.eligibleRules.map((rule, rIdx) =>
            rIdx === ruleIndex ? { ...rule, [field]: value } : rule
          );
          return { ...tier, eligibleRules: updatedRules };
        }
        return tier;
      })
    );
  };

  const addRotatingRule = () => {
    const defaultPeriod = rotatingPeriod === "Monthly" ? 1 : "Q1";
    setRotatingRules([
      ...rotatingRules,
      {
        category: [],
        payee: [],
        paymentMethod: [],
        rate: "",
        isRotating: true,
        applicablePeriod: defaultPeriod,
      },
    ]);
  };

  const removeRotatingRule = (index) => {
    if (rotatingRules.length <= 1) return;
    setRotatingRules(rotatingRules.filter((_, i) => i !== index));
  };

  const handleRotatingRuleChange = (index, field, value) => {
    setRotatingRules((currentRules) =>
      currentRules.map((rule, i) =>
        i === index ? { ...rule, [field]: value } : rule
      )
    );
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      aria-labelledby="credit-card-modal-title"
    >
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: { xs: "90%", sm: "80%", md: "70%", lg: "60%" },
          maxWidth: "900px",
          maxHeight: "90vh",
          bgcolor: "background.paper",
          border: "1px solid #ccc",
          boxShadow: 24,
          p: 4,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Typography
          id="credit-card-modal-title"
          variant="h6"
          component="h2"
          sx={{ mb: 2 }}
        >
          Edit Credit Card Details
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ flexGrow: 1, overflowY: "auto", pr: 1 }}>
          {loading ? (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "200px",
              }}
            >
              <CircularProgress />
            </Box>
          ) : (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" gutterBottom>
                  Card Information
                </Typography>
                <TextField
                  margin="dense"
                  id="name"
                  label="Card Name"
                  type="text"
                  fullWidth
                  variant="outlined"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  sx={{ mb: 2 }}
                  size="small"
                />
                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}
                >
                  <Autocomplete
                    size="small"
                    options={banks}
                    value={bankName}
                    onChange={handleBankAutocompleteChange}
                    getOptionLabel={(option) =>
                      typeof option === "string" ? option : option?.name || ""
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Bank"
                        variant="outlined"
                        size="small"
                      />
                    )}
                    sx={{ flexGrow: 1 }}
                  />
                </Box>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={includeBank}
                      onChange={(e) => setIncludeBank(e.target.checked)}
                      name="includeBank"
                      size="small"
                    />
                  }
                  label="Include Bank in Card Name"
                  sx={{ display: "block", mb: 1 }}
                />
                <TextField
                  margin="dense"
                  id="last4Digits"
                  label="Last 4 Digits"
                  type="text"
                  fullWidth
                  variant="outlined"
                  size="small"
                  value={last4Digits}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    setLast4Digits(val.slice(0, 4));
                  }}
                  inputProps={{ maxLength: 4 }}
                  sx={{ mb: 2 }}
                />
                <TextField
                  margin="dense"
                  id="expirationDate"
                  label="Expiration Date (MM/YYYY)"
                  type="text"
                  fullWidth
                  variant="outlined"
                  size="small"
                  value={expirationDate}
                  onChange={(e) => {
                    let value = e.target.value.replace(/[^0-9/]/g, "");
                    if (
                      value.length === 2 &&
                      expirationDate.length === 1 &&
                      !value.includes("/")
                    ) {
                      value += "/";
                    }
                    if (value.length === 2 && expirationDate.length === 3) {
                      value = value.slice(0, 1);
                    }
                    if (value.length > 7) {
                      value = value.slice(0, 7);
                    }
                    setExpirationDate(value);
                  }}
                  placeholder="MM/YYYY"
                  inputProps={{ maxLength: 7 }}
                  sx={{ mb: 2 }}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" gutterBottom>
                  Financial Details
                </Typography>
                <TextField
                  margin="dense"
                  id="annualFee"
                  label="Annual Fee ($)"
                  type="number"
                  fullWidth
                  variant="outlined"
                  size="small"
                  value={annualFee}
                  onChange={(e) => setAnnualFee(e.target.value)}
                  inputProps={{ step: "0.01" }}
                  sx={{ mb: 2 }}
                />
                <TextField
                  margin="dense"
                  id="creditLimit"
                  label="Credit Limit ($)"
                  type="number"
                  fullWidth
                  variant="outlined"
                  size="small"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  inputProps={{ step: "0.01" }}
                  sx={{ mb: 2 }}
                />
                <TextField
                  margin="dense"
                  id="autoPayDay1"
                  label="Auto Pay Day 1 (1-31)"
                  type="number"
                  fullWidth
                  variant="outlined"
                  size="small"
                  value={autoPayDay1}
                  onChange={(e) => setAutoPayDay1(e.target.value)}
                  inputProps={{ min: 1, max: 31, step: 1 }}
                  sx={{ mb: 2 }}
                />
                <TextField
                  margin="dense"
                  id="autoPayDay2"
                  label="Auto Pay Day 2 (Optional, 1-31)"
                  type="number"
                  fullWidth
                  variant="outlined"
                  size="small"
                  value={autoPayDay2}
                  onChange={(e) => setAutoPayDay2(e.target.value)}
                  inputProps={{ min: 1, max: 31, step: 1 }}
                  sx={{ mb: 2 }}
                />
                <Box sx={{ mb: 2 }}>
                  <Typography
                    variant="subtitle2"
                    gutterBottom
                    component="label"
                  >
                    Payment Methods
                  </Typography>
                  <Autocomplete
                    multiple
                    id="payment-methods-autocomplete"
                    options={paymentMethods.map((pm) => pm.name)}
                    value={selectedPaymentMethods.map((pm) => pm.name)}
                    onChange={(event, newValue) => {
                      setSelectedPaymentMethods(
                        newValue.map((pmName) =>
                          paymentMethods.find((pmObj) => pmObj.name === pmName)
                        )
                      );
                    }}
                    filterSelectedOptions
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        variant="outlined"
                        label="Accepted Payment Methods"
                        placeholder="Select methods"
                      />
                    )}
                    renderTags={(value, getTagProps) => {
                      if (!Array.isArray(value)) {
                        return null;
                      }
                      return value.map((option, tagIndex) => (
                        <Chip
                          variant="outlined"
                          label={option}
                          {...getTagProps({ index: tagIndex })}
                          key={option}
                        />
                      ));
                    }}
                    isOptionEqualToValue={(option, value) => option === value}
                    fullWidth
                  />
                </Box>
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle1" gutterBottom>
                  Notes
                </Typography>
                <TextField
                  margin="dense"
                  id="notes"
                  label="Notes"
                  type="text"
                  fullWidth
                  variant="outlined"
                  multiline
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle1" gutterBottom sx={{ mt: 1 }}>
                  Rewards
                </Typography>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} sm={4}>
                    <TextField
                      margin="dense"
                      id="baseRate"
                      label="Base Reward Rate (%)"
                      type="number"
                      fullWidth
                      variant="outlined"
                      size="small"
                      value={baseRate}
                      onChange={(e) => setBaseRate(e.target.value)}
                      inputProps={{ step: "0.01", min: "0" }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <FormControl component="fieldset" margin="dense">
                      <Typography
                        variant="caption"
                        component="legend"
                        sx={{ mb: -0.5 }}
                      >
                        Reward System
                      </Typography>
                      <RadioGroup
                        row
                        aria-label="reward-system"
                        name="reward-system-group"
                        value={rewardSystem}
                        onChange={(e) => setRewardSystem(e.target.value)}
                      >
                        <FormControlLabel
                          value="Cashback"
                          control={<Radio size="small" />}
                          label="Cashback"
                        />
                        <FormControlLabel
                          value="Points"
                          control={<Radio size="small" />}
                          label="Points"
                        />
                      </RadioGroup>
                    </FormControl>
                  </Grid>
                  {rewardSystem === "Points" && (
                    <Grid item xs={12} sm={4}>
                      <Autocomplete
                        size="small"
                        options={pointsPrograms}
                        value={pointsProgram}
                        onChange={(event, newValue) => {
                          setPointsProgram(newValue);
                        }}
                        isOptionEqualToValue={(option, value) =>
                          option === value
                        }
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Points Program"
                            variant="outlined"
                            size="small"
                            fullWidth
                            margin="normal"
                          />
                        )}
                        disabled={rewardSystem !== "Points"}
                      />
                    </Grid>
                  )}
                </Grid>

                <FormControl fullWidth margin="dense" sx={{ mt: 1, mb: 2 }}>
                  <InputLabel id="reward-type-label" size="small">
                    Reward Structure Type
                  </InputLabel>
                  <Select
                    labelId="reward-type-label"
                    id="reward-type"
                    value={rewardType}
                    label="Reward Structure Type"
                    onChange={(e) => setRewardType(e.target.value)}
                    size="small"
                  >
                    <MenuItem value="Static">Static</MenuItem>
                    <MenuItem value="Rotating">Rotating</MenuItem>
                    <MenuItem value="Dynamic">Dynamic</MenuItem>
                  </Select>
                </FormControl>

                <Box
                  sx={{
                    mt: 1,
                    p: 2,
                    border: "1px dashed",
                    borderColor: "divider",
                    borderRadius: 1,
                    minHeight: "100px",
                  }}
                >
                  {rewardType === "Static" && (
                    <Box>
                      <Typography variant="subtitle2" gutterBottom>
                        Static Reward Rules
                      </Typography>
                      {staticRewards.map((rule, index) => (
                        <Box
                          key={`static-${index}`}
                          sx={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: 1.5,
                            mb: 1.5,
                            p: 1.5,
                            border: "1px solid",
                            borderColor: "divider",
                            borderRadius: 1,
                          }}
                        >
                          <Box
                            sx={{
                              flexBasis: { xs: "100%", sm: "200px" },
                              flexGrow: 1,
                            }}
                          >
                            <Autocomplete
                              multiple
                              size="small"
                              options={categories}
                              value={rule.category || []}
                              onChange={(event, newValue) =>
                                handleStaticRewardChange(
                                  index,
                                  "category",
                                  newValue
                                )
                              }
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label="Category"
                                  variant="outlined"
                                  size="small"
                                />
                              )}
                              renderTags={(value, getTagProps) => {
                                if (!Array.isArray(value)) {
                                  return null;
                                }
                                return value.map((option, tagIndex) => (
                                  <Chip
                                    variant="outlined"
                                    label={option}
                                    size="small"
                                    {...getTagProps({ index: tagIndex })}
                                  />
                                ));
                              }}
                              sx={{ width: "100%" }}
                            />
                          </Box>
                          <Box
                            sx={{
                              flexBasis: { xs: "100%", sm: "200px" },
                              flexGrow: 1,
                            }}
                          >
                            <Autocomplete
                              multiple
                              size="small"
                              options={rewardsPayees}
                              value={rule.payee || []}
                              getOptionLabel={(option) =>
                                typeof option === "string"
                                  ? option
                                  : option?.name || ""
                              }
                              onChange={(event, newValue) =>
                                handleStaticRewardChange(
                                  index,
                                  "payee",
                                  newValue
                                )
                              }
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label="Payee(s)"
                                  variant="outlined"
                                  size="small"
                                />
                              )}
                              renderTags={(value, getTagProps) => {
                                if (!Array.isArray(value)) {
                                  return null;
                                }
                                return value.map((option, tagIndex) => (
                                  <Chip
                                    variant="outlined"
                                    label={
                                      typeof option === "string"
                                        ? option
                                        : option.name
                                    }
                                    size="small"
                                    {...getTagProps({ index: tagIndex })}
                                  />
                                ));
                              }}
                              sx={{ width: "100%" }}
                            />
                          </Box>
                          <Box
                            sx={{
                              flexBasis: { xs: "100%", sm: "200px" },
                              flexGrow: 1,
                            }}
                          >
                            <Autocomplete
                              multiple
                              size="small"
                              options={paymentMethods}
                              value={rule.paymentMethod || []}
                              getOptionLabel={(option) => option.name || ""}
                              isOptionEqualToValue={(option, value) =>
                                option.id === value.id
                              }
                              onChange={(event, newValue) =>
                                handleStaticRewardChange(
                                  index,
                                  "paymentMethod",
                                  newValue
                                )
                              }
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label="Payment Method"
                                  variant="outlined"
                                  size="small"
                                />
                              )}
                              renderTags={(value, getTagProps) => {
                                if (!Array.isArray(value)) {
                                  return null;
                                }
                                return value.map((option, tagIndex) => (
                                  <Chip
                                    variant="outlined"
                                    label={option.name || ""}
                                    size="small"
                                    {...getTagProps({ index: tagIndex })}
                                  />
                                ));
                              }}
                              sx={{ width: "100%" }}
                            />
                          </Box>
                          <TextField
                            label="Rate (%)"
                            type="number"
                            size="small"
                            value={rule.rate}
                            onChange={(e) =>
                              handleStaticRewardChange(
                                index,
                                "rate",
                                e.target.value
                              )
                            }
                            sx={{ width: "90px" }}
                            inputProps={{ step: "0.01", min: "0" }}
                          />
                          <IconButton
                            onClick={() => removeStaticReward(index)}
                            color="error"
                            size="small"
                            disabled={staticRewards.length <= 1}
                            sx={{ ml: "auto" }}
                          >
                            <RemoveCircleOutlineIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      ))}
                      <Button
                        startIcon={<AddCircleOutlineIcon />}
                        onClick={addStaticReward}
                        size="small"
                      >
                        Add Static Rule
                      </Button>
                    </Box>
                  )}
                  {rewardType === "Rotating" && (
                    <Box>
                      <Typography variant="subtitle2" gutterBottom>
                        Rotating Reward Configuration
                      </Typography>
                      <FormControl fullWidth margin="dense" sx={{ mb: 2 }}>
                        <InputLabel id="rotating-period-label" size="small">
                          Rotation Period
                        </InputLabel>
                        <Select
                          labelId="rotating-period-label"
                          id="rotating-period"
                          value={rotatingPeriod}
                          label="Rotation Period"
                          onChange={(e) => setRotatingPeriod(e.target.value)}
                          size="small"
                        >
                          <MenuItem value="Monthly">Monthly</MenuItem>
                          <MenuItem value="Quarterly">Quarterly</MenuItem>
                        </Select>
                      </FormControl>

                      <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>
                        Rotating Rules
                      </Typography>
                      {rotatingRules.map((rule, index) => (
                        <Box
                          key={`rotating-${index}`}
                          sx={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: 1.5,
                            mb: 1.5,
                            p: 1.5,
                            border: "1px solid",
                            borderColor: "divider",
                            borderRadius: 1,
                          }}
                        >
                          <Box
                            sx={{
                              flexBasis: { xs: "100%", sm: "180px" },
                              flexGrow: 1,
                            }}
                          >
                            <Autocomplete
                              multiple
                              size="small"
                              options={categories}
                              value={rule.category || []}
                              onChange={(event, newValue) =>
                                handleRotatingRuleChange(
                                  index,
                                  "category",
                                  newValue
                                )
                              }
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label="Category"
                                  variant="outlined"
                                  size="small"
                                />
                              )}
                              renderTags={(value, getTagProps) => {
                                if (!Array.isArray(value)) {
                                  return null;
                                }
                                return value.map((option, tagIndex) => (
                                  <Chip
                                    variant="outlined"
                                    label={option}
                                    size="small"
                                    {...getTagProps({ index: tagIndex })}
                                  />
                                ));
                              }}
                              sx={{ width: "100%" }}
                            />
                          </Box>
                          <Box
                            sx={{
                              flexBasis: { xs: "100%", sm: "180px" },
                              flexGrow: 1,
                            }}
                          >
                            <Autocomplete
                              multiple
                              size="small"
                              options={rewardsPayees}
                              value={rule.payee || []}
                              getOptionLabel={(option) =>
                                typeof option === "string"
                                  ? option
                                  : option?.name || ""
                              }
                              onChange={(event, newValue) =>
                                handleRotatingRuleChange(
                                  index,
                                  "payee",
                                  newValue
                                )
                              }
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label="Payee(s)"
                                  variant="outlined"
                                  size="small"
                                />
                              )}
                              renderTags={(value, getTagProps) => {
                                if (!Array.isArray(value)) {
                                  return null;
                                }
                                return value.map((option, tagIndex) => (
                                  <Chip
                                    variant="outlined"
                                    label={
                                      typeof option === "string"
                                        ? option
                                        : option.name
                                    }
                                    size="small"
                                    {...getTagProps({ index: tagIndex })}
                                  />
                                ));
                              }}
                              sx={{ width: "100%" }}
                            />
                          </Box>
                          <Box
                            sx={{
                              flexBasis: { xs: "100%", sm: "180px" },
                              flexGrow: 1,
                            }}
                          >
                            <Autocomplete
                              multiple
                              size="small"
                              options={paymentMethods}
                              value={rule.paymentMethod || []}
                              getOptionLabel={(option) => option.name || ""}
                              isOptionEqualToValue={(option, value) =>
                                option.id === value.id
                              }
                              onChange={(event, newValue) =>
                                handleRotatingRuleChange(
                                  index,
                                  "paymentMethod",
                                  newValue
                                )
                              }
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label="Payment Method"
                                  variant="outlined"
                                  size="small"
                                />
                              )}
                              renderTags={(value, getTagProps) => {
                                if (!Array.isArray(value)) {
                                  return null;
                                }
                                return value.map((option, tagIndex) => (
                                  <Chip
                                    variant="outlined"
                                    label={option.name || ""}
                                    size="small"
                                    {...getTagProps({ index: tagIndex })}
                                  />
                                ));
                              }}
                              sx={{ width: "100%" }}
                            />
                          </Box>
                          <TextField
                            label="Rate (%)"
                            type="number"
                            size="small"
                            value={rule.rate}
                            onChange={(e) =>
                              handleRotatingRuleChange(
                                index,
                                "rate",
                                e.target.value
                              )
                            }
                            sx={{ width: "90px" }}
                            inputProps={{ step: "0.01", min: "0" }}
                          />
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={rule.isRotating ?? true}
                                onChange={(e) =>
                                  handleRotatingRuleChange(
                                    index,
                                    "isRotating",
                                    e.target.checked
                                  )
                                }
                                size="small"
                              />
                            }
                            label="Rotating?"
                            sx={{ flexBasis: "auto", mr: 1 }}
                          />
                          {(rule.isRotating ?? true) && (
                            <FormControl
                              size="small"
                              sx={{ flexBasis: "130px", flexGrow: 1 }}
                            >
                              <InputLabel
                                id={`applicable-period-label-${index}`}
                                size="small"
                              >
                                Month/Quarter
                              </InputLabel>
                              <Select
                                labelId={`applicable-period-label-${index}`}
                                value={
                                  rule.applicablePeriod ||
                                  (rotatingPeriod === "Monthly" ? 1 : "Q1")
                                }
                                label="Month/Quarter"
                                onChange={(e) =>
                                  handleRotatingRuleChange(
                                    index,
                                    "applicablePeriod",
                                    e.target.value
                                  )
                                }
                                size="small"
                              >
                                {rotatingPeriod === "Monthly"
                                  ? Array.from(
                                      { length: 12 },
                                      (_, i) => i + 1
                                    ).map((month) => (
                                      <MenuItem key={month} value={month}>
                                        {new Date(0, month - 1).toLocaleString(
                                          "default",
                                          { month: "long" }
                                        )}
                                      </MenuItem>
                                    ))
                                  : ["Q1", "Q2", "Q3", "Q4"].map((quarter) => (
                                      <MenuItem key={quarter} value={quarter}>
                                        {quarter}
                                      </MenuItem>
                                    ))}
                              </Select>
                            </FormControl>
                          )}
                          <IconButton
                            onClick={() => removeRotatingRule(index)}
                            color="error"
                            size="small"
                            disabled={rotatingRules.length <= 1}
                            sx={{ ml: "auto" }}
                          >
                            <RemoveCircleOutlineIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      ))}
                      <Button
                        startIcon={<AddCircleOutlineIcon />}
                        onClick={addRotatingRule}
                        size="small"
                      >
                        Add Rotating Rule
                      </Button>
                    </Box>
                  )}
                  {rewardType === "Dynamic" && (
                    <Box>
                      <Typography variant="subtitle2" gutterBottom>
                        Dynamic Reward Configuration
                      </Typography>
                      <FormControl fullWidth margin="dense" sx={{ mb: 2 }}>
                        <InputLabel id="dynamic-period-label" size="small">
                          Activation Period
                        </InputLabel>
                        <Select
                          labelId="dynamic-period-label"
                          id="dynamic-period"
                          value={dynamicPeriod}
                          label="Activation Period"
                          onChange={(e) => setDynamicPeriod(e.target.value)}
                          size="small"
                        >
                          <MenuItem value="Monthly">Monthly</MenuItem>
                          <MenuItem value="Quarterly">Quarterly</MenuItem>
                        </Select>
                      </FormControl>

                      <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>
                        Tiers
                      </Typography>
                      {dynamicTiers.map((tier, tierIndex) => (
                        <Box
                          key={`dynamic-tier-${tierIndex}`}
                          sx={{
                            mb: 2,
                            p: 2,
                            border: "1px solid",
                            borderColor: "divider",
                            borderRadius: 1,
                            position: "relative",
                          }}
                        >
                          <IconButton
                            onClick={() => removeDynamicTier(tierIndex)}
                            color="error"
                            size="small"
                            disabled={dynamicTiers.length <= 1}
                            sx={{ position: "absolute", top: 8, right: 8 }}
                          >
                            <RemoveCircleOutlineIcon fontSize="small" />
                          </IconButton>

                          <Typography
                            variant="body1"
                            fontWeight="bold"
                            gutterBottom
                          >
                            Tier {tierIndex + 1}
                          </Typography>
                          <Grid container spacing={1} sx={{ mt: 1, mb: 1 }}>
                            <Grid item xs={12} sm={6} md={4}>
                              <TextField
                                label="Tier Name"
                                variant="outlined"
                                size="small"
                                fullWidth
                                value={tier.tierName || `Tier ${tierIndex + 1}`}
                                onChange={(e) =>
                                  handleDynamicTierChange(
                                    tierIndex,
                                    "tierName",
                                    e.target.value
                                  )
                                }
                              />
                            </Grid>
                            <Grid item xs={6} sm={3} md={2}>
                              <TextField
                                label="Rate (%)"
                                variant="outlined"
                                size="small"
                                fullWidth
                                type="number"
                                value={tier.tierRate}
                                onChange={(e) =>
                                  handleDynamicTierChange(
                                    tierIndex,
                                    "tierRate",
                                    e.target.value
                                  )
                                }
                                inputProps={{ step: "0.01", min: "0" }}
                              />
                            </Grid>
                            <Grid item xs={6} sm={3} md={2}>
                              <TextField
                                label="Max Active"
                                variant="outlined"
                                size="small"
                                fullWidth
                                type="number"
                                value={tier.maxActiveRules}
                                onChange={(e) =>
                                  handleDynamicTierChange(
                                    tierIndex,
                                    "maxActiveRules",
                                    e.target.value
                                  )
                                }
                                inputProps={{ min: 1, step: 1 }}
                              />
                            </Grid>
                          </Grid>

                          <Typography variant="body2" sx={{ mt: 2, mb: 1 }}>
                            Eligible Rules for Tier {tierIndex + 1}
                          </Typography>
                          {(tier.eligibleRules || []).map((rule, ruleIndex) => (
                            <Box
                              key={`eligible-${tierIndex}-${ruleIndex}`}
                              sx={{
                                display: "flex",
                                flexWrap: "wrap",
                                alignItems: "center",
                                gap: 1.5,
                                mb: 1.5,
                                p: 1.5,
                                border: "1px dashed",
                                borderColor: "grey.400",
                                borderRadius: 1,
                              }}
                            >
                              <Box
                                sx={{
                                  flexBasis: { xs: "100%", sm: "180px" },
                                  flexGrow: 1,
                                }}
                              >
                                <Autocomplete
                                  multiple
                                  size="small"
                                  options={categories}
                                  value={rule.category || []}
                                  onChange={(e, nv) =>
                                    handleEligibleRuleChange(
                                      tierIndex,
                                      ruleIndex,
                                      "category",
                                      nv
                                    )
                                  }
                                  renderInput={(params) => (
                                    <TextField
                                      {...params}
                                      label="Category"
                                      variant="outlined"
                                      size="small"
                                    />
                                  )}
                                  renderTags={(v, gp) => {
                                    if (!Array.isArray(v)) {
                                      return null;
                                    }
                                    return v.map((o, i) => (
                                      <Chip
                                        variant="outlined"
                                        label={o}
                                        size="small"
                                        {...gp({ index: i })}
                                      />
                                    ));
                                  }}
                                  sx={{ width: "100%" }}
                                />
                              </Box>
                              <Box
                                sx={{
                                  flexBasis: { xs: "100%", sm: "180px" },
                                  flexGrow: 1,
                                }}
                              >
                                <Autocomplete
                                  multiple
                                  size="small"
                                  options={rewardsPayees}
                                  value={rule.payee || []}
                                  getOptionLabel={(o) =>
                                    typeof o === "string" ? o : o?.name || ""
                                  }
                                  onChange={(e, nv) =>
                                    handleEligibleRuleChange(
                                      tierIndex,
                                      ruleIndex,
                                      "payee",
                                      nv
                                    )
                                  }
                                  renderInput={(params) => (
                                    <TextField
                                      {...params}
                                      label="Payee(s)"
                                      variant="outlined"
                                      size="small"
                                    />
                                  )}
                                  renderTags={(v, gp) => {
                                    if (!Array.isArray(v)) {
                                      return null;
                                    }
                                    return v.map((o, i) => (
                                      <Chip
                                        variant="outlined"
                                        label={
                                          typeof o === "string" ? o : o.name
                                        }
                                        size="small"
                                        {...gp({ index: i })}
                                      />
                                    ));
                                  }}
                                  sx={{ width: "100%" }}
                                />
                              </Box>
                              <Box
                                sx={{
                                  flexBasis: { xs: "100%", sm: "180px" },
                                  flexGrow: 1,
                                }}
                              >
                                <Autocomplete
                                  multiple
                                  size="small"
                                  options={paymentMethods}
                                  value={rule.paymentMethod || []}
                                  getOptionLabel={(option) => option.name || ""}
                                  isOptionEqualToValue={(option, value) =>
                                    option.id === value.id
                                  }
                                  onChange={(event, newValue) =>
                                    handleEligibleRuleChange(
                                      tierIndex,
                                      ruleIndex,
                                      "paymentMethod",
                                      newValue
                                    )
                                  }
                                  renderInput={(params) => (
                                    <TextField
                                      {...params}
                                      label="Payment Method"
                                      variant="outlined"
                                      size="small"
                                    />
                                  )}
                                  renderTags={(value, getTagProps) => {
                                    if (!Array.isArray(value)) {
                                      return null;
                                    }
                                    return value.map((option, tagIndex) => (
                                      <Chip
                                        variant="outlined"
                                        label={option.name || ""}
                                        size="small"
                                        {...getTagProps({ index: tagIndex })}
                                      />
                                    ));
                                  }}
                                  sx={{ width: "100%" }}
                                />
                              </Box>
                              <TextField
                                label="Rank"
                                type="number"
                                size="small"
                                value={rule.rank}
                                onChange={(e) =>
                                  handleEligibleRuleChange(
                                    tierIndex,
                                    ruleIndex,
                                    "rank",
                                    e.target.value
                                  )
                                }
                                sx={{ width: "80px" }}
                                inputProps={{ min: 1, step: 1 }}
                              />
                              <IconButton
                                onClick={() =>
                                  removeEligibleRule(tierIndex, ruleIndex)
                                }
                                color="error"
                                size="small"
                                disabled={
                                  (tier.eligibleRules || []).length <= 1
                                }
                                sx={{ ml: "auto" }}
                              >
                                <RemoveCircleOutlineIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          ))}
                          <Button
                            startIcon={<AddCircleOutlineIcon />}
                            onClick={() => addEligibleRule(tierIndex)}
                            size="small"
                          >
                            Add Eligible Rule
                          </Button>
                        </Box>
                      ))}
                      <Button
                        startIcon={<AddCircleOutlineIcon />}
                        onClick={addDynamicTier}
                        size="small"
                      >
                        Add Dynamic Tier
                      </Button>
                    </Box>
                  )}
                </Box>
              </Grid>
            </Grid>
          )}
        </Box>

        <Box
          sx={{
            mt: 3,
            display: "flex",
            justifyContent: "flex-end",
            pt: 2,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Button onClick={handleClose} sx={{ mr: 1 }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSave} disabled={loading}>
            {loading ? <CircularProgress size={24} color="inherit" /> : "Save"}
          </Button>
        </Box>
      </Box>
    </Modal>
  );
}

EditCreditCardDetailsModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  cardToEdit: PropTypes.object,
  onUpdate: PropTypes.func.isRequired,
  banks: PropTypes.array,
  paymentMethods: PropTypes.array,
  categories: PropTypes.array,
  payees: PropTypes.array,
  rewardsPayees: PropTypes.array,
  pointsPrograms: PropTypes.array,
};

EditCreditCardDetailsModal.defaultProps = {
  pointsPrograms: [],
};

export default EditCreditCardDetailsModal;
