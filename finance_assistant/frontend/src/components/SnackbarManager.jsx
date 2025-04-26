import React from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { useSnackbar } from "../context/SnackbarContext";

/**
 * Component that manages and displays snackbar notifications
 * This works with the SnackbarContext to show alerts/notifications
 */
const SnackbarManager = () => {
  // Get snackbar state and functions from context
  const { snackbarOpen, snackbarMessage, snackbarSeverity, hideSnackbar } =
    useSnackbar();

  return (
    <Snackbar
      open={snackbarOpen}
      autoHideDuration={6000}
      onClose={hideSnackbar}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
    >
      <Alert
        onClose={hideSnackbar}
        severity={snackbarSeverity || "info"}
        variant="filled"
        sx={{ width: "100%" }}
      >
        {snackbarMessage}
      </Alert>
    </Snackbar>
  );
};

export default SnackbarManager;
