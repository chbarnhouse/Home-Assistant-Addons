import React, { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
// Revert API imports - keep only callApi if needed elsewhere, remove specific functions
// import {
//   callApi,
//   fetchCategories,
//   createCategory,
//   fetchPayees,
//   createPayee,
//   fetchPaymentMethods,
//   createPaymentMethod,
//   fetchCards,
// } from "../utils/api"; // Keep commented out if specific functions aren't defined
import { callApi, fetchAllData } from "../utils/api"; // Import callApi and fetchAllData
import { useSnackbar } from "../context/SnackbarContext";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Divider from "@mui/material/Divider";
import useDebounce from "../hooks/useDebounce"; // Assuming a debounce hook exists or will be created
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";

function RewardsOptimizer() {
  // Input states (value objects or null)
  const [categoryValue, setCategoryValue] = useState(null);
  const [payeeValue, setPayeeValue] = useState(null); // Optional
  const [paymentMethodValue, setPaymentMethodValue] = useState(null); // Optional
  const [amount, setAmount] = useState(""); // Optional, for value calculation

  // Data states
  const [categories, setCategories] = useState([]);
  const [payees, setPayees] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  // Keep card data for placeholder logic
  const [cards, setCards] = useState([]);

  // Combined loading state
  const [isLoading, setIsLoading] = useState(true);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationResults, setOptimizationResults] = useState([]); // Ranked list for current scenario
  const [bestScenarios, setBestScenarios] = useState([]); // Add state for best overall scenarios
  const [error, setError] = useState(null);
  const { notify } = useSnackbar();

  // Debounce the input values
  const debouncedCategory = useDebounce(categoryValue, 500);
  const debouncedPayee = useDebounce(payeeValue, 500);
  const debouncedPaymentMethod = useDebounce(paymentMethodValue, 500);
  const debouncedAmount = useDebounce(amount, 500);

  // --- Data Fetching ---
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Fetch all data first (contains credit cards)
        const allData = await fetchAllData();
        setCards(allData?.credit_cards || []);

        // Fetch categories, payees, payment methods using correct endpoints
        // These endpoints now return arrays of objects {id, name}
        const [
          categoriesData,
          payeesData,
          paymentMethodsData,
          bestScenariosData,
        ] = await Promise.all([
          callApi("rewards_categories").catch((err) => {
            // Returns Array[{id, name}]
            console.error("Failed to fetch rewards categories:", err);
            notify("Could not load categories", "warning");
            return []; // Default to empty array
          }),
          callApi("rewards_payees").catch((err) => {
            // Returns Array[{id, name}]
            console.error("Failed to fetch rewards payees:", err);
            notify("Could not load payees", "warning");
            return []; // Default to empty array
          }),
          callApi("payment_methods").catch((err) => {
            // Returns Array[{id, name}]
            console.error("Failed to fetch payment methods:", err);
            notify("Could not load payment methods", "warning");
            return []; // Default to empty array
          }),
          // Fetch best overall scenarios
          callApi("rewards/best_scenarios").catch((err) => {
            console.error("Failed to fetch best reward scenarios:", err);
            notify("Could not load best reward scenarios", "warning");
            return []; // Default to empty array
          }),
        ]);

        // Log fetched data before setting state
        console.log("[DEBUG] Fetched rewards categories data:", categoriesData);
        console.log("[DEBUG] Fetched rewards payees data:", payeesData);
        console.log(
          "[DEBUG] Fetched payment methods data:",
          paymentMethodsData
        );
        console.log("[DEBUG] Fetched best scenarios data:", bestScenariosData);

        // Set state directly with the arrays of objects
        setCategories(categoriesData || []);
        setPayees(payeesData || []);
        setPaymentMethods(paymentMethodsData || []);
        setBestScenarios(bestScenariosData || []); // Store best scenarios
      } catch (err) {
        console.error(
          "Error fetching initial data for Rewards Optimizer:",
          err
        );
        setError(
          err.message || "Failed to load data needed for rewards optimizer."
        );
        notify("Failed to load optimizer data", "error");
        // Reset states
        setCards([]);
        setCategories([]);
        setPayees([]);
        setPaymentMethods([]);
        setBestScenarios([]); // Reset best scenarios on error
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [notify]); // Add notify as dependency

  // --- Autocomplete Change Handler (Simplified) ---
  const handleAutocompleteChange = (
    event,
    newValue,
    setSelectedValue // State setter function (e.g., setCategoryValue)
  ) => {
    setError(null); // Clear previous errors
    setSelectedValue(newValue); // Simply set the selected value (which is an object or null)
  };

  // --- Optimization Effect (runs when debounced inputs change) ---
  useEffect(() => {
    // Don't run on initial load before data is fetched
    if (isLoading) {
      return;
    }

    const runOptimization = async () => {
      setIsOptimizing(true);
      setError(null); // Clear previous errors on new run
      // No need to clear results immediately, avoids flickering

      // Validate amount if provided
      let amountMilliunits = 0;
      if (debouncedAmount) {
        try {
          const parsedAmount = parseFloat(debouncedAmount);
          if (isNaN(parsedAmount) || parsedAmount < 0) {
            // Allow 0 amount
            throw new Error("Amount must be a non-negative number.");
          }
          amountMilliunits = Math.round(parsedAmount * 1000);
        } catch (err) {
          setError(err.message || "Invalid amount entered.");
          setIsOptimizing(false);
          setOptimizationResults([]); // Clear results on validation error
          setBestScenarios([]); // Clear best scenarios on validation error
          return; // Stop execution
        }
      } else {
        amountMilliunits = 0;
      }

      // Prepare API Payload using debounced values
      const payload = {
        category_id: debouncedCategory?.id || null,
        payee_id: debouncedPayee?.id || null,
        payment_method_id: debouncedPaymentMethod?.id || null,
        amount_milliunits: amountMilliunits,
      };

      console.log("Running debounced optimization request:", payload);

      // Call Backend API
      try {
        const response = await callApi("optimize_rewards", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        console.log("Received debounced optimization results:", response);

        // Validate response structure
        if (
          !response ||
          typeof response !== "object" ||
          !Array.isArray(response.scenario_results) || // Check for scenario_results
          !Array.isArray(response.scenario_suggestions) // Keep this check, backend still sends empty array
        ) {
          throw new Error("Invalid response structure from optimization API.");
        }

        // Store the ranked list for the current scenario
        setOptimizationResults(response.scenario_results); // Store the ranked list
        // setScenarioSuggestions(response.scenario_suggestions || []); // Remove scenario suggestions storage

        // Reset error on success
        setError(null);

        // Notify only if no results were found for the specific scenario
        if (
          response.scenario_results.length === 0
          // && response.scenario_suggestions.length === 0 // Remove suggestion check
        ) {
          notify("No card found offering a bonus for this scenario.", "info");
        }
      } catch (err) {
        console.error("Error calling optimization API (debounced):", err);
        setError(
          err.message || "Failed to optimize rewards. Check backend logs."
        );
        notify("Error optimizing rewards.", "error");
        setOptimizationResults([]); // Clear results on error
        setBestScenarios([]); // Clear best scenarios on error
      } finally {
        setIsOptimizing(false);
      }
    };

    runOptimization();

    // Effect dependencies are the debounced values
  }, [
    debouncedCategory,
    debouncedPayee,
    debouncedPaymentMethod,
    debouncedAmount,
    isLoading,
    notify,
  ]);

  // Helper to format currency
  const formatCurrency = (value) => {
    if (value == null || isNaN(value)) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  // --- Render ---
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Rewards Optimizer
        </Typography>
        {/* Display loading state */}
        {isLoading && !error && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              p: 2,
            }}
          >
            <CircularProgress size={24} sx={{ mr: 1 }} />
            <Typography>Loading data...</Typography>
          </Box>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Only show inputs once data is loaded */}
        {!isLoading && (
          <Grid container spacing={2}>
            {/* Category Autocomplete */}
            <Grid item xs={12} sm={4}>
              {/* Log state right before rendering */}
              {console.log(
                "[DEBUG] Rendering Category Autocomplete with state:",
                categories
              )}
              <Autocomplete
                id="category-select"
                options={categories} // Use the array of strings
                value={categoryValue} // Expecting string or null
                onChange={(event, newValue) => {
                  setCategoryValue(newValue || null); // Set the string value (or null)
                }}
                getOptionLabel={(option) => option || ""} // Use the string itself
                isOptionEqualToValue={(option, value) => option === value} // Compare strings
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Category (Optional)"
                    variant="outlined"
                    fullWidth
                    size="small"
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={option}>
                    {" "}
                    {/* Use string option as key */}
                    {option || ""} {/* Render string option */}
                  </li>
                )}
                fullWidth
                size="small"
              />
            </Grid>
            {/* Payee Autocomplete */}
            <Grid item xs={12} sm={6} md={4}>
              <Autocomplete
                options={payees} // Use the array of objects
                getOptionLabel={(option) => option.name || ""} // Display the name property
                value={payeeValue}
                onChange={(e, newValue) =>
                  handleAutocompleteChange(e, newValue, setPayeeValue)
                }
                isOptionEqualToValue={(option, value) => option.id === value.id} // Compare objects by id
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Payee (Optional)"
                    placeholder="Any Payee"
                  />
                )}
              />
            </Grid>
            {/* Payment Method Autocomplete */}
            <Grid item xs={12} sm={6} md={4}>
              <Autocomplete
                options={paymentMethods} // Use the array of objects
                getOptionLabel={(option) => option.name || ""} // Display the name property
                value={paymentMethodValue}
                onChange={(e, newValue) =>
                  handleAutocompleteChange(e, newValue, setPaymentMethodValue)
                }
                isOptionEqualToValue={(option, value) => option.id === value.id} // Compare objects by id
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Payment Method (Optional)"
                    placeholder="Any Method"
                  />
                )}
              />
            </Grid>
            {/* Amount Input */}
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                label="Amount (Optional)"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                InputProps={{
                  startAdornment: <Typography sx={{ mr: 0.5 }}>$</Typography>,
                }}
              />
            </Grid>

            {/* Result Display Area */}
            <Grid item xs={12}>
              {/* Show loading indicator during optimization */}
              {isOptimizing && (
                <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
                  <CircularProgress size={20} sx={{ mr: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    Updating results...
                  </Typography>
                </Box>
              )}

              {/* --- Recommended Cards Table --- */}
              {!isOptimizing && optimizationResults.length > 0 && (
                <Paper sx={{ p: 2, mt: 3, mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Recommended Cards (For This Scenario)
                  </Typography>
                  <TableContainer>
                    <Table size="small" aria-label="recommended cards table">
                      <TableHead>
                        <TableRow>
                          <TableCell>Card</TableCell>
                          <TableCell>Category</TableCell>
                          <TableCell>Payee</TableCell>
                          <TableCell>Payment Method</TableCell>
                          <TableCell align="right">Rate (%)</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {optimizationResults.map((result, index) => {
                          const cardDisplay = result.card?.name || "Unknown";
                          const rateDisplay = `${result.rate || 0}%`;
                          const categoryDisplay =
                            result.category?.length > 0
                              ? result.category.join(", ")
                              : "Any";
                          const payeeDisplay =
                            result.payee?.length > 0
                              ? result.payee.join(", ")
                              : "Any";
                          const pmDisplay =
                            result.paymentMethod?.length > 0
                              ? result.paymentMethod.join(", ")
                              : "Any";

                          return (
                            <TableRow key={result.card?.id || index}>
                              <TableCell component="th" scope="row">
                                {cardDisplay}
                              </TableCell>
                              <TableCell>{categoryDisplay}</TableCell>
                              <TableCell>{payeeDisplay}</TableCell>
                              <TableCell>{pmDisplay}</TableCell>
                              <TableCell align="right">{rateDisplay}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              )}

              {/* Show message if no results and not optimizing */}
              {!isOptimizing && optimizationResults.length === 0 && !error && (
                <Typography
                  sx={{ mt: 2 }}
                  variant="body2"
                  color="text.secondary"
                >
                  Select criteria or enter amount to see card recommendations
                  for that specific scenario.
                </Typography>
              )}

              {/* --- Ideal Scenarios Table (Formerly Best Possible Rewards) --- */}
              {bestScenarios && bestScenarios.length > 0 && (
                <Paper sx={{ p: 2, mt: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Ideal Scenarios (Best Possible Rates)
                  </Typography>
                  <TableContainer>
                    <Table
                      size="small"
                      aria-label="best possible rewards table"
                    >
                      <TableHead>
                        <TableRow>
                          <TableCell>Card</TableCell>
                          <TableCell>Category</TableCell>
                          <TableCell>Payee</TableCell>
                          <TableCell>Payment Method</TableCell>
                          <TableCell align="right">Rate</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {bestScenarios.slice(0, 10).map((scenario, index) => {
                          // Show top 10
                          const cardDisplay =
                            scenario.card?.name || "Unknown Card";
                          const rateDisplay = `${scenario.rate || 0}${
                            scenario.type || "%"
                          }`;
                          // Display list or "Any"
                          const categoryDisplay =
                            scenario.category?.length > 0
                              ? scenario.category.join(", ")
                              : "Any";
                          const payeeDisplay =
                            scenario.payee?.length > 0
                              ? scenario.payee.join(", ")
                              : "Any";
                          const pmDisplay =
                            scenario.paymentMethod?.length > 0
                              ? scenario.paymentMethod.join(", ")
                              : "Any";

                          return (
                            <TableRow key={`${scenario.card?.id}-${index}`}>
                              <TableCell component="th" scope="row">
                                {cardDisplay}
                              </TableCell>
                              <TableCell>{categoryDisplay}</TableCell>
                              <TableCell>{payeeDisplay}</TableCell>
                              <TableCell>{pmDisplay}</TableCell>
                              <TableCell align="right">{rateDisplay}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              )}
            </Grid>
          </Grid>
        )}
      </CardContent>
    </Card>
  );
}

export default RewardsOptimizer;
