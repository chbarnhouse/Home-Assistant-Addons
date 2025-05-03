import React, { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import AddIcon from "@mui/icons-material/Add";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { DataGrid } from "@mui/x-data-grid";
import AddAssetModal from "../components/AddAssetModal";
import EditAssetModal from "../components/EditAssetModal";
import ManageBanksModal from "../components/ManageBanksModal";
import SettingsIcon from "@mui/icons-material/Settings";
import Alert from "@mui/material/Alert";
import { useSnackbar } from "../context/SnackbarContext";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { fetchAllData, callApi } from "../utils/api";

// Define API endpoints
const ASSETS_API = "assets";

// Remove Dummy data
// const dummyAssets = [...];

function AssetsPage() {
  const [assets, setAssets] = useState([]);
  const [assetTypes, setAssetTypes] = useState([]);
  const [banks, setBanks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const { notify } = useSnackbar();

  // Modal States
  const [openAddModal, setOpenAddModal] = useState(false);
  const [openEditModal, setOpenEditModal] = useState(false);
  const [assetToEdit, setAssetToEdit] = useState(null);

  // Action States
  const [deletingAssetId, setDeletingAssetId] = useState(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch assets function
  const fetchAssets = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchAllData();
      console.log("Received all_data for assets page:", data);

      // IMPORTANT: Add defensive checks to ensure data exists and has expected shape
      if (!data || typeof data !== "object") {
        throw new Error("Invalid data format received from API");
      }

      // Ensure all assets have a unique ID for DataGrid, safely handle possible undefined values
      const assetsArray = Array.isArray(data.assets) ? data.assets : [];
      console.log("Raw assets data:", assetsArray);
      const currentAssetTypes = Array.isArray(data.asset_types)
        ? data.asset_types
        : []; // Use fetched data directly
      const currentBanks = Array.isArray(data.banks) ? data.banks : []; // Use fetched data directly

      const processedAssets = assetsArray.map((asset, index) => {
        // Ensure asset is an object
        const assetObj = asset || {};
        console.log(`Processing asset #${index}:`, assetObj);
        const isYnab = !!assetObj.is_ynab;

        // Get name
        const name = assetObj.name || `Asset ${index + 1}`;

        // Find bank name from ID using the fetched data
        const bankObj = currentBanks.find(
          (b) => b && b.id === assetObj.bank_id
        );
        const bankName = bankObj ? bankObj.name : assetObj.bank || "N/A";

        // YNAB assets store value in milliunits, manual assets use 'value' directly
        let currentValueInDollars = null;
        if (isYnab && typeof assetObj.balance === "number") {
          currentValueInDollars = assetObj.balance / 1000.0; // Convert from milliunits
        } else if (!isYnab) {
          // Handle manual asset value fields
          if (typeof assetObj.balance === "number") {
            currentValueInDollars = assetObj.balance;
          } else if (typeof assetObj.value === "number") {
            currentValueInDollars = assetObj.value;
          } else if (typeof assetObj.current_value === "number") {
            currentValueInDollars = assetObj.current_value;
          }
        } else {
          console.warn(
            `[YNAB Asset ${index}] Missing or invalid balance field:`,
            assetObj.balance
          );
        }

        // Extract the last updated date
        const lastUpdated =
          assetObj.value_last_updated ||
          assetObj.last_modified_on ||
          assetObj.updated_at ||
          new Date().toISOString();

        // --- Add logic to extract shares and entity_id --- NEW ---
        const shares = assetObj.shares || null;
        const entityId = assetObj.entity_id || null;
        // --- End logic --- NEW ---

        // Spread original object FIRST, then override specific fields
        const processedAsset = {
          ...assetObj, // Keep all original fields like type_id and ynab_type
          id: assetObj.id || `asset-${Date.now()}-${index}`,
          name: name,
          bank: bankName,
          value: currentValueInDollars,
          value_updated_at: lastUpdated,
          is_ynab: isYnab,
          shares: shares, // Add shares to processed data
          entity_id: entityId, // Add entity_id to processed data
        };
        console.log(`Processed asset #${index} result:`, processedAsset);
        return processedAsset;
      });

      setAssets(processedAssets);
      setBanks(currentBanks); // Update state after processing
      setAssetTypes(currentAssetTypes); // Update state after processing
      setError(null);
    } catch (err) {
      console.error("Error fetching assets:", err);
      setError("Failed to load assets. Please try again later.");
      setAssets([]);
      setBanks([]);
      setAssetTypes([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // --- Action Handlers ---
  const handleOpenAddModal = () => setOpenAddModal(true);
  const handleCloseAddModal = () => setOpenAddModal(false);
  const handleAddAsset = (newAsset) => {
    setAssets((prevAssets) => [...prevAssets, newAsset]);
    setError(null);
    notify("Asset added successfully!", "success");
    fetchAssets();
  };

  const handleOpenEditModal = (asset) => {
    // Allow opening modal for all assets (YNAB or manual)
    // The modal itself will handle fetching/saving manual details
    // if (asset.is_ynab) {
    //   notify(
    //     "Editing YNAB-linked assets requires specific handling (e.g., for stock reconciliation) and is not done through this form.",
    //     "info"
    //   );
    //   return; // Do not open the modal
    // }
    setAssetToEdit(asset);
    setOpenEditModal(true);
  };

  const handleCloseEditModal = () => {
    setOpenEditModal(false);
    setAssetToEdit(null);
  };

  const handleUpdateAsset = (updatedAsset) => {
    // Re-derive the type name from the type_id provided by the backend
    const typeObj = assetTypes.find((t) => t && t.id === updatedAsset.type_id);
    const typeName = typeObj ? typeObj.name : updatedAsset.type || "Unknown";
    const bankObj = banks.find((b) => b && b.id === updatedAsset.bank_id);
    const bankName = bankObj ? bankObj.name : updatedAsset.bank || "N/A";

    const processedUpdate = {
      ...updatedAsset,
      bank: bankName, // Use the derived bank name
    };

    setAssets((prevAssets) =>
      prevAssets.map(
        (asset) => (asset.id === processedUpdate.id ? processedUpdate : asset) // Use the processed object
      )
    );
    setError(null);
    notify("Asset updated successfully!", "success");
    // fetchAssets(); // Keep removed
  };

  // Helper to format date/time
  const formatDateTime = (isoString) => {
    if (!isoString) return "N/A";
    try {
      return new Date(isoString).toLocaleString();
    } catch (e) {
      return "Invalid Date";
    }
  };

  const formatCurrency = (value) => {
    if (value == null || value === "" || isNaN(value)) return "N/A";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  const getDisplayName = (asset) => {
    return asset.name || `${asset.type}${asset.bank ? ` - ${asset.bank}` : ""}`;
  };

  // --- Delete Handlers ---
  const handleOpenDeleteConfirm = (asset) => {
    setAssetToDelete(asset);
    setIsDeleteConfirmOpen(true);
  };

  const handleCloseDeleteConfirm = () => {
    setAssetToDelete(null);
    setIsDeleteConfirmOpen(false);
    setIsDeleting(false);
  };

  const handleDeleteConfirmed = async () => {
    if (!assetToDelete) return;

    setIsDeleting(true);
    try {
      await callApi(`${ASSETS_API}/${assetToDelete.id}`, {
        method: "DELETE",
      });

      setAssets((prev) =>
        prev.filter((asset) => asset.id !== assetToDelete.id)
      );
      notify("Asset deleted successfully!", "success");
      handleCloseDeleteConfirm();
    } catch (err) {
      console.error("Error deleting asset:", err);
      notify(err.message || "Failed to delete asset.", "error");
    } finally {
      setIsDeleting(false);
    }
  };
  // --- End Delete Handlers ---

  // Define DataGrid columns
  const columns = [
    {
      field: "name",
      headerName: "Asset Name",
      minWidth: 180,
      flex: 1.5,
      renderCell: (params) => {
        if (!params || !params.row) return "N/A";
        return params.row.name || "Unnamed Asset";
      },
    },
    {
      field: "type",
      headerName: "Type",
      minWidth: 150,
      flex: 1,
      renderCell: (params) => {
        if (!params.row) return "N/A"; // Safety check

        // Find the managed asset type object using the asset's type_id
        const managedType = assetTypes.find(
          (type) => type && type.id === params.row.type_id
        );

        // Display the managed name if found, otherwise fall back to the raw type from the row, or N/A
        return managedType ? managedType.name : params.row.type || "N/A";
      },
    },
    {
      field: "bank",
      headerName: "Bank/Brokerage",
      minWidth: 180,
      flex: 1,
      renderCell: (params) => {
        if (!params || !params.row) return "N/A";
        return params.row.bank || "N/A";
      },
    },
    {
      field: "value",
      headerName: "Current Value",
      type: "number",
      width: 150,
      valueGetter: (params) => params?.row?.value ?? null,
      renderCell: (params) => formatCurrency(params?.row?.value),
    },
    {
      field: "shares", // NEW Column
      headerName: "Shares",
      type: "number",
      width: 100,
      valueGetter: (params) => params?.row?.shares ?? null,
      renderCell: (params) => params?.row?.shares ?? "N/A",
      align: "right",
      headerAlign: "right",
    },
    {
      field: "entity_id", // NEW Column
      headerName: "Linked Entity ID",
      width: 250,
      valueGetter: (params) => params?.row?.entity_id ?? "N/A",
      renderCell: (params) => params?.row?.entity_id ?? "N/A",
    },
    {
      field: "value_updated_at",
      headerName: "Value Last Updated",
      minWidth: 200,
      flex: 1.2,
      renderCell: (params) => {
        if (!params || !params.row || !params.row.value_updated_at)
          return "N/A";
        return formatDateTime(params.row.value_updated_at);
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 120,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      align: "center",
      headerAlign: "center",
      renderCell: (params) => {
        if (!params || !params.row) return null;

        const asset = params.row;
        const isRowDeleting = deletingAssetId === asset.id;
        const isRowEditing = assetToEdit?.id === asset.id;
        const disabled = isRowDeleting || isRowEditing || isDeleting;

        return (
          <Box>
            <IconButton
              color="primary"
              onClick={() => handleOpenEditModal(asset)}
              disabled={disabled}
              size="small"
              sx={{ mr: 1 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              color="error"
              onClick={() => handleOpenDeleteConfirm(asset)}
              disabled={disabled}
              size="small"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        );
      },
    },
  ];

  return (
    <Box sx={{ height: "calc(100vh - 160px)", width: "100%" }}>
      {/* Top Bar */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography variant="h5" component="h1">
          Assets
        </Typography>
        <Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenAddModal}
            sx={{ mr: 1 }}
          >
            Add Asset
          </Button>
        </Box>
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

      {/* DataGrid instead of Table */}
      {!isLoading && (
        <Box sx={{ height: "100%", width: "100%" }}>
          <DataGrid
            rows={assets}
            columns={columns}
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: {
                paginationModel: { pageSize: 25, page: 0 },
              },
              sorting: {
                sortModel: [{ field: "name", sort: "asc" }],
              },
            }}
            disableRowSelectionOnClick
            getRowHeight={() => "auto"}
            getEstimatedRowHeight={() => 60}
            localeText={{
              noRowsLabel:
                assets.length === 0
                  ? error
                    ? "Assets could not be loaded."
                    : "No assets found."
                  : "No rows",
            }}
          />
        </Box>
      )}

      {/* Add Asset Modal */}
      <AddAssetModal
        open={openAddModal}
        onClose={handleCloseAddModal}
        onAdd={handleAddAsset}
        assetTypes={assetTypes}
        banks={banks}
      />

      {/* Edit Asset Modal */}
      {assetToEdit && (
        <EditAssetModal
          open={openEditModal}
          onClose={handleCloseEditModal}
          assetToEdit={assetToEdit}
          onUpdateAsset={handleUpdateAsset}
          assetTypes={assetTypes}
          banks={banks}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={isDeleteConfirmOpen}
        onClose={handleCloseDeleteConfirm}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">
          {"Confirm Asset Deletion"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            Are you sure you want to delete{" "}
            {assetToDelete ? getDisplayName(assetToDelete) : "this asset"}?
            <br />
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCloseDeleteConfirm}
            color="primary"
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirmed}
            color="error"
            autoFocus
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default AssetsPage;
