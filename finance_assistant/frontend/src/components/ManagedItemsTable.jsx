import React from 'react';
import PropTypes from 'prop-types';
import { Box, Typography, CircularProgress, Alert, Paper } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';

/**
 * A reusable DataGrid component for displaying lists of managed items
 * with loading and error handling.
 */
const ManagedItemsTable = ({
    data = [],
    columns = [],
    loading = false,
    error = null,
    itemType = 'item', // Generic item type for messages
    refreshData = () => {}, // Optional refresh function
    onEditItem = null, // Optional callback for edit action column
    onDeleteItem = null, // Optional callback for delete action column
    // Add other DataGrid props as needed (e.g., sorting, filtering)
}) => {

    // Add action columns if handlers are provided
    const augmentedColumns = [...columns];
    // Example of adding generic edit/delete if handlers exist and column isn't already there
    // This might need more sophisticated logic based on actual column definitions passed
    // For now, we assume the calling component defines the action column if needed,
    // like AccountsPage already does.

    // --- Loading State ---
    if (loading) {
        return (
            <Box display=\"flex\" justifyContent=\"center\" alignItems=\"center\" minHeight=\"200px\">
                <CircularProgress />
                <Typography sx={{ ml: 2 }}>Loading {itemType}s...</Typography>
            </Box>
        );
    }

    // --- Error State ---
    if (error) {
        return (
            <Alert severity=\"error\" sx={{ my: 2 }}>
                Error loading {itemType}s: {error.message || 'Unknown error'}
                {typeof refreshData === 'function' && (
                    <Button onClick={refreshData} size=\"small\" sx={{ ml: 1 }}>Retry</Button>
                )}
            </Alert>
        );
    }

    // --- No Data State ---
    if (!data || data.length === 0) {
        return (
            <Paper elevation={1} sx={{ p: 2, textAlign: 'center' }}>
                <Typography color=\"text.secondary\">No {itemType}s found.</Typography>
            </Paper>
        );
    }

    // --- Data Grid ---
    return (
        <Paper sx={{ height: 400, width: '100%' }}> {/* Adjust height as needed */}
            <DataGrid
                rows={data} // Expect rows to have unique 'id' property
                columns={augmentedColumns}
                loading={loading} // Pass loading state to DataGrid internal indicator
                initialState={{
                    pagination: { paginationModel: { pageSize: 10 } },
                    // Add default sorting if applicable
                    // sorting: { sortModel: [{ field: 'name', sort: 'asc' }] },
                }}
                pageSizeOptions={[5, 10, 25]}
                disableRowSelectionOnClick
                density=\"compact\"
                sx={{ border: 0 }} // Remove default border if inside Paper
                // Handle potential missing ID issues gracefully
                getRowId={(row) => row.id ?? Math.random()} // Fallback ID generation
            />
        </Paper>
    );
};

ManagedItemsTable.propTypes = {
    data: PropTypes.array.isRequired,
    columns: PropTypes.array.isRequired,
    loading: PropTypes.bool,
    error: PropTypes.object,
    itemType: PropTypes.string,
    refreshData: PropTypes.func,
    onEditItem: PropTypes.func,
    onDeleteItem: PropTypes.func,
};

export default ManagedItemsTable;