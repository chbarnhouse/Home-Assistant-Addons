import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useSnackbar } from "../context/SnackbarContext";
import { callApi } from "../utils/api";
import Alert from "@mui/material/Alert";

// Points programs API endpoint - without /api prefix to use with callApi utility
const POINTS_PROGRAMS_API_PATH = "points_programs";

// Delete confirmation component defined outside the main component
const DeleteConfirmation = ({ program, onCancel, onConfirm }) => {
  return (
    <ListItem sx={{ backgroundColor: "rgba(211, 47, 47, 0.1)", py: 1 }}>
      <Box sx={{ width: "100%" }}>
        <Typography variant="body2" sx={{ color: "error.main", mb: 0.5 }}>
          Delete "{program}"?
        </Typography>
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button size="small" sx={{ mr: 1 }} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={() => onConfirm(program)}
          >
            Delete
          </Button>
        </Box>
      </Box>
    </ListItem>
  );
};

DeleteConfirmation.propTypes = {
  program: PropTypes.string.isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

function ManagePointsProgramsModal({
  open,
  onClose,
  pointsPrograms = [],
  onUpdate,
}) {
  const [programs, setPrograms] = useState([]);
  const [newProgramName, setNewProgramName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [deleteConfirmProgram, setDeleteConfirmProgram] = useState(null);
  const [editingProgramName, setEditingProgramName] = useState(null);
  const [editProgramValue, setEditProgramValue] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingProgram, setDeletingProgram] = useState(null);
  const [error, setError] = useState(null);
  const { notify } = useSnackbar();

  // Initialize programs from props if available
  useEffect(() => {
    if (open && pointsPrograms.length > 0) {
      setPrograms(pointsPrograms.sort());
    }
  }, [open, pointsPrograms]);

  // Safe function to update parent component
  const safeUpdate = (updatedPrograms) => {
    try {
      if (typeof onUpdate === "function") {
        onUpdate(updatedPrograms);
      }
    } catch (err) {
      console.error("Error in onUpdate callback:", err);
      setError("Internal error updating points programs list");
      notify("Internal error occurred while updating programs", "error");
    }
  };

  const fetchPrograms = async () => {
    setIsFetching(true);
    try {
      const data = await callApi(POINTS_PROGRAMS_API_PATH, { method: "GET" });

      // Handle the response
      if (Array.isArray(data)) {
        setPrograms(data.sort()); // Sort alphabetically
      } else if (data && Array.isArray(data.programs)) {
        setPrograms(data.programs.sort());
      } else {
        console.error("Unexpected response format:", data);
        throw new Error("Unexpected response format from server");
      }
    } catch (error) {
      console.error("Error fetching points programs:", error);
      notify(error.message || "Could not load points programs.", "error");
      // If we failed to fetch, use what was passed in props
      setPrograms(pointsPrograms.sort());
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchPrograms(); // Fetch fresh list when modal opens
      setNewProgramName("");
      setIsLoading(false);
      setError(null);
      setEditingProgramName(null);
      setDeleteConfirmProgram(null);
      setDeletingProgram(null);
    }
  }, [open]);

  const handleAddProgram = async () => {
    const nameToAdd = newProgramName.trim();
    if (!nameToAdd) {
      notify("Points program name cannot be empty.", "warning");
      return;
    }
    if (programs.some((p) => p.toLowerCase() === nameToAdd.toLowerCase())) {
      notify(`Points program "${nameToAdd}" already exists.`, "warning");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await callApi(POINTS_PROGRAMS_API_PATH, {
        method: "POST",
        body: JSON.stringify({ name: nameToAdd }),
      });

      // Ensure result is properly validated
      if (!result || typeof result !== "object") {
        throw new Error("Failed to add points program: Invalid response");
      }

      if (result.success) {
        let updatedPrograms = [];
        if (Array.isArray(result.programs)) {
          updatedPrograms = [...result.programs].sort();
        } else {
          // Fallback to adding locally if server doesn't return full list
          updatedPrograms = [...programs, nameToAdd].sort();
        }

        setPrograms(updatedPrograms);
        safeUpdate(updatedPrograms);
        setNewProgramName(""); // Clear input
        notify("Points program added successfully!", "success");
      } else if (result.error) {
        throw new Error(result.error);
      } else {
        throw new Error("Unexpected response from server");
      }
    } catch (error) {
      console.error("Error adding points program:", error);
      setError(error.message || "Failed to add points program");
      notify(error.message || "An error occurred.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const requestDeleteConfirmation = (programName) => {
    setDeleteConfirmProgram(programName);
    setEditingProgramName(null);
  };

  const cancelDeleteConfirmation = () => {
    setDeleteConfirmProgram(null);
  };

  const confirmAndDeleteProgram = async (programName) => {
    if (!programName) return;

    setDeletingProgram(programName);
    setDeleteConfirmProgram(null);
    setError(null);

    try {
      const result = await callApi(POINTS_PROGRAMS_API_PATH, {
        method: "DELETE",
        body: JSON.stringify({ name: programName }),
      });

      // Ensure result is properly validated
      if (result && typeof result === "object") {
        if (result.success) {
          let updatedPrograms = [];
          if (Array.isArray(result.programs)) {
            updatedPrograms = result.programs.sort();
          } else {
            // Fallback: Update local state if server response doesn't include updated programs
            updatedPrograms = programs.filter(
              (program) => program.toLowerCase() !== programName.toLowerCase()
            );
          }

          setPrograms(updatedPrograms);
          safeUpdate(updatedPrograms);
          notify("Points program deleted successfully.", "success");
        } else if (result.error) {
          throw new Error(result.error);
        } else {
          // Fallback: Update local state
          const updatedPrograms = programs.filter(
            (program) => program.toLowerCase() !== programName.toLowerCase()
          );
          setPrograms(updatedPrograms);
          safeUpdate(updatedPrograms);
          notify(
            "Points program deleted successfully (using local update).",
            "success"
          );
        }
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error) {
      console.error("Error deleting points program:", error);
      setError(error.message || "Failed to delete points program");
      notify(error.message || "An error occurred.", "error");
    } finally {
      setDeletingProgram(null);
    }
  };

  // Edit mode functions
  const handleEditProgram = (programName) => {
    setEditingProgramName(programName);
    setEditProgramValue(programName);
    setDeleteConfirmProgram(null);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingProgramName(null);
    setEditProgramValue("");
    setError(null);
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    const originalName = editingProgramName;
    const newName = editProgramValue.trim();

    if (!newName) {
      setError("Points program name cannot be empty.");
      return;
    }

    if (newName === originalName) {
      handleCancelEdit();
      return;
    }

    if (programs.some((p) => p.toLowerCase() === newName.toLowerCase())) {
      setError(`Points program "${newName}" already exists.`);
      return;
    }

    setIsSavingEdit(true);
    setError(null);
    try {
      const result = await callApi(POINTS_PROGRAMS_API_PATH, {
        method: "PUT",
        body: JSON.stringify({ originalName, newName }),
      });

      if (result && result.success) {
        let updatedPrograms = [];
        if (Array.isArray(result.programs)) {
          updatedPrograms = result.programs.sort();
        } else {
          // Fallback: Update local state
          updatedPrograms = programs
            .map((program) => (program === originalName ? newName : program))
            .sort();
        }

        setPrograms(updatedPrograms);
        safeUpdate(updatedPrograms);
        notify("Points program updated successfully.", "success");
        handleCancelEdit();
      } else if (result && result.error) {
        throw new Error(result.error);
      } else {
        // Fallback: Update local state
        const updatedPrograms = programs
          .map((program) => (program === originalName ? newName : program))
          .sort();
        setPrograms(updatedPrograms);
        safeUpdate(updatedPrograms);
        notify(
          "Points program updated successfully (using local update).",
          "success"
        );
        handleCancelEdit();
      }
    } catch (error) {
      console.error("Error updating points program:", error);
      setError(error.message || "Failed to update points program");
      notify(error.message || "An error occurred.", "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Determine if modal can be closed
  const isBusy =
    isLoading || isSavingEdit || !!deletingProgram || !!editingProgramName;
  const canClose =
    !isLoading &&
    !isSavingEdit &&
    !deletingProgram &&
    !editingProgramName &&
    !deleteConfirmProgram;

  return (
    <Dialog
      open={open}
      onClose={canClose ? onClose : undefined}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle>Manage Points Programs</DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {(isLoading || isFetching) && (
          <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {!isFetching && (
          <List dense>
            {programs.length === 0 && !isLoading && (
              <ListItem>
                <ListItemText primary="No points programs found." />
              </ListItem>
            )}

            {programs.map((programName) => {
              const isBeingDeleted = deletingProgram === programName;
              const isBeingEdited = editingProgramName === programName;
              const isConfirmingDelete = deleteConfirmProgram === programName;

              if (isConfirmingDelete) {
                return (
                  <DeleteConfirmation
                    key={programName}
                    program={programName}
                    onCancel={cancelDeleteConfirmation}
                    onConfirm={confirmAndDeleteProgram}
                  />
                );
              }

              if (isBeingEdited) {
                return (
                  <ListItem key={programName} sx={{ pl: 1, pr: 1 }}>
                    <Box
                      component="form"
                      onSubmit={handleSaveEdit}
                      sx={{ display: "flex", width: "100%", gap: 1 }}
                    >
                      <TextField
                        value={editProgramValue}
                        onChange={(e) => setEditProgramValue(e.target.value)}
                        size="small"
                        fullWidth
                        autoFocus
                        disabled={isSavingEdit}
                      />
                      <Box>
                        <Button
                          size="small"
                          type="submit"
                          variant="contained"
                          color="primary"
                          disabled={isSavingEdit}
                          sx={{ minWidth: "auto", mr: 0.5 }}
                        >
                          {isSavingEdit ? (
                            <CircularProgress size={20} />
                          ) : (
                            "Save"
                          )}
                        </Button>
                        <Button
                          size="small"
                          onClick={handleCancelEdit}
                          disabled={isSavingEdit}
                          sx={{ minWidth: "auto" }}
                        >
                          Cancel
                        </Button>
                      </Box>
                    </Box>
                  </ListItem>
                );
              }

              return (
                <ListItem
                  key={programName}
                  secondaryAction={
                    isBeingDeleted ? (
                      <CircularProgress size={20} />
                    ) : (
                      <Box>
                        <IconButton
                          edge="end"
                          aria-label="edit"
                          onClick={() => handleEditProgram(programName)}
                          disabled={isBusy || !!deleteConfirmProgram}
                          size="small"
                          sx={{ mr: 0.5 }}
                        >
                          <EditIcon fontSize="inherit" />
                        </IconButton>
                        <IconButton
                          edge="end"
                          aria-label="delete"
                          onClick={() => requestDeleteConfirmation(programName)}
                          disabled={isBusy || !!deleteConfirmProgram}
                          size="small"
                        >
                          <DeleteIcon fontSize="inherit" />
                        </IconButton>
                      </Box>
                    )
                  }
                >
                  <ListItemText primary={programName} />
                </ListItem>
              );
            })}
          </List>
        )}

        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            handleAddProgram();
          }}
          sx={{ mt: 2, display: "flex", gap: 1 }}
        >
          <TextField
            label="New Points Program"
            variant="outlined"
            size="small"
            fullWidth
            value={newProgramName}
            onChange={(e) => setNewProgramName(e.target.value)}
            disabled={isLoading || isFetching}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={isLoading || isFetching || !newProgramName.trim()}
          >
            Add
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={!canClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

ManagePointsProgramsModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  pointsPrograms: PropTypes.array,
  onUpdate: PropTypes.func.isRequired, // Callback to update parent state with new programs list
};

export default ManagePointsProgramsModal;
