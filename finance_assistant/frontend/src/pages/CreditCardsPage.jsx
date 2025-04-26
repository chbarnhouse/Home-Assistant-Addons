import React, { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import EditIcon from "@mui/icons-material/Edit";
import Alert from "@mui/material/Alert";
import { DataGrid } from "@mui/x-data-grid";
import EditCreditCardDetailsModal from "../components/EditCreditCardDetailsModal";
import { useSnackbar } from "../context/SnackbarContext";
import { fetchAllData, callApi } from "../utils/api";

const MANUAL_CARD_API = "manual_credit_card";

// --- Helper Functions (Moved to Top) ---
const formatDateTime = (isoString) => {
  if (!isoString) return "N/A";
  try {
    return new Date(isoString).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch (e) {
    return "Invalid Date";
  }
};

const getDisplayName = (card) => {
  // Use the originally entered name if available, otherwise fallback
  return card?.card_name || card?.name || "Unnamed Card";
};
// --- End Helper Functions ---

function CreditCardsPage() {
  const { notify } = useSnackbar();
  const [creditCards, setCreditCards] = useState([]);
  const [banks, setBanks] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [pointsPrograms, setPointsPrograms] = useState([]);
  const [managedCategories, setManagedCategories] = useState([]);
  const [managedPayees, setManagedPayees] = useState([]);
  const [rewardsPayees, setRewardsPayees] = useState([]);
  const [rewardsCategories, setRewardsCategories] = useState([]);
  const [ynabAccounts, setYnabAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal State
  const [openEditModal, setOpenEditModal] = useState(false);
  const [cardToEdit, setCardToEdit] = useState(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const allData = await fetchAllData();
      console.log("Received all_data for credit cards page:", allData);

      if (!allData || typeof allData !== "object") {
        throw new Error("Invalid data format received from API");
      }

      const cardsArray = Array.isArray(allData.credit_cards)
        ? allData.credit_cards
        : [];
      console.log("Credit cards raw data:", cardsArray);

      const processedCards = cardsArray.map((card, index) => {
        const cardObj = card || {};
        console.log(`Processing card #${index}:`, cardObj);

        const name = cardObj.card_name || cardObj.name || `Card ${index + 1}`;
        // Use institution_name field first, then bank field, ensuring we have a string
        const institutionName =
          typeof cardObj.institution_name === "string" &&
          cardObj.institution_name.trim() !== ""
            ? cardObj.institution_name
            : typeof cardObj.bank === "string" && cardObj.bank.trim() !== ""
            ? cardObj.bank
            : "N/A";

        // Make sure last_4_digits is a string and has content
        const last4Digits =
          typeof cardObj.last_4_digits === "string" &&
          cardObj.last_4_digits.trim() !== ""
            ? cardObj.last_4_digits
            : typeof cardObj.last4 === "string" && cardObj.last4.trim() !== ""
            ? cardObj.last4
            : "----";
        let balance =
          typeof cardObj.balance === "number"
            ? Math.abs(cardObj.balance / 1000.0)
            : null;
        let statementBalance =
          typeof cardObj.cleared_balance === "number"
            ? Math.abs(cardObj.cleared_balance / 1000.0)
            : balance;
        let minimumPayment =
          typeof cardObj.minimum_payment === "number"
            ? Math.abs(cardObj.minimum_payment / 1000.0)
            : statementBalance
            ? Math.round(statementBalance * 0.025)
            : null;
        const dueDate =
          cardObj.payment_due_date ||
          (cardObj.auto_pay_day_1
            ? `${cardObj.auto_pay_day_1} each month`
            : null);
        const creditLimit =
          typeof cardObj.credit_limit === "number"
            ? cardObj.credit_limit
            : null;
        let apr =
          typeof cardObj.interest_rate === "number"
            ? cardObj.interest_rate
            : null;
        if (apr !== null && apr < 1) apr *= 100; // Adjust APR if needed

        const returnObj = {
          ...cardObj, // Spread the original object first
          id: cardObj.id || `card-${Date.now()}-${index}`, // Ensure ID is present and unique
          name: name, // Use calculated name
          institution_name: institutionName, // Use calculated institution name
          last_4_digits: last4Digits, // Use calculated last 4 digits
          payment_due_date: dueDate,
          minimum_payment: minimumPayment,
          statement_balance: statementBalance,
          credit_limit: creditLimit,
          current_apr: apr,
          balance: balance,
        };
        console.log(`Card #${index} - Final Mapped Object:`, returnObj); // Log the final object being returned by map
        return returnObj;
      });

      const sortedCards = processedCards.sort((a, b) =>
        getDisplayName(a).localeCompare(getDisplayName(b))
      );

      setCreditCards(sortedCards);
      setBanks(allData.banks || []);
      setPaymentMethods(allData.payment_methods || []);
      setPointsPrograms(allData.points_programs || []);
      setManagedCategories(allData.managed_categories || []);
      setManagedPayees(allData.managed_payees || []);
      setYnabAccounts(allData.accounts || []);
      setRewardsPayees(allData.rewards_payees || []);
      setRewardsCategories(allData.rewards_categories || []);
    } catch (err) {
      console.error("Error fetching data for Credit Cards Page:", err);
      setError(err.message || "Failed to load data");
      notify("Failed to load credit card data.", "error");
      // Clear potentially stale data on error
      setCreditCards([]);
      setBanks([]);
      setPaymentMethods([]);
      setPointsPrograms([]);
      setManagedCategories([]);
      setManagedPayees([]);
      setYnabAccounts([]);
      setRewardsPayees([]);
      setRewardsCategories([]);
    } finally {
      setIsLoading(false);
    }
  }, [notify]); // Removed unused setters from dependency array

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Action Handlers ---
  const handleOpenEditModal = (card) => {
    setCardToEdit(card);
    setOpenEditModal(true);
  };

  const handleCloseEditModal = () => {
    setOpenEditModal(false);
    setCardToEdit(null);
  };

  // --- Handler for Updating Card Details from Modal ---
  const handleUpdateCardDetails = useCallback(
    (updatedCardData) => {
      // Renamed arg for clarity. This data is already saved by the modal.
      if (!updatedCardData || !updatedCardData.id) {
        console.error(
          "handleUpdateCardDetails received invalid data from modal:",
          updatedCardData
        );
        notify("Failed to update UI: Invalid data received.", "error");
        handleCloseEditModal(); // Close modal even if data is bad
        return;
      }

      const cardId = updatedCardData.id;
      console.log("handleUpdateCardDetails called for card ID:", cardId);
      console.log(
        "Updated data received from modal (already saved):",
        updatedCardData
      );

      // Directly update the state with the data received from the modal
      setCreditCards((currentCards) => {
        // Find the index of the card to update
        const index = currentCards.findIndex((card) => card.id === cardId);

        // If card not found, return the current state (shouldn't happen ideally)
        if (index === -1) {
          console.warn(
            `Card with ID ${cardId} not found in current state during update.`
          );
          return currentCards;
        }

        // Create a new array copy
        const newCards = [...currentCards];

        // Create a completely new object for the updated card
        const updatedCard = {
          ...currentCards[index], // Start with existing data
          ...updatedCardData, // Override with new data
        };

        // Replace the card at the specific index with the new object reference
        newCards[index] = updatedCard;

        // Sort the new array - ensure this returns a new sorted array reference
        const sortedNewCards = [...newCards].sort((a, b) =>
          getDisplayName(a).localeCompare(getDisplayName(b))
        );

        return sortedNewCards;
      });

      // Modal already showed success, parent just closes.
      handleCloseEditModal();
    },
    // Dependencies: only notify and handleCloseEditModal (implicitly via scope)
    // No need for fetchData or cardToEdit as we aren't making API calls here.
    [notify]
  );

  // Define DataGrid columns
  const columns = [
    {
      field: "name",
      headerName: "Account Name",
      minWidth: 200,
      flex: 2,
    },
    {
      field: "institution_name",
      headerName: "Institution",
      minWidth: 150,
      flex: 1,
    },
    {
      field: "last_4_digits",
      headerName: "Last 4",
      width: 90,
    },
    {
      field: "payment_due_date",
      headerName: "Due Date",
      minWidth: 120,
      flex: 1,
      valueGetter: (params) =>
        (params && params.row ? params.row.payment_due_date : null) || "N/A",
    },
    {
      field: "minimum_payment",
      headerName: "Min. Payment",
      minWidth: 120,
      flex: 1,
      renderCell: (params) => {
        const value = params?.value;
        if (value == null) return "N/A";
        const numericValue = Number(value);
        if (isNaN(numericValue)) return "N/A";
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(numericValue);
      },
      align: "right",
      headerAlign: "right",
    },
    {
      field: "statement_balance",
      headerName: "Statement Bal.",
      minWidth: 150,
      flex: 1,
      renderCell: (params) => {
        const value = params?.value;
        if (value == null) return "N/A";
        const numericValue = Number(value);
        if (isNaN(numericValue)) return "N/A";
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(numericValue);
      },
      align: "right",
      headerAlign: "right",
    },
    {
      field: "actions",
      headerName: "Edit",
      sortable: false,
      disableColumnMenu: true,
      width: 80,
      align: "center",
      headerAlign: "center",
      renderCell: (params) => (
        <IconButton
          size="small"
          onClick={() => handleOpenEditModal(params.row)} // Pass the whole row object
          aria-label={`Edit ${getDisplayName(params.row)}`}
        >
          <EditIcon />
        </IconButton>
      ),
    },
  ];

  console.log("Final creditCards state passed to DataGrid:", creditCards); // Log state before render

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "80vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Error loading data: {error}</Alert>
        <Button onClick={fetchData} sx={{ mt: 2 }}>
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        p: 3,
        height: "calc(100vh - 64px - 48px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Typography variant="h4" gutterBottom>
        Credit Cards
      </Typography>

      <Paper sx={{ flexGrow: 1, width: "100%", overflow: "hidden" }}>
        <DataGrid
          rows={creditCards}
          columns={columns}
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
            sorting: { sortModel: [{ field: "name", sort: "asc" }] },
          }}
          pageSizeOptions={[10, 25, 50, 100]}
          density="compact"
          disableRowSelectionOnClick
          // Removed autoHeight to allow scrolling within Paper
          sx={{ border: 0 }} // Remove DataGrid border
        />
      </Paper>

      {openEditModal && cardToEdit && (
        <EditCreditCardDetailsModal
          open={openEditModal}
          onClose={handleCloseEditModal}
          cardToEdit={cardToEdit}
          onUpdate={handleUpdateCardDetails}
          banks={banks}
          paymentMethods={paymentMethods}
          categories={managedCategories}
          payees={managedPayees}
          pointsPrograms={pointsPrograms}
          rewardsPayees={rewardsPayees}
          rewardsCategories={rewardsCategories}
        />
      )}
    </Box>
  );
}

export default CreditCardsPage;
