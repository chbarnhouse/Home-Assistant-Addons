import React from 'react';
import PropTypes from 'prop-types';
import {
    List,
    ListItem,
    ListItemText,
    Typography,
    Paper,
    Box,
    CircularProgress,
    Tooltip
} from '@mui/material';
import { formatCurrency } from '../utils/formatters'; // Assuming a currency formatter utility exists

/**
 * Displays a list of YNAB categories with budget and balance details.
 * @param {object} props - Component props.
 * @param {Array<object>} props.categories - Array of category objects.
 * @param {boolean} props.isLoading - Indicates if data is loading.
 * @param {Error|null} props.error - Any error object if fetching failed.
 */
const CategoriesList = ({ categories = [], isLoading = false, error = null }) => {
    if (isLoading) {
        return (
            <Box display=\"flex\" justifyContent=\"center\" alignItems=\"center\" minHeight=\"100px\">
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return (
            <Paper elevation={3} sx={{ p: 2, mb: 2, backgroundColor: 'error.light' }}>
                <Typography color=\"error.contrastText\">
                    Error loading categories: {error.message || 'Unknown error'}
                </Typography>
            </Paper>
        );
    }

    if (!categories || categories.length === 0) {
        return (
            <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
                <Typography>No YNAB categories found or loaded.</Typography>
            </Paper>
        );
    }

    // Group categories by group name if available (assuming structure from get_categories)
    // This assumes the backend sends the flattened list as planned in get_all_data
    // If the backend sends grouped categories, this needs adjustment.
    // For now, just display the flat list.

    return (
        <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
            <Typography variant=\"h6\" gutterBottom>
                YNAB Categories
            </Typography>
            <List dense>
                {categories.map((category) => (
                    <ListItem
                        key={category.id}
                        secondaryAction={
                            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                <Tooltip title=\"Budgeted\"><Typography variant=\"body2\" color=\"text.secondary\">{formatCurrency(category.budgeted)}</Typography></Tooltip>
                                <Tooltip title=\"Balance\"><Typography variant=\"body2\" color={category.balance < 0 ? 'error.main' : 'success.main'}>{formatCurrency(category.balance)}</Typography></Tooltip>
                            </Box>
                        }
                    >
                        <ListItemText primary={category.name} />
                    </ListItem>
                ))}
            </List>
        </Paper>
    );
};

CategoriesList.propTypes = {
    categories: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string.isRequired,
        budgeted: PropTypes.number, // Expecting milliunits
        balance: PropTypes.number,  // Expecting milliunits
        // Add other expected category properties here
    })),
    isLoading: PropTypes.bool,
    error: PropTypes.object, // Could be more specific, e.g., PropTypes.instanceOf(Error)
};

export default CategoriesList;