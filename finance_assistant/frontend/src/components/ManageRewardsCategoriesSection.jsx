import React, { useState, useEffect, useCallback, useMemo } from "react";
import PropTypes from "prop-types";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import IconButton from "@mui/material/IconButton";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import { useSnackbar } from "../context/SnackbarContext";
import { callApi } from "../utils/api";

// --- Tree Building Logic --- START
// Helper function to build the tree structure
const buildTree = (items) => {
  if (!items || items.length === 0) {
    return [];
  }

  const itemsById = {};
  const childrenByParentId = {};

  // First pass: index items by ID and initialize children arrays
  items.forEach((item) => {
    itemsById[item.id] = { ...item, children: [] };
    // Ensure parent_id is either a string or null for grouping
    const parentIdKey = item.parent_id || "root"; // Use 'root' for null parent_id
    if (!childrenByParentId[parentIdKey]) {
      childrenByParentId[parentIdKey] = [];
    }
    childrenByParentId[parentIdKey].push(item.id);
  });

  // Second pass: link children to their parents
  items.forEach((item) => {
    if (item.parent_id && itemsById[item.parent_id]) {
      // Check if child isn't already added (safety against malformed data, though unlikely with UUIDs)
      if (
        !itemsById[item.parent_id].children.some(
          (child) => child.id === item.id
        )
      ) {
        itemsById[item.parent_id].children.push(itemsById[item.id]);
      }
    }
  });

  // Get top-level nodes (those with parent_id = null or parent_id not in itemsById)
  const rootNodes = items
    .filter((item) => !item.parent_id) // Filter for null parent_id explicitly
    .map((item) => itemsById[item.id]) // Get the full node with children array
    .filter(Boolean); // Ensure we don't include undefined nodes if an item's parent was missing

  // Recursive sort function
  const sortNodes = (nodes) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((node) => {
      if (node.children && node.children.length > 0) {
        sortNodes(node.children);
      }
    });
  };

  // Sort the tree alphabetically at each level
  sortNodes(rootNodes);

  return rootNodes;
};

// --- Tree Building Logic --- END

// --- Helper for cycle detection --- START
const getDescendantIds = (items, parentId) => {
  const descendants = new Set();
  const findChildren = (id) => {
    items.forEach((item) => {
      if (item.parent_id === id) {
        if (!descendants.has(item.id)) {
          // Prevent infinite loops in case of bad data
          descendants.add(item.id);
          findChildren(item.id);
        }
      }
    });
  };
  findChildren(parentId);
  return descendants;
};
// --- Helper for cycle detection --- END

const REWARDS_CATEGORIES_API_ENDPOINT = "rewards_categories";

// Reusable Delete Confirmation (Generic - Same as other sections)
const DeleteConfirmation = ({ itemType, item, onCancel, onConfirm }) => {
  const handleConfirm = useCallback(() => {
    if (onConfirm) onConfirm(item);
  }, [item, onConfirm]);
  const handleCancel = useCallback(() => {
    if (onCancel) onCancel();
  }, [onCancel]);

  return (
    <ListItem
      key={`${item.id}-delete-confirm`}
      sx={{
        backgroundColor: "rgba(211, 47, 47, 0.1)",
        py: 1,
        display: "block",
      }}
    >
      <Typography variant="body2" sx={{ color: "error.main", mb: 0.5 }}>
        Delete {itemType} "{item.name}"? This cannot be undone.
      </Typography>
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button size="small" sx={{ mr: 1 }} onClick={handleCancel}>
          Cancel
        </Button>
        <Button
          size="small"
          variant="contained"
          color="error"
          onClick={handleConfirm}
        >
          Delete
        </Button>
      </Box>
    </ListItem>
  );
};

DeleteConfirmation.propTypes = {
  itemType: PropTypes.string.isRequired,
  item: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
  }).isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

