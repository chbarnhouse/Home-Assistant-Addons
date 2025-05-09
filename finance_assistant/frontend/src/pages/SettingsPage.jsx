import React, { useState, useEffect, useCallback } from "react";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Grid from "@mui/material/Grid";
import { useThemeContext } from "../context/ThemeContext";
import { useSnackbar } from "../context/SnackbarContext";
import {
  TextField,
  Button,
  Paper,
  FormControlLabel,
  Switch,
} from "@mui/material";
import { callApi } from "../utils/api";

import ManageBanksSection from "../components/ManageBanksSection";
import ManageAccountTypesSection from "../components/ManageAccountTypesSection";
import ManagePaymentMethodsSection from "../components/ManagePaymentMethodsSection";
import ManageRewardsCategoriesSection from "../components/ManageRewardsCategoriesSection";
import ManageRewardsPayeesSection from "../components/ManageRewardsPayeesSection";
import ManagePointsProgramsSection from "../components/ManagePointsProgramsSection";
import ManageLiabilityTypesSection from "../components/ManageLiabilityTypesSection";
import ManageAssetTypesSection from "../components/ManageAssetTypesSection";

function SettingsPage() {
  const { mode, setMode } = useThemeContext();
  const { notify } = useSnackbar();

  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState(null);

  const [banks, setBanks] = useState([]);
  const [accountTypes, setAccountTypes] = useState([]);
  const [liabilityTypes, setLiabilityTypes] = useState([]);
  const [assetTypes, setAssetTypes] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [rewardsCategories, setRewardsCategories] = useState([]);
  const [rewardsPayees, setRewardsPayees] = useState([]);
  const [pointsPrograms, setPointsPrograms] = useState([]);
  const [config, setConfig] = useState({
    ynab_api_key: "",
    ynab_budget_id: "",
    use_calculated_asset_value: false,
    include_ynab_emoji: false,
  });
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      setPageError(null);
      setStatusMessage("Loading configuration and data...");
      setErrorMessage("");
      try {
        const [
          configResponse,
          banksResponse,
          accountTypesResponse,
          paymentMethodsResponse,
          rewardsCategoriesResponse,
          rewardsPayeesResponse,
          pointsProgramsResponse,
          assetTypesResponse,
          liabilityTypesResponse,
        ] = await Promise.all([
          callApi("/config", "GET"),
          callApi("banks", "GET"),
          callApi("account_types", "GET"),
          callApi("payment_methods", "GET"),
          callApi("rewards_categories", "GET"),
          callApi("rewards_payees", "GET"),
          callApi("points_programs", "GET"),
          callApi("asset_types", "GET"),
          callApi("liability_types", "GET"),
        ]);

        if (configResponse) {
          setConfig({
            ynab_api_key: configResponse.ynab_api_key || "",
            ynab_budget_id: configResponse.ynab_budget_id || "",
            use_calculated_asset_value:
              configResponse.use_calculated_asset_value === true,
            include_ynab_emoji: configResponse.include_ynab_emoji === true,
          });
          console.log("Successfully fetched and set config:", configResponse);
        } else {
          setPageError("Failed to retrieve valid configuration data.");
          notify("Failed to load configuration data.", "warning");
          console.error(
            "Config API call returned no data or failed.",
            configResponse
          );
        }

        setBanks(banksResponse || []);
        setAccountTypes(accountTypesResponse || []);
        setLiabilityTypes(liabilityTypesResponse || []);
        setAssetTypes(assetTypesResponse || []);
        setPaymentMethods(paymentMethodsResponse || []);
        setRewardsCategories(rewardsCategoriesResponse || []);
        setRewardsPayees(rewardsPayeesResponse || []);
        setPointsPrograms(pointsProgramsResponse || []);

        setStatusMessage("Configuration and data loaded.");
      } catch (err) {
        console.error("Initial data fetch error:", err);
        const errorMsg =
          err.response?.data?.error ||
          err.message ||
          "Failed to load initial data.";
        setPageError(errorMsg);
        notify("Failed to load initial data.", "error");
        setStatusMessage("");
        setErrorMessage(`Error loading initial data: ${errorMsg}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, [notify]);

  const handleDataChanged = useCallback(async () => {
    setIsLoading(true);
    setPageError(null);
    try {
      const [
        banksResponse,
        accountTypesResponse,
        paymentMethodsResponse,
        rewardsCategoriesResponse,
        rewardsPayeesResponse,
        pointsProgramsResponse,
        assetTypesResponse,
        liabilityTypesResponse,
      ] = await Promise.all([
        callApi("banks", "GET"),
        callApi("account_types", "GET"),
        callApi("payment_methods", "GET"),
        callApi("rewards_categories", "GET"),
        callApi("rewards_payees", "GET"),
        callApi("points_programs", "GET"),
        callApi("asset_types", "GET"),
        callApi("liability_types", "GET"),
      ]);
      setBanks(banksResponse || []);
      setAccountTypes(accountTypesResponse || []);
      setLiabilityTypes(liabilityTypesResponse || []);
      setAssetTypes(assetTypesResponse || []);
      setPaymentMethods(paymentMethodsResponse || []);
      setRewardsCategories(rewardsCategoriesResponse || []);
      setRewardsPayees(rewardsPayeesResponse || []);
      setPointsPrograms(pointsProgramsResponse || []);
      notify("Refreshed management data.", "success");
    } catch (err) {
      console.error("Error reloading management data:", err);
      const errorMsg =
        err.response?.data?.error ||
        err.message ||
        "Failed to reload management data.";
      setPageError(errorMsg);
      notify("Failed to reload management data.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [notify]);

  const handleThemeChange = (event) => {
    const newPreference = event.target.value;
    console.log(`Changing theme preference to: ${newPreference}`);
    setMode(newPreference);
  };

  const handleUpdateBanks = (updatedBanks) => setBanks(updatedBanks);
  const handleUpdateAccountTypes = (updatedTypes) =>
    setAccountTypes(updatedTypes);
  const handleUpdateLiabilityTypes = (updatedTypes) =>
    setLiabilityTypes(updatedTypes);
  const handleUpdateAssetTypes = (updatedTypes) => setAssetTypes(updatedTypes);
  const handleUpdatePaymentMethods = (updatedMethods) =>
    setPaymentMethods(updatedMethods);
  const handleUpdatePointsPrograms = (updatedPrograms) =>
    setPointsPrograms(updatedPrograms);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setConfig((prevConfig) => ({
      ...prevConfig,
      [name]: value,
    }));
  };

  const handleSwitchChange = (event) => {
    const { name, checked } = event.target;
    console.log(`handleSwitchChange: name=${name}, checked=${checked}`);
    setConfig((prevConfig) => {
      console.log("handleSwitchChange: Updating local state BEFORE save call.");
      return {
        ...prevConfig,
        [name]: checked,
      };
    });
    handleSaveSetting(name, checked);
  };

  const handleSaveSetting = async (settingKey, settingValue) => {
    console.log(
      `handleSaveSetting: Attempting to save ${settingKey}=${settingValue}`
    );
    setStatusMessage("Saving setting...");
    setErrorMessage("");
    try {
      const payload = { [settingKey]: settingValue };
      const response = await callApi("/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      console.log("handleSaveSetting: API call successful", response);
      setStatusMessage("Setting saved successfully.");
      setTimeout(() => setStatusMessage(""), 3000);
    } catch (err) {
      console.error("Setting save error:", err);
      console.error(
        "handleSaveSetting: API call failed. Error response:",
        err.response
      );
      const errorMsg =
        err.response?.data?.error || err.message || "Failed to save setting.";
      setErrorMessage(`Error saving setting ${settingKey}: ${errorMsg}`);
      setStatusMessage("");
      setConfig((prevConfig) => {
        console.log(
          `handleSaveSetting: Reverting state for ${settingKey} due to error.`
        );
        return {
          ...prevConfig,
          [settingKey]: !settingValue,
        };
      });
      notify(`Failed to save setting: ${settingKey}`, "error");
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Settings
      </Typography>

      {isLoading && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            py: 5,
          }}
        >
          <CircularProgress />
          <Typography sx={{ ml: 2 }}>Loading data...</Typography>
        </Box>
      )}
      {pageError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {pageError}
        </Alert>
      )}

      {!isLoading && !pageError && (
        <>
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Appearance
            </Typography>
            <FormControl fullWidth margin="normal">
              <InputLabel id="theme-select-label">Theme</InputLabel>
              <Select
                labelId="theme-select-label"
                id="theme-select"
                value={mode}
                label="Theme"
                onChange={handleThemeChange}
              >
                <MenuItem value="light">Light</MenuItem>
                <MenuItem value="dark">Dark</MenuItem>
                <MenuItem value="system">System</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
            Manage Data
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6} lg={4}>
              <ManageBanksSection banks={banks} onUpdate={handleUpdateBanks} />
            </Grid>
            <Grid item xs={12} md={6} lg={4}>
              <ManageAccountTypesSection
                accountTypes={accountTypes}
                onUpdate={handleUpdateAccountTypes}
              />
            </Grid>
            <Grid item xs={12} md={6} lg={4}>
              <ManageLiabilityTypesSection
                liabilityTypes={liabilityTypes}
                onUpdate={handleUpdateLiabilityTypes}
              />
            </Grid>
            <Grid item xs={12} md={6} lg={4}>
              <ManageAssetTypesSection
                assetTypes={assetTypes}
                onUpdate={handleUpdateAssetTypes}
              />
            </Grid>
            <Grid item xs={12} md={6} lg={4}>
              <ManagePaymentMethodsSection
                paymentMethods={paymentMethods}
                onUpdate={handleUpdatePaymentMethods}
              />
            </Grid>
            <Grid item xs={12} md={6} lg={4}>
              <ManageRewardsCategoriesSection
                categories={rewardsCategories}
                onUpdate={handleDataChanged}
              />
            </Grid>
            <Grid item xs={12} md={6} lg={4}>
              <ManageRewardsPayeesSection
                payees={rewardsPayees}
                onUpdate={handleDataChanged}
              />
            </Grid>
            <Grid item xs={12} md={6} lg={4}>
              <ManagePointsProgramsSection
                pointsPrograms={pointsPrograms}
                onUpdate={handleUpdatePointsPrograms}
              />
            </Grid>
          </Grid>

          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              YNAB Configuration
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              These settings are read from the addon's configuration
              (options.json). Changes require editing the addon configuration
              and restarting the addon.
            </Typography>
            <TextField
              label="YNAB API Key"
              name="ynab_api_key"
              value={config.ynab_api_key ? "********" : "Not Set"}
              fullWidth
              margin="normal"
              InputProps={{
                readOnly: true,
              }}
              disabled
            />
            <TextField
              label="YNAB Budget ID"
              name="ynab_budget_id"
              value={config.ynab_budget_id || "Not Set"}
              fullWidth
              margin="normal"
              InputProps={{
                readOnly: true,
              }}
              disabled
            />
          </Paper>

          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Home Assistant Integration Settings
            </Typography>

            <FormControlLabel
              control={
                <Switch
                  checked={config.use_calculated_asset_value}
                  onChange={handleSwitchChange}
                  name="use_calculated_asset_value"
                />
              }
              label="Use Calculated Value for Asset Sensors"
              sx={{ mb: 1, display: "block" }}
            />
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              If enabled, Asset sensors in Home Assistant will prioritize the
              value calculated from linked HA entities and shares. If disabled
              (default), sensors will use the value directly reported by YNAB.
              This setting takes effect on the next Home Assistant sensor update
              after saving.
            </Typography>

            <FormControlLabel
              control={
                <Switch
                  checked={config.include_ynab_emoji}
                  onChange={handleSwitchChange}
                  name="include_ynab_emoji"
                />
              }
              label="Include YNAB Emoji in HA Entity Names"
              sx={{ mb: 1, display: "block" }}
            />
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              If enabled, entity names in Home Assistant will include the emoji
              from the YNAB account name (e.g., "💸 Checking"). If disabled, the
              emoji will be removed (e.g., "Checking"). Changes take effect on the
              next Home Assistant sensor update after saving.
            </Typography>

            {statusMessage && (
              <Typography
                variant="caption"
                color="textSecondary"
                sx={{ display: "block", mt: 1 }}
              >
                {statusMessage}
              </Typography>
            )}
            {errorMessage && (
              <Typography
                variant="caption"
                color="error"
                sx={{ display: "block", mt: 1 }}
              >
                {errorMessage}
              </Typography>
            )}
          </Paper>
        </>
      )}
    </Box>
  );
}

export default SettingsPage;
