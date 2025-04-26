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
  const numericValue = isMilliunits ? value / 1000.0 : value;
  // Use minimumFractionDigits: 0 for whole dollars if desired, but keep 2 for cents
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

      // Sum asset values - Restore calculation
      const totalAssets = assets.reduce((sum, asset) => {
        // Check if asset is a valid object and has a 'value' property
        if (
          !asset ||
          typeof asset !== "object" ||
          typeof asset.value === "undefined"
        ) {
          console.warn("Skipping invalid asset item:", asset); // Log problematic item
          return sum;
        }
        const value = parseFloat(asset.value);
        return sum + (isNaN(value) ? 0 : value);
      }, 0);

      // Sum liability values - Restore calculation
      const totalLiabilities = liabilities.reduce((sum, liability) => {
        // Check if liability is a valid object and has a 'value' property
        if (
          !liability ||
          typeof liability !== "object" ||
          typeof liability.value === "undefined"
        ) {
          console.warn("Skipping invalid liability item:", liability); // Log problematic item
          return sum;
        }
        // Assume liability.value is in milliunits and convert to dollars
        const valueInMilliunits = parseFloat(liability.value);
        if (isNaN(valueInMilliunits)) return sum;
        const valueInDollars = valueInMilliunits / 1000.0;
        return sum + Math.abs(valueInDollars);
      }, 0);

      // Net worth calculation - Restore calculation
      const netWorth = totalAssets - totalLiabilities;

      // --- Try setting state ---
      try {
        setSummaryData({
          // Re-enable with default values
          totalAssets,
          totalLiabilities,
          netWorth,
        });

        // Process asset breakdown - Restore calculation & state update

        const assetsByType = assets.reduce((acc, asset) => {
          if (!asset) return acc;
          const type = asset.type || "Unknown";
          const value = parseFloat(asset.value);
          if (isNaN(value)) return acc;

          acc[type] = (acc[type] || 0) + value;
          return acc;
        }, {});

        // Convert to array format for chart - Added check
        let assetBreakdownData = [];
        if (assetsByType && typeof assetsByType === "object") {
          assetBreakdownData = Object.entries(assetsByType).map(
            ([type, value]) => ({
              name: type,
              value: value,
            })
          );
        }
        setAssetBreakdown(assetBreakdownData);

        // Process liability breakdown - Restore calculation & state update

        const liabilitiesByType = liabilities.reduce((acc, liability) => {
          if (!liability) return acc;
          const type = liability.type || liability.liability_type || "Unknown";
          // Assume value is in milliunits, convert to dollars
          const valueInMilliunits = parseFloat(liability.value);
          if (isNaN(valueInMilliunits)) return acc;
          const valueInDollars = valueInMilliunits / 1000.0;

          acc[type] = (acc[type] || 0) + Math.abs(valueInDollars);
          return acc;
        }, {});

        // Convert to array format for chart - Added check
        let liabilityBreakdownData = [];
        if (liabilitiesByType && typeof liabilitiesByType === "object") {
          liabilityBreakdownData = Object.entries(liabilitiesByType).map(
            ([type, value]) => ({
              name: type,
              value: value,
            })
          );
        }
        setLiabilityBreakdown(liabilityBreakdownData);

        // Get top accounts - Restore state setting
        // We also comment out the state setting for now.
        let processedAccounts = [];
        if (Array.isArray(accounts)) {
          // Ensure accounts is an array before processing
          processedAccounts = accounts
            .filter((account) => account && typeof account === "object")
            .map((account) => {
              const balanceRaw = account.balance;
              // Ensure balance is a number, store raw value (assumed milliunits)
              const balanceNum =
                typeof balanceRaw === "number" ? balanceRaw : 0;
              return {
                id: account.id || `temp-${Date.now()}-${Math.random()}`,
                name: account.name || "Unnamed Account",
                balance: isNaN(balanceNum) ? 0 : balanceNum, // Ensure balance is a valid number, default to 0 if NaN
                account_type: account.account_type || account.type || "Unknown",
              };
            })
            .sort((a, b) => {
              // Defensive sort: ensure balances are numbers before comparing
              const balanceA =
                typeof a.balance === "number" ? Math.abs(a.balance) : 0;
              const balanceB =
                typeof b.balance === "number" ? Math.abs(b.balance) : 0;
              return balanceB - balanceA;
            }) // Sort by absolute balance
            .slice(0, 5); // Top 5 accounts
        }
        setTopAccounts(processedAccounts); // Restore state update

        console.log("State updated with summary, asset & liability breakdown."); // Update log message
      } catch (stateUpdateError) {
        console.error("Error occurred during state updates:", stateUpdateError);
        // Re-throw or set error state appropriately
        throw stateUpdateError; // Re-throw to be caught by the outer catch block
      }
      // --- End state setting block ---
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
                  color={
                    summaryData.netWorth >= 0 ? "success.main" : "error.main"
                  }
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
                            secondary={formatCurrency(account.balance, true)}
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
