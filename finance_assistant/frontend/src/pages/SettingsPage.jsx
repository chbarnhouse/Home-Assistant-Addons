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
import { fetchAllData, callApi } from "../utils/api";
import { useSnackbar } from "../context/SnackbarContext";

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

  const [banks, setBanks] = useState([]);
  const [accountTypes, setAccountTypes] = useState([]);
  const [liabilityTypes, setLiabilityTypes] = useState([]);
  const [assetTypes, setAssetTypes] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [rewardsCategories, setRewardsCategories] = useState([]);
  const [rewardsPayees, setRewardsPayees] = useState([]);
  const [pointsPrograms, setPointsPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        banksData,
        accountTypesData,
        paymentMethodsData,
        rewardsCategoriesData,
        rewardsPayeesData,
        pointsProgramsData,
      ] = await Promise.all([
        callApi("banks"),
        callApi("account_types"),
        callApi("payment_methods"),
        callApi("rewards_categories"),
        callApi("rewards_payees"),
        callApi("points_programs"),
      ]);

      setBanks(banksData || []);
      setAccountTypes(accountTypesData || []);
      setLiabilityTypes(
        Array.isArray(accountTypesData.liability_types)
          ? accountTypesData.liability_types
          : []
      );
      setAssetTypes(
        Array.isArray(accountTypesData.asset_types)
          ? accountTypesData.asset_types
          : []
      );
      setPaymentMethods(paymentMethodsData || []);
      setRewardsCategories(rewardsCategoriesData || []);
      setRewardsPayees(rewardsPayeesData || []);
      setPointsPrograms(pointsProgramsData || []);
    } catch (err) {
      console.error("Error loading settings data:", err);
      setError(err.message || "Failed to load settings data.");
      notify("Failed to load settings.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const handleDataChanged = useCallback(() => {
    loadInitialData();
  }, [loadInitialData]);

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

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Settings
      </Typography>

      {loading && (
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
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!loading && !error && (
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
        </>
      )}
    </Box>
  );
}

export default SettingsPage;
