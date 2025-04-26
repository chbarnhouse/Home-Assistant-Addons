import React, { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton"; // For clickable groups
import ListItemText from "@mui/material/ListItemText";
import Collapse from "@mui/material/Collapse";
import ListSubheader from "@mui/material/ListSubheader";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import IconButton from "@mui/material/IconButton";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import Button from "@mui/material/Button";
import AddIcon from "@mui/icons-material/Add";
import { useSnackbar } from "../context/SnackbarContext"; // Import Snackbar hook
// Adjust API calls as needed
import { callApi } from "../utils/api"; // Use callApi for specific endpoints
import AddEditCategoryModal from "../components/AddEditCategoryModal"; // Import the modal

const CATEGORIES_API = "managed_categories"; // API endpoint for managed categories

function CategoriesPage() {
  const [managedCategories, setManagedCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openGroups, setOpenGroups] = useState({}); // State to track open groups
  const { notify } = useSnackbar(); // Snackbar hook

  // State for the modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState(null);

  // Fetch data from API
  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await callApi(CATEGORIES_API);
      setManagedCategories(data || []);
    } catch (err) {
      console.error("Error fetching categories:", err);
      setError(
        err.message || "Failed to load categories. Please try again later."
      );
      setManagedCategories([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // --- Modal Handlers ---
  const handleOpenAddModal = () => {
    setCategoryToEdit(null); // Ensure it's adding mode
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (category) => {
    setCategoryToEdit(category);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCategoryToEdit(null); // Clear edit state
  };

  const handleCategorySubmit = async (submittedCategoryData) => {
    const isEditing = !!categoryToEdit; // Check if we are editing
    const url = isEditing
      ? `${CATEGORIES_API}/${categoryToEdit.id}`
      : CATEGORIES_API;
    const method = isEditing ? "PUT" : "POST";

    try {
      const result = await callApi(url, method, submittedCategoryData);
      if (isEditing) {
        setManagedCategories((prev) =>
          prev.map((cat) => (cat.id === result.id ? result : cat))
        );
        notify("Category updated successfully!", "success");
      } else {
        setManagedCategories((prev) => [...prev, result]);
        notify("Category added successfully!", "success");
      }
      handleCloseModal(); // Close modal on success
    } catch (err) {
      console.error(
        `Error ${isEditing ? "updating" : "adding"} category:`,
        err
      );
      notify(
        err.message || `Failed to ${isEditing ? "update" : "add"} category.`,
        "error"
      );
      // Keep modal open on error
    }
  };

  const handleDeleteCategory = async (categoryId, categoryName) => {
    if (
      window.confirm(
        `Are you sure you want to delete the category "${categoryName}"?`
      )
    ) {
      try {
        await callApi(`${CATEGORIES_API}/${categoryId}`, "DELETE");
        setManagedCategories((prev) =>
          prev.filter((cat) => cat.id !== categoryId)
        );
        notify(`Category "${categoryName}" deleted successfully.`, "success");
      } catch (err) {
        console.error("Error deleting category:", err);
        notify(err.message || "Failed to delete category.", "error");
      }
    }
  };
  // --- End Modal Handlers ---

  // Group categories by their group_name
  const groupedCategories = managedCategories.reduce((acc, category) => {
    const groupName = category.group_name || "Uncategorized";
    if (!acc[groupName]) {
      acc[groupName] = [];
    }
    acc[groupName].push(category);
    // Sort categories within the group alphabetically
    acc[groupName].sort((a, b) => a.name.localeCompare(b.name));
    return acc;
  }, {});

  // Sort group names alphabetically
  const sortedGroupNames = Object.keys(groupedCategories).sort((a, b) =>
    a.localeCompare(b)
  );

  // Handle group expansion/collapse
  const handleGroupClick = (groupName) => {
    setOpenGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography variant="h5" component="h1">
          Managed Categories
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenAddModal}
          disabled={isLoading} // Disable if still loading initial data
        >
          Add Category
        </Button>
      </Box>

      {/* Loading and Error Display */}
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

      {/* Display grouped list */}
      {!isLoading && (
        <Paper sx={{ width: "100%", maxWidth: 800, margin: "auto" }}>
          {" "}
          {/* Increased max width */}
          <List
            component="nav"
            aria-labelledby="nested-list-subheader"
            subheader={
              <ListSubheader component="div" id="nested-list-subheader">
                Category Groups
              </ListSubheader>
            }
          >
            {managedCategories.length === 0 && !error ? (
              <ListItem>
                <ListItemText primary="No managed categories found. Click 'Add Category' to create one." />
              </ListItem>
            ) : (
              sortedGroupNames.map((groupName) => (
                <React.Fragment key={groupName}>
                  {/* Make group header clickable */}
                  <ListItemButton
                    onClick={() => handleGroupClick(groupName)}
                    sx={{ backgroundColor: "action.hover" }}
                  >
                    <ListItemText
                      primary={groupName}
                      primaryTypographyProps={{ fontWeight: "bold" }}
                    />
                    {openGroups[groupName] ? <ExpandLess /> : <ExpandMore />}
                  </ListItemButton>
                  <Collapse
                    in={openGroups[groupName] || false} // Default to false if not set
                    timeout="auto"
                    unmountOnExit
                  >
                    <List component="div" disablePadding>
                      {groupedCategories[groupName].map((category) => (
                        <ListItem
                          key={category.id}
                          sx={{ pl: 4 }} // Indent categories
                          secondaryAction={
                            <Box>
                              <IconButton
                                edge="end"
                                aria-label="edit"
                                size="small"
                                onClick={() => handleOpenEditModal(category)}
                                sx={{ mr: 0.5 }}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                edge="end"
                                aria-label="delete"
                                size="small"
                                onClick={() =>
                                  handleDeleteCategory(
                                    category.id,
                                    category.name
                                  )
                                }
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          }
                        >
                          <ListItemText primary={category.name} />
                        </ListItem>
                      ))}
                    </List>
                  </Collapse>
                </React.Fragment>
              ))
            )}
          </List>
        </Paper>
      )}

      {/* Add/Edit Modal */}
      <AddEditCategoryModal
        open={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleCategorySubmit}
        categoryToEdit={categoryToEdit}
        existingCategories={managedCategories} // Pass existing for duplicate checks
      />
    </Box>
  );
}

export default CategoriesPage;
