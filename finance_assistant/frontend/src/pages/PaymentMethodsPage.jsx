import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from "@mui/material";
import { fetchData } from "../api/api";

const PaymentMethodsPage = () => {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const getPaymentMethods = async () => {
      try {
        setLoading(true);
        const data = await fetchData("/api/all_data");
        if (data && data.payment_methods) {
          setPaymentMethods(data.payment_methods);
        }
        setLoading(false);
      } catch (err) {
        console.error("Error fetching payment methods:", err);
        setError("Failed to load payment methods. Please try again later.");
        setLoading(false);
      }
    };

    getPaymentMethods();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ mt: 4 }}>
        <Typography color="error" variant="h6">
          {error}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="h5" gutterBottom>
        Payment Methods
      </Typography>
      <Typography variant="body1" paragraph>
        This page displays all payment methods configured in your Finance
        Assistant.
      </Typography>

      <Paper elevation={2} sx={{ p: 2, mt: 2 }}>
        {paymentMethods.length > 0 ? (
          <TableContainer>
            <Table aria-label="payment methods table">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Default Earn Rate</TableCell>
                  <TableCell>Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paymentMethods.map((method) => (
                  <TableRow key={method.id || method.name}>
                    <TableCell>
                      {method.name}
                      {method.is_default && (
                        <Chip
                          label="Default"
                          size="small"
                          color="primary"
                          sx={{ ml: 1 }}
                        />
                      )}
                    </TableCell>
                    <TableCell>{method.type || "N/A"}</TableCell>
                    <TableCell>
                      {method.default_earn_rate
                        ? `${method.default_earn_rate}%`
                        : "N/A"}
                    </TableCell>
                    <TableCell>{method.notes || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography variant="body1">
            No payment methods found. Configure payment methods to track rewards
            and optimize spending.
          </Typography>
        )}
      </Paper>
    </Box>
  );
};

export default PaymentMethodsPage;
