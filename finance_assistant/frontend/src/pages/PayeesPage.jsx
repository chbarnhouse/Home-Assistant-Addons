import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Collapse,
  Paper,
  IconButton,
  Button,
  Alert,
} from "@mui/material";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { useSnackbar } from "../context/SnackbarContext";
import { callApi } from "../utils/api"; // Use direct callApi
import AddEditPayeeModal from "../components/AddEditPayeeModal"; // Import the modal

const PAYEES_API = "managed_payees"; // API endpoint for managed payees

const PayeesPage = () => {
  const [payees, setPayees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openSections, setOpenSections] = useState({});
  const { notify } = useSnackbar();

  // State for the modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [payeeToEdit, setPayeeToEdit] = useState(null);

  // Fetch data from API
  const fetchPayees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await callApi(PAYEES_API); // Fetch directly from managed endpoint
      setPayees(data || []);
    } catch (err) {
      console.error("Error fetching payees:", err);
      setError(err.message || "Failed to load payees. Please try again later.");
      setPayees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchPayees();
  }, [fetchPayees]);

  // --- Modal Handlers ---
  const handleOpenAddModal = () => {
    setPayeeToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (payee) => {
    setPayeeToEdit(payee);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setPayeeToEdit(null);
  };

  const handlePayeeSubmit = async (submittedPayeeData) => {
    const isEditing = !!payeeToEdit;
    const url = isEditing ? `${PAYEES_API}/${payeeToEdit.id}` : PAYEES_API;
    const method = isEditing ? "PUT" : "POST";

    try {
      const result = await callApi(url, method, submittedPayeeData);
      if (isEditing) {
        setPayees((prev) => prev.map((p) => (p.id === result.id ? result : p)));
        notify("Payee updated successfully!", "success");
      } else {
        setPayees((prev) =>
          [...prev, result].sort((a, b) => a.name.localeCompare(b.name))
        ); // Add and sort
        notify("Payee added successfully!", "success");
      }
      handleCloseModal();
    } catch (err) {
      console.error(`Error ${isEditing ? "updating" : "adding"} payee:`, err);
      notify(
        err.message || `Failed to ${isEditing ? "update" : "add"} payee.`,
        "error"
      );
    }
  };

  const handleDeletePayee = async (payeeId, payeeName) => {
    if (
      window.confirm(
        `Are you sure you want to delete the payee "${payeeName}"?`
      )
    ) {
      try {
        await callApi(`${PAYEES_API}/${payeeId}`, "DELETE");
        setPayees((prev) => prev.filter((p) => p.id !== payeeId));
        notify(`Payee "${payeeName}" deleted successfully.`, "success");
      } catch (err) {
        console.error("Error deleting payee:", err);
        notify(err.message || "Failed to delete payee.", "error");
      }
    }
  };
  // --- End Modal Handlers ---

  const handleToggleSection = (section) => {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Group payees by the first letter of their name
  const groupedPayees = payees.reduce((acc, payee) => {
    if (!payee.name) return acc;

    const firstLetter = payee.name[0].toUpperCase();
    if (!/^[A-Z]$/.test(firstLetter)) {
      // Handle non-alphabetic starts
      if (!acc["*"]) {
        acc["*"] = [];
      }
      acc["*"].push(payee);
    } else {
      if (!acc[firstLetter]) {
        acc[firstLetter] = [];
      }
      acc[firstLetter].push(payee);
    }
    return acc;
  }, {});

  // Sort payees within each group
  Object.keys(groupedPayees).forEach((letter) => {
    groupedPayees[letter].sort((a, b) => a.name.localeCompare(b.name));
  });

  // Sort group letters, putting '*' at the end
  const sortedLetters = Object.keys(groupedPayees).sort((a, b) => {
    if (a === "*") return 1;
    if (b === "*") return -1;
    return a.localeCompare(b);
  });

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
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 2 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography variant="h5" gutterBottom component="h1" sx={{ mb: 0 }}>
          Managed Payees
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenAddModal}
          disabled={loading}
        >
          Add Payee
        </Button>
      </Box>
      <Typography variant="body1" paragraph>
        These payees are managed manually within the Finance Assistant. Use the
        buttons to add, edit, or delete payees.
      </Typography>

      <Paper elevation={2} sx={{ p: 2, mt: 2, maxWidth: 800, margin: "auto" }}>
        {payees.length > 0 ? (
          <List component="nav">
            {sortedLetters.map((letter) => (
              <React.Fragment key={letter}>
                <ListItemButton
                  onClick={() => handleToggleSection(letter)}
                  sx={{ backgroundColor: "action.hover" }}
                >
                  <ListItemText
                    primary={`${letter === "*" ? "Other" : letter} (${
                      groupedPayees[letter].length
                    })`}
                    primaryTypographyProps={{ fontWeight: "bold" }}
                  />
                  {openSections[letter] ? <ExpandLess /> : <ExpandMore />}
                </ListItemButton>
                <Collapse
                  in={openSections[letter] || false}
                  timeout="auto"
                  unmountOnExit
                >
                  <List component="div" disablePadding>
                    {groupedPayees[letter].map((payee) => (
                      <ListItem
                        key={payee.id}
                        sx={{ pl: 4 }}
                        secondaryAction={
                          <Box>
                            <IconButton
                              edge="end"
                              aria-label="edit"
                              size="small"
                              onClick={() => handleOpenEditModal(payee)}
                              sx={{ mr: 0.5 }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              edge="end"
                              aria-label="delete"
                              size="small"
                              onClick={() =>
                                handleDeletePayee(payee.id, payee.name)
                              }
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        }
                      >
                        <ListItemText primary={payee.name} />
                      </ListItem>
                    ))}
                  </List>
                </Collapse>
              </React.Fragment>
            ))}
          </List>
        ) : (
          <Typography variant="body1">
            No managed payees found. Click 'Add Payee' to create one.
          </Typography>
        )}
      </Paper>

      {/* Add/Edit Modal */}
      <AddEditPayeeModal
        open={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={handlePayeeSubmit}
        payeeToEdit={payeeToEdit}
        existingPayees={payees} // Pass existing for duplicate checks
      />
    </Box>
  );
};

export default PayeesPage;