// --- Recursive Node Renderer --- START
const RenderCategoryNode = React.memo(
  ({
    node,
    level,
    editingItem,
    editItemValue,
    editItemParentId,
    isSavingEdit,
    deleteConfirmItem,
    deletingItem,
    itemList,
    onEditItem,
    onCancelEdit,
    onSaveEdit,
    onDeleteItem,
    onCancelDelete,
    onConfirmDelete,
    setEditItemValue,
    setEditItemParentId,
  }) => {
    const isEditingCurrent = editingItem && editingItem.id === node.id;
    const isDeletingCurrent = deletingItem && deletingItem.id === node.id;
    const isConfirmingDeleteCurrent =
      deleteConfirmItem && deleteConfirmItem.id === node.id;

    // Handlers specific to this node
    const handleEdit = () => onEditItem(node);
    const handleCancel = () => onCancelEdit();
    const handleSave = (e) => onSaveEdit(e); // Event needed for preventDefault
    const handleDelete = () => onDeleteItem(node);
    const handleCancelDel = () => onCancelDelete();
    const handleConfirmDel = () => onConfirmDelete(node);

    // Prepare options for parent selector, excluding the node itself and its descendants
    const parentOptions = useMemo(() => {
      if (!isEditingCurrent) return [];
      const descendantIds = getDescendantIds(itemList, node.id);
      const filtered = itemList.filter(
        (item) => item.id !== node.id && !descendantIds.has(item.id)
      );
      // Add the "No Parent" option
      return [{ id: null, name: "(No Parent - Top Level)" }, ...filtered];
    }, [itemList, node.id, isEditingCurrent]);

    return (
      <>
        <ListItem
          key={node.id}
          divider
          sx={{
            pl: level * 2, // Indentation based on level
            opacity: isDeletingCurrent ? 0.5 : 1,
            position: "relative", // For spinner positioning
            flexWrap: "wrap", // Allow wrapping for edit form
          }}
        >
          {isEditingCurrent ? (
            <Box
              component="form"
              onSubmit={handleSave}
              sx={{ width: "100%", pt: 1, pb: 1 }}
            >
              {/* Edit Form Fields */}
              <Box
                sx={{
                  display: "flex",
                  gap: 1,
                  alignItems: "flex-start",
                  mb: 1,
                }}
              >
                <TextField
                  label="Name"
                  value={editItemValue}
                  onChange={(e) => setEditItemValue(e.target.value)}
                  variant="outlined"
                  size="small"
                  fullWidth
                  autoFocus
                  disabled={isSavingEdit}
                  sx={{ flexGrow: 1 }}
                />
                <FormControl
                  size="small"
                  sx={{ minWidth: 200 }}
                  disabled={isSavingEdit}
                >
                  <InputLabel id={`edit-parent-label-${node.id}`}>
                    Parent Category
                  </InputLabel>
                  <Select
                    labelId={`edit-parent-label-${node.id}`}
                    value={editItemParentId === null ? "" : editItemParentId} // Handle null value for Select
                    label="Parent Category"
                    onChange={(e) =>
                      setEditItemParentId(
                        e.target.value === "" ? null : e.target.value
                      )
                    }
                  >
                    {/* Render options, excluding self and descendants */}
                    {parentOptions.map((option) => (
                      <MenuItem
                        key={option.id || "no-parent"}
                        value={option.id === null ? "" : option.id}
                      >
                        {option.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
              {/* Action Buttons */}
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button
                  onClick={handleCancel}
                  disabled={isSavingEdit}
                  sx={{ mr: 1 }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={isSavingEdit}
                  startIcon={
                    isSavingEdit ? (
                      <CircularProgress size={16} />
                    ) : (
                      <SaveIcon fontSize="inherit" />
                    )
                  }
                >
                  Save
                </Button>
              </Box>
            </Box>
          ) : (
            <>
              <ListItemText primary={node.name} />
              <IconButton
                edge="end"
                aria-label="edit"
                onClick={handleEdit}
                disabled={
                  isDeletingCurrent || !!editingItem || !!deleteConfirmItem
                }
              >
                <EditIcon />
              </IconButton>
              <IconButton
                edge="end"
                aria-label="delete"
                onClick={handleDelete}
                disabled={
                  isDeletingCurrent || !!editingItem || !!deleteConfirmItem
                }
              >
                {isDeletingCurrent ? (
                  <CircularProgress size={20} />
                ) : (
                  <DeleteIcon />
                )}
              </IconButton>
            </>
          )}
        </ListItem>

        {/* Render Delete Confirmation Inline */}
        {isConfirmingDeleteCurrent && (
          <DeleteConfirmation
            itemType="Category"
            item={node}
            onCancel={handleCancelDel}
            onConfirm={handleConfirmDel}
          />
        )}

        {/* Recursively render children */}
        {node.children && node.children.length > 0 && (
          <List disablePadding component="div">
            {node.children.map((childNode) => (
              <RenderCategoryNode
                key={childNode.id}
                node={childNode}
                level={level + 1}
                editingItem={editingItem}
                editItemValue={editItemValue}
                editItemParentId={editItemParentId}
                isSavingEdit={isSavingEdit}
                deleteConfirmItem={deleteConfirmItem}
                deletingItem={deletingItem}
                itemList={itemList}
                onEditItem={onEditItem}
                onCancelEdit={onCancelEdit}
                onSaveEdit={onSaveEdit}
                onDeleteItem={onDeleteItem}
                onCancelDelete={onCancelDelete}
                onConfirmDelete={onConfirmDelete}
                setEditItemValue={setEditItemValue}
                setEditItemParentId={setEditItemParentId}
              />
            ))}
          </List>
        )}
      </>
    );
  }
);

RenderCategoryNode.propTypes = {
  node: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    parent_id: PropTypes.string, // Can be null
    children: PropTypes.array, // Array of node shapes
  }).isRequired,
  level: PropTypes.number.isRequired,
  editingItem: PropTypes.object,
  editItemValue: PropTypes.string.isRequired,
  editItemParentId: PropTypes.string, // Can be null
  isSavingEdit: PropTypes.bool.isRequired,
  deleteConfirmItem: PropTypes.object,
  deletingItem: PropTypes.object,
  itemList: PropTypes.array.isRequired,
  onEditItem: PropTypes.func.isRequired,
  onCancelEdit: PropTypes.func.isRequired,
  onSaveEdit: PropTypes.func.isRequired,
  onDeleteItem: PropTypes.func.isRequired,
  onCancelDelete: PropTypes.func.isRequired,
  onConfirmDelete: PropTypes.func.isRequired,
  setEditItemValue: PropTypes.func.isRequired,
  setEditItemParentId: PropTypes.func.isRequired,
};
// --- Recursive Node Renderer --- END

// Consistent naming and props
function ManageRewardsCategoriesSection({ categories = [], onUpdate }) {
  // Renamed onDataChanged to onUpdate
  const [itemList, setItemList] = useState([]); // Keep flat list for lookups/dropdowns
  const [categoryTree, setCategoryTree] = useState([]); // State for the nested tree structure
  const [newItemName, setNewItemName] = useState("");
  const [newItemParentId, setNewItemParentId] = useState(null); // State for new item's parent
  const [isAdding, setIsAdding] = useState(false);
  const [deletingItem, setDeletingItem] = useState(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [editItemValue, setEditItemValue] = useState("");
  const [editItemParentId, setEditItemParentId] = useState(null); // State for item being edited
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [error, setError] = useState(null);
  const { notify } = useSnackbar();

  // Process categories prop into flat list and tree structure
  useEffect(() => {
    // Expect categories prop to be an array of {id, name, parent_id} objects
    const validItems = Array.isArray(categories)
      ? categories.filter(
          (item) =>
            item &&
            item.id &&
            typeof item.id === "string" &&
            item.name &&
            typeof item.name === "string" &&
            (item.parent_id === null || typeof item.parent_id === "string") // Validate parent_id
        )
      : [];

    // Set the flat list state (useful for parent dropdowns later)
    setItemList(validItems);

    // Build the tree structure from the valid flat list
    const tree = buildTree(validItems);
    setCategoryTree(tree);
    console.log("Built category tree:", tree); // Debug log

    // Reset local states only if categories prop changes identity
    // (prevents resetting during internal updates like add/edit/delete)
    // Note: This might still reset if onUpdate causes categories prop to change reference
    setNewItemName("");
    setNewItemParentId(null);
    setEditingItem(null);
    setEditItemValue("");
    setEditItemParentId(null);
    setError(null);
    setIsAdding(false);
    setIsSavingEdit(false);
    setDeletingItem(null);
    setDeleteConfirmItem(null);
  }, [categories]); // Depend only on categories prop identity

  // --- CRUD Handlers (Refactored for Hierarchy) ---

  const handleAddItem = async (event) => {
    event.preventDefault();
    const trimmedName = newItemName.trim();
    if (!trimmedName) {
      setError("Category name cannot be empty.");
      return;
    }

    // Check for duplicate name *under the same parent*
    const parentToCheck = newItemParentId === null ? null : newItemParentId;
    if (
      itemList.some(
        (item) =>
          item.name.toLowerCase() === trimmedName.toLowerCase() &&
          item.parent_id === parentToCheck
      )
    ) {
      setError(
        `Category "${trimmedName}" already exists under the selected parent.`
      );
      return;
    }

    setIsAdding(true);
    setError(null);
    try {
      const payload = { name: trimmedName };
      // Only include parent_id if it's not null
      if (newItemParentId !== null) {
        payload.parent_id = newItemParentId;
      }
      // Use POST to base endpoint
      const result = await callApi(REWARDS_CATEGORIES_API_ENDPOINT, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      // API returns the full updated list or error object
      if (result && Array.isArray(result)) {
        // Check if response is the list
        notify(`Category "${trimmedName}" added successfully.`, "success");
        setNewItemName("");
        setNewItemParentId(null); // Reset parent selector
        if (onUpdate) {
          onUpdate(); // Call onUpdate to trigger refetch from parent
        }
      } else {
        // Handle potential error object from API
        throw new Error(result?.error || "Failed to add category.");
      }
    } catch (err) {
      console.error("Error adding category:", err);
      setError(err.message || "An unknown error occurred while adding.");
      notify(`Error: ${err.message || "Could not add category."}`, "error");
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditItem = (item) => {
    setEditingItem(item); // Store the whole item object
    setEditItemValue(item.name);
    setEditItemParentId(item.parent_id); // Initialize parent selector state
    setDeleteConfirmItem(null);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
    setEditItemValue("");
    setEditItemParentId(null); // Reset parent selector state
    setError(null);
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    const trimmedValue = editItemValue.trim();
    const originalItem = editingItem;

    if (!originalItem) {
      setError("Cannot save edit: No item selected.");
      return;
    }
    if (!trimmedValue) {
      setError("Category name cannot be empty.");
      return;
    }

    const newParentId = editItemParentId === null ? null : editItemParentId;

    // Check for duplicate name under the *target* parent, excluding self
    if (
      itemList.some(
        (item) =>
          item.id !== originalItem.id &&
          item.name.toLowerCase() === trimmedValue.toLowerCase() &&
          item.parent_id === newParentId
      )
    ) {
      setError(
        `Another category named "${trimmedValue}" already exists under the target parent.`
      );
      return;
    }

    // Prevent setting parent to self or descendant (already handled by parentOptions filter, but good safety check)
    if (newParentId === originalItem.id) {
      setError("Cannot set an item as its own parent.");
      return;
    }
    const descendantIds = getDescendantIds(itemList, originalItem.id);
    if (newParentId !== null && descendantIds.has(newParentId)) {
      setError("Cannot move an item under one of its own descendants.");
      return;
    }

    const nameChanged = trimmedValue !== originalItem.name;
    const parentChanged = newParentId !== originalItem.parent_id;

    if (!nameChanged && !parentChanged) {
      handleCancelEdit();
      return;
    }

    setIsSavingEdit(true);
    setError(null);
    try {
      const payload = {};
      if (nameChanged) payload.name = trimmedValue;
      if (parentChanged) payload.parent_id = newParentId; // Send null if changed to top-level

      // Use PUT to /api/rewards_categories/{id}
      const result = await callApi(
        `${REWARDS_CATEGORIES_API_ENDPOINT}/${originalItem.id}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        }
      );

      // API returns the full updated list or error object
      if (result && Array.isArray(result)) {
        // Check if response is the list
        notify(`Category updated successfully.`, "success");
        setEditingItem(null); // Exit edit mode
        if (onUpdate) {
          onUpdate(); // Call onUpdate without arguments to trigger refetch
        }
      } else {
        // Handle potential error object from API
        throw new Error(result?.error || "Failed to update category.");
      }
    } catch (err) {
      console.error("Error saving category edit:", err);
      setError(err.message || "An unknown error occurred while saving.");
      notify(`Error: ${err.message || "Could not save changes."}`, "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteClick = (item) => {
    setDeleteConfirmItem(item);
    setEditingItem(null);
    setError(null);
  };

  const handleCancelDelete = () => {
    setDeleteConfirmItem(null);
  };

  const handleConfirmDelete = async (itemToDelete) => {
    setDeletingItem(itemToDelete);
    setDeleteConfirmItem(null);
    setError(null);
    try {
      // Use DELETE to /api/rewards_categories/{id}
      const result = await callApi(
        `${REWARDS_CATEGORIES_API_ENDPOINT}/${itemToDelete.id}`,
        {
          method: "DELETE",
        }
      );

      // API returns the full updated list or error object
      if (result && Array.isArray(result)) {
        // Check if response is the list
        notify(
          `Category "${itemToDelete.name}" deleted successfully.`,
          "success"
        );
        if (onUpdate) {
          onUpdate(); // Call onUpdate without arguments to trigger refetch
        }
      } else {
        // Handle potential error object from API (e.g., 409 Conflict)
        const errorMessage = result?.error || "Failed to delete category.";
        setError(errorMessage);
        notify(`Error: ${errorMessage}`, "error");
        // No automatic throw here, let the finally block reset deletingItem
      }
    } catch (err) {
      // Catch network errors or unexpected issues
      const message =
        err.message || "An unknown error occurred while deleting.";
      console.error(`Error deleting category ${itemToDelete.name}:`, err);
      setError(message);
      notify(`Error: ${message}`, "error");
    } finally {
      setDeletingItem(null);
    }
  };

  // Prepare options for the "Add New" parent dropdown
  const addParentOptions = useMemo(() => {
    return [{ id: null, name: "(No Parent - Top Level)" }, ...itemList];
  }, [itemList]);

  // --- Render Logic ---
  return (
    <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Manage Rewards Categories
      </Typography>
      <Divider sx={{ mb: 2 }} />

      {/* Add New Category Form */}
      <Box
        component="form"
        onSubmit={handleAddItem}
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 1.5,
          mb: 2,
          alignItems: "flex-start",
        }}
      >
        <TextField
          label="New Category Name"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          variant="outlined"
          size="small"
          sx={{ flexGrow: 1, minWidth: "200px" }} // Allow shrinking but have min width
          disabled={isAdding}
        />
        <FormControl size="small" sx={{ minWidth: 200 }} disabled={isAdding}>
          <InputLabel id="add-parent-label">Parent Category</InputLabel>
          <Select
            labelId="add-parent-label"
            value={newItemParentId === null ? "" : newItemParentId} // Handle null for Select
            label="Parent Category"
            onChange={(e) =>
              setNewItemParentId(e.target.value === "" ? null : e.target.value)
            }
          >
            {addParentOptions.map((option) => (
              <MenuItem
                key={option.id || "no-parent"}
                value={option.id === null ? "" : option.id}
              >
                {option.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          type="submit"
          variant="contained"
          color="primary"
          disabled={isAdding || !newItemName.trim()}
          startIcon={isAdding ? <CircularProgress size={16} /> : null}
          sx={{ height: "40px" }} // Match TextField small size height
        >
          Add
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Display Category Tree */}
      <List dense>
        {categoryTree.length === 0 && !isAdding && (
          <ListItem>
            <ListItemText primary="No rewards categories defined." />
          </ListItem>
        )}
        {categoryTree.map((node) => (
          <RenderCategoryNode
            key={node.id}
            node={node}
            level={1} // Start top-level nodes at level 1
            editingItem={editingItem}
            editItemValue={editItemValue}
            editItemParentId={editItemParentId}
            isSavingEdit={isSavingEdit}
            deleteConfirmItem={deleteConfirmItem}
            deletingItem={deletingItem}
            itemList={itemList}
            onEditItem={handleEditItem}
            onCancelEdit={handleCancelEdit}
            onSaveEdit={handleSaveEdit}
            onDeleteItem={handleDeleteClick}
            onCancelDelete={handleCancelDelete}
            onConfirmDelete={handleConfirmDelete}
            setEditItemValue={setEditItemValue}
            setEditItemParentId={setEditItemParentId}
          />
        ))}
      </List>
    </Paper>
  );
}

ManageRewardsCategoriesSection.propTypes = {
  categories: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      parent_id: PropTypes.string, // Now optional string or null
    })
  ).isRequired,
  onUpdate: PropTypes.func.isRequired, // Ensure this is marked required
};

export default ManageRewardsCategoriesSection;
