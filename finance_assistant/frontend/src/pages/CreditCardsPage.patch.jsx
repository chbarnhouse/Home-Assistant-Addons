import React, { useCallback } from "react";

const handleUpdateCardDetails = useCallback(
  (updatedCardDetails) => {
    console.log("Card update received:", updatedCardDetails);

    // Check if bank is new and should be added to the banks list
    if (updatedCardDetails.bank && updatedCardDetails.bank.trim()) {
      const bankExists = banks.some(
        (bank) =>
          (typeof bank === "string"
            ? bank.toLowerCase()
            : bank.name.toLowerCase()) === updatedCardDetails.bank.toLowerCase()
      );

      // If bank doesn't exist, add it to the banks array
      if (!bankExists) {
        console.log("Adding new bank to list:", updatedCardDetails.bank);
        // Create copy of banks array with the new bank
        const updatedBanks = [...banks, updatedCardDetails.bank];
        setBanks(updatedBanks);
      }
    }

    // Continue with existing card update logic
    // ... rest of the function
  },
  [creditCards, notify, banks, paymentMethods, cardToEdit, fetchData]
);
