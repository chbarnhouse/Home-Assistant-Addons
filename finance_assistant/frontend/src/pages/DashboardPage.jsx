import React, { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import { useSnackbar } from "../context/SnackbarContext";
import { fetchAllData } from "../utils/api"; // Import the API utility function
import RewardsOptimizer from "../components/RewardsOptimizer"; // <-- Import the new component

// Helper to format currency (consider moving to a utils file)
const formatCurrency = (value, isMilliunits = false) => {
  if (value == null || isNaN(value)) return "$0.00";
  // This formatter now expects DOLLARS. Calculations happen before calling this.
  const numericValue = value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(numericValue);
};

// Helper to format liability type name (e.g., creditCard -> Credit Card)
const formatLiabilityTypeName = (typeName) => {
  if (!typeName) return "Uncategorized";
  // Split by uppercase letters and join with space
  return typeName
    .replace(/([A-Z])/g, " $1") // Add space before caps
    .replace(/^./, (str) => str.toUpperCase()); // Capitalize first letter
};

function DashboardPage() {
  const [summaryData, setSummaryData] = useState({
    totalAssets: 0,
    totalLiabilities: 0,
    netWorth: 0,
  });
  const [assetBreakdown, setAssetBreakdown] = useState([]); // State for breakdown by type
  const [liabilityBreakdown, setLiabilityBreakdown] = useState([]); // State for liability breakdown
  const [topAccounts, setTopAccounts] = useState([]); // State for top accounts
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const { notify } = useSnackbar();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAllData();
      console.log("Fetched all_data for Dashboard:", data);

      // IMPORTANT: Add defensive checks to ensure data exists and has expected shape
      if (!data || typeof data !== "object") {
        throw new Error("Invalid data format received from API");
      }

      // Calculate summaries with defensive coding
      const assets = Array.isArray(data.assets) ? data.assets : [];
      const liabilities = Array.isArray(data.liabilities)
        ? data.liabilities
        : [];
      const accounts = Array.isArray(data.accounts) ? data.accounts : [];
      // Get type maps for lookups
      const assetTypes = Array.isArray(data.asset_types)
        ? data.asset_types
        : [];
      const liabilityTypes = Array.isArray(data.liability_types)
        ? data.liability_types
        : [];

      // --- Calculate summaries --- //

      let totalAssets = 0;
      const assetsByType = {};
      assets.forEach((asset) => {
        if (!asset || typeof asset !== "object") return;
        let valueInDollars = 0;
        if (asset.is_ynab && typeof asset.balance === "number") {
          valueInDollars = asset.balance / 1000.0;
        } else if (!asset.is_ynab) {
          // Handle potential manual fields (assuming dollars)
          if (typeof asset.balance === "number") valueInDollars = asset.balance;
          else if (typeof asset.value === "number")
            valueInDollars = asset.value;
          else if (typeof asset.current_value === "number")
            valueInDollars = asset.current_value;
        }
        if (isNaN(valueInDollars)) valueInDollars = 0;
        totalAssets += valueInDollars;

        // For breakdown:
        const typeObj = assetTypes.find((t) => t && t.id === asset.type_id);
        const typeName = typeObj ? typeObj.name : asset.type || "Unknown";
        assetsByType[typeName] = (assetsByType[typeName] || 0) + valueInDollars;
      });

      let totalLiabilities = 0;
      const liabilitiesByType = {};
      liabilities.forEach((liability) => {
        if (!liability || typeof liability !== "object") return;
        let valueInDollars = 0;
        if (liability.is_ynab && typeof liability.balance === "number") {
          valueInDollars = liability.balance / 1000.0;
        } else if (!liability.is_ynab) {
          // Handle potential manual fields (assuming dollars)
          if (typeof liability.balance === "number")
            valueInDollars = liability.balance;
          else if (typeof liability.value === "number")
            valueInDollars = liability.value;
          else if (typeof liability.current_value === "number")
            valueInDollars = liability.current_value;
        }
        if (isNaN(valueInDollars)) valueInDollars = 0;
        // Liabilities are negative, sum their absolute value
        totalLiabilities += Math.abs(valueInDollars);

        // For breakdown:
        const typeObj = liabilityTypes.find(
          (t) => t && t.id === liability.type_id
        );
        const typeName = typeObj ? typeObj.name : liability.type || "Unknown";
        // Use absolute value for breakdown chart
        liabilitiesByType[typeName] =
          (liabilitiesByType[typeName] || 0) + Math.abs(valueInDollars);
      });

      const netWorth = totalAssets - totalLiabilities;

      // --- State Updates --- //
      try {
        setSummaryData({ totalAssets, totalLiabilities, netWorth });

        // Convert breakdown objects to array format for charts
        const assetBreakdownData = Object.entries(assetsByType).map(
          ([name, value]) => ({ name, value })
        );
        setAssetBreakdown(assetBreakdownData);

        const liabilityBreakdownData = Object.entries(liabilitiesByType).map(
          ([name, value]) => ({ name, value })
        );
        setLiabilityBreakdown(liabilityBreakdownData);

        // Process top accounts
        let processedAccounts = [];
        if (Array.isArray(accounts)) {
          processedAccounts = accounts
            .filter(
              (account) =>
                account &&
                typeof account === "object" &&
                typeof account.balance === "number"
            )
            .map((account) => ({
              id: account.id || `temp-${Date.now()}-${Math.random()}`,
              name: account.name || "Unnamed Account",
              // Convert balance to dollars here for sorting and display
              balance: account.balance / 1000.0,
              account_type: account.account_type || account.type || "Unknown",
            }))
            // Sort by absolute dollar balance
            .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
            .slice(0, 5); // Top 5 accounts
        }
        setTopAccounts(processedAccounts); // Update state

        console.log("Dashboard state updated successfully.");
      } catch (stateUpdateError) {
        console.error(
          "Error occurred during dashboard state updates:",
          stateUpdateError
        );
        throw stateUpdateError; // Re-throw to be caught by the outer catch block
      }
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
      setError(
        err.message || "Failed to fetch dashboard data. Please try again."
      );
      notify("Failed to load dashboard data.", "error");
      // Reset summary data on error?
      setSummaryData({ totalAssets: 0, totalLiabilities: 0, netWorth: 0 });
      setAssetBreakdown([]);
      setLiabilityBreakdown([]);
      setTopAccounts([]);
    } finally {
      setIsLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", my: 5 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ my: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {!isLoading && !error && (
        <Grid container spacing={3}>
          {/* Total Assets Card - Restored with Logging */}
          <Grid item xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Typography
                  sx={{ fontSize: 14 }}
                  color="text.secondary"
                  gutterBottom
                >
                  Total Assets
                </Typography>
                <Typography variant="h5" component="div">
                  {formatCurrency(summaryData.totalAssets)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Total Liabilities Card */}
          <Grid item xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Typography
                  sx={{ fontSize: 14 }}
                  color="text.secondary"
                  gutterBottom
                >
                  Total Liabilities
                </Typography>
                <Typography variant="h5" component="div">
                  {formatCurrency(summaryData.totalLiabilities)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Net Worth Card */}
          <Grid item xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Typography
                  sx={{ fontSize: 14 }}
                  color="text.secondary"
                  gutterBottom
                >
                  Net Worth
                </Typography>
                <Typography
                  variant="h5"
                  component="div"
                  color={summaryData.netWorth < 0 ? "error" : "success.main"}
                >
                  {formatCurrency(summaryData.netWorth)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Asset Breakdown Card */}
          <Grid item xs={12} md={4}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Assets by Type
                </Typography>
                {assetBreakdown.length > 0 ? (
                  <List dense disablePadding>
                    {assetBreakdown.map((item, index) => (
                      <React.Fragment key={`${item.name}-${index}`}>
                        <ListItem sx={{ py: 0.5 }}>
                          <ListItemText
                            primary={item.name}
                            secondary={formatCurrency(item.value)}
                            primaryTypographyProps={{
                              variant: "body2",
                              noWrap: true,
                            }}
                            secondaryTypographyProps={{
                              align: "right",
                              variant: "body2",
                              fontWeight: "medium",
                            }}
                          />
                        </ListItem>
                        {index < assetBreakdown.length - 1 && (
                          <Divider component="li" variant="inset" light />
                        )}
                      </React.Fragment>
                    ))}
                  </List>
                ) : (
                  <Typography color="text.secondary" sx={{ mt: 1 }}>
                    No asset data available for breakdown.
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Liability Breakdown Card */}
          <Grid item xs={12} md={4}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Liabilities by Type
                </Typography>
                {liabilityBreakdown.length > 0 ? (
                  <List dense disablePadding>
                    {liabilityBreakdown.map((item, index) => (
                      <React.Fragment key={`${item.name}-${index}`}>
                        <ListItem sx={{ py: 0.5 }}>
                          <ListItemText
                            primary={formatLiabilityTypeName(item.name)}
                            secondary={formatCurrency(item.value)}
                            primaryTypographyProps={{
                              variant: "body2",
                              noWrap: true,
                            }}
                            secondaryTypographyProps={{
                              align: "right",
                              variant: "body2",
                              fontWeight: "medium",
                            }}
                          />
                        </ListItem>
                        {index < liabilityBreakdown.length - 1 && (
                          <Divider component="li" variant="inset" light />
                        )}
                      </React.Fragment>
                    ))}
                  </List>
                ) : (
                  <Typography color="text.secondary" sx={{ mt: 1 }}>
                    No liability data available for breakdown.
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Top Account Balances Card - Restore Rendering */}
          <Grid item xs={12} md={4}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Top Account Balances
                </Typography>
                {topAccounts.length > 0 ? (
                  <List dense disablePadding>
                    {topAccounts.map((account, index) => (
                      <React.Fragment key={account.id}>
                        <ListItem sx={{ py: 0.5 }}>
                          <ListItemText
                            primary={account.name}
                            secondary={formatCurrency(account.balance)}
                            primaryTypographyProps={{
                              variant: "body2",
                              noWrap: true,
                            }}
                            secondaryTypographyProps={{
                              align: "right",
                              variant: "body2",
                              fontWeight: "medium",
                            }}
                          />
                        </ListItem>
                        {index < topAccounts.length - 1 && (
                          <Divider component="li" variant="inset" light />
                        )}
                      </React.Fragment>
                    ))}
                  </List>
                ) : (
                  <Typography color="text.secondary" sx={{ mt: 1 }}>
                    No account data available.
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Rewards Optimizer Card - Restore Rendering */}
          <Grid item xs={12}>
            <RewardsOptimizer />
          </Grid>

          {/* Add more dashboard widgets/cards here later */}
        </Grid>
      )}
    </Box>
  );
}

export default DashboardPage;
