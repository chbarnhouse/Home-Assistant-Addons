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
const buildTree = (items) => {
  if (!items || items.length === 0) {
    return [];
  }

  const itemsById = {};
  const childrenByParentId = {};

  items.forEach((item) => {
    itemsById[item.id] = { ...item, children: [] };
    const parentIdKey = item.parent_id || "root";
    if (!childrenByParentId[parentIdKey]) {
      childrenByParentId[parentIdKey] = [];
    }
    childrenByParentId[parentIdKey].push(item.id);
  });

  items.forEach((item) => {
    if (item.parent_id && itemsById[item.parent_id]) {
      if (
        !itemsById[item.parent_id].children.some(
          (child) => child.id === item.id
        )
      ) {
        itemsById[item.parent_id].children.push(itemsById[item.id]);
      }
    }
  });

  const rootNodes = items
    .filter((item) => !item.parent_id)
    .map((item) => itemsById[item.id])
    .filter(Boolean);

  const sortNodes = (nodes) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((node) => {
      if (node.children && node.children.length > 0) {
        sortNodes(node.children);
      }
    });
  };

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

const REWARDS_PAYEES_API_ENDPOINT = "rewards_payees";

// Reusable Delete Confirmation (Generic)
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
const RenderPayeeNode = React.memo(
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

    const handleEdit = () => onEditItem(node);
    const handleCancel = () => onCancelEdit();
    const handleSave = (e) => onSaveEdit(e);
    const handleDelete = () => onDeleteItem(node);
    const handleCancelDel = () => onCancelDelete();
    const handleConfirmDel = () => onConfirmDelete(node);

    const parentOptions = useMemo(() => {
      if (!isEditingCurrent) return [];
      const descendantIds = getDescendantIds(itemList, node.id);
      const filtered = itemList.filter(
        (item) => item.id !== node.id && !descendantIds.has(item.id)
      );
      return [{ id: null, name: "(No Parent - Top Level)" }, ...filtered];
    }, [itemList, node.id, isEditingCurrent]);

    return (
      <>
        <ListItem
          key={node.id}
          divider
          sx={{
            pl: level * 2,
            opacity: isDeletingCurrent ? 0.5 : 1,
            position: "relative",
            flexWrap: "wrap",
          }}
        >
          {isEditingCurrent ? (
            <Box
              component="form"
              onSubmit={handleSave}
              sx={{ width: "100%", pt: 1, pb: 1 }}
            >
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
                  <InputLabel id={`edit-parent-payee-label-${node.id}`}>
                    Parent Payee
                  </InputLabel>
                  <Select
                    labelId={`edit-parent-payee-label-${node.id}`}
                    value={editItemParentId === null ? "" : editItemParentId}
                    label="Parent Payee"
                    onChange={(e) =>
                      setEditItemParentId(
                        e.target.value === "" ? null : e.target.value
                      )
                    }
                  >
                    {parentOptions.map((option) => (
                      <MenuItem
                        key={option.id || "no-parent-payee"}
                        value={option.id === null ? "" : option.id}
                      >
                        {option.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
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

        {isConfirmingDeleteCurrent && (
          <DeleteConfirmation
            itemType="Payee"
            item={node}
            onCancel={handleCancelDel}
            onConfirm={handleConfirmDel}
          />
        )}

        {node.children && node.children.length > 0 && (
          <List disablePadding component="div">
            {node.children.map((childNode) => (
              <RenderPayeeNode
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

RenderPayeeNode.propTypes = {
  node: PropTypes.object.isRequired,
  level: PropTypes.number.isRequired,
  editingItem: PropTypes.object,
  editItemValue: PropTypes.string.isRequired,
  editItemParentId: PropTypes.string,
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

// Main Component
function ManageRewardsPayeesSection({ payees = [], onUpdate }) {
  const [itemList, setItemList] = useState([]); // Flat list
  const [payeeTree, setPayeeTree] = useState([]); // Nested tree
  const [newItemName, setNewItemName] = useState("");
  const [newItemParentId, setNewItemParentId] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingItem, setDeletingItem] = useState(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [editItemValue, setEditItemValue] = useState("");
  const [editItemParentId, setEditItemParentId] = useState(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [error, setError] = useState(null);
  const { notify } = useSnackbar();

  useEffect(() => {
    const validItems = Array.isArray(payees)
      ? payees.filter(
          (item) =>
            item &&
            item.id &&
            typeof item.id === "string" &&
            item.name &&
            typeof item.name === "string" &&
            (item.parent_id === null || typeof item.parent_id === "string")
        )
      : [];

    setItemList(validItems);
    const tree = buildTree(validItems);
    setPayeeTree(tree);

    // Reset states on prop change
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
  }, [payees]);

  const handleAddItem = async (event) => {
    event.preventDefault();
    const trimmedName = newItemName.trim();
    if (!trimmedName) {
      setError("Payee name cannot be empty.");
      return;
    }
    const parentToCheck = newItemParentId === null ? null : newItemParentId;
    if (
      itemList.some(
        (item) =>
          item.name.toLowerCase() === trimmedName.toLowerCase() &&
          item.parent_id === parentToCheck
      )
    ) {
      setError(
        `Payee "${trimmedName}" already exists under the selected parent.`
      );
      return;
    }
    setIsAdding(true);
    setError(null);
    try {
      const payload = { name: trimmedName };
      if (newItemParentId !== null) payload.parent_id = newItemParentId;
      const result = await callApi(REWARDS_PAYEES_API_ENDPOINT, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (result && Array.isArray(result)) {
        notify(`Payee "${trimmedName}" added successfully.`, "success");
        setNewItemName("");
        setNewItemParentId(null);
        if (onUpdate) onUpdate();
      } else {
        throw new Error(result?.error || "Failed to add payee.");
      }
    } catch (err) {
      setError(err.message || "An unknown error occurred while adding.");
      notify(`Error: ${err.message || "Could not add payee."}`, "error");
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditItem = (item) => {
    setEditingItem(item);
    setEditItemValue(item.name);
    setEditItemParentId(item.parent_id);
    setDeleteConfirmItem(null);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
    setEditItemValue("");
    setEditItemParentId(null);
    setError(null);
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    const trimmedValue = editItemValue.trim();
    const originalItem = editingItem;
    if (!originalItem) return setError("Cannot save edit: No item selected.");
    if (!trimmedValue) return setError("Payee name cannot be empty.");

    const newParentId = editItemParentId === null ? null : editItemParentId;
    if (
      itemList.some(
        (item) =>
          item.id !== originalItem.id &&
          item.name.toLowerCase() === trimmedValue.toLowerCase() &&
          item.parent_id === newParentId
      )
    ) {
      return setError(
        `Another payee named "${trimmedValue}" already exists under the target parent.`
      );
    }
    if (newParentId === originalItem.id)
      return setError("Cannot set an item as its own parent.");
    const descendantIds = getDescendantIds(itemList, originalItem.id);
    if (newParentId !== null && descendantIds.has(newParentId))
      return setError("Cannot move an item under one of its own descendants.");

    const nameChanged = trimmedValue !== originalItem.name;
    const parentChanged = newParentId !== originalItem.parent_id;
    if (!nameChanged && !parentChanged) return handleCancelEdit();

    setIsSavingEdit(true);
    setError(null);
    try {
      const payload = {};
      if (nameChanged) payload.name = trimmedValue;
      if (parentChanged) payload.parent_id = newParentId;
      const result = await callApi(
        `${REWARDS_PAYEES_API_ENDPOINT}/${originalItem.id}`,
        { method: "PUT", body: JSON.stringify(payload) }
      );
      if (result && Array.isArray(result)) {
        notify(`Payee updated successfully.`, "success");
        setEditingItem(null);
        if (onUpdate) onUpdate();
      } else {
        throw new Error(result?.error || "Failed to update payee.");
      }
    } catch (err) {
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
      const result = await callApi(
        `${REWARDS_PAYEES_API_ENDPOINT}/${itemToDelete.id}`,
        { method: "DELETE" }
      );
      if (result && Array.isArray(result)) {
        notify(`Payee "${itemToDelete.name}" deleted successfully.`, "success");
        if (onUpdate) onUpdate();
      } else {
        const errorMessage = result?.error || "Failed to delete payee.";
        setError(errorMessage);
        notify(`Error: ${errorMessage}`, "error");
      }
    } catch (err) {
      const message =
        err.message || "An unknown error occurred while deleting.";
      setError(message);
      notify(`Error: ${message}`, "error");
    } finally {
      setDeletingItem(null);
    }
  };

  const addParentOptions = useMemo(() => {
    return [{ id: null, name: "(No Parent - Top Level)" }, ...itemList];
  }, [itemList]);

  return (
    <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Manage Rewards Payees
      </Typography>
      <Divider sx={{ mb: 2 }} />

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
          label="New Payee Name"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          variant="outlined"
          size="small"
          sx={{ flexGrow: 1, minWidth: "200px" }}
          disabled={isAdding}
        />
        <FormControl size="small" sx={{ minWidth: 200 }} disabled={isAdding}>
          <InputLabel id="add-parent-payee-label">Parent Payee</InputLabel>
          <Select
            labelId="add-parent-payee-label"
            value={newItemParentId === null ? "" : newItemParentId}
            label="Parent Payee"
            onChange={(e) =>
              setNewItemParentId(e.target.value === "" ? null : e.target.value)
            }
          >
            {addParentOptions.map((option) => (
              <MenuItem
                key={option.id || "no-parent-payee"}
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
          sx={{ height: "40px" }}
        >
          Add
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <List dense>
        {payeeTree.length === 0 && !isAdding && (
          <ListItem>
            <ListItemText primary="No rewards payees defined." />
          </ListItem>
        )}
        {payeeTree.map((node) => (
          <RenderPayeeNode
            key={node.id}
            node={node}
            level={1}
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

ManageRewardsPayeesSection.propTypes = {
  payees: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      parent_id: PropTypes.string, // Optional string or null
    })
  ).isRequired,
  onUpdate: PropTypes.func.isRequired,
};

export default ManageRewardsPayeesSection;
