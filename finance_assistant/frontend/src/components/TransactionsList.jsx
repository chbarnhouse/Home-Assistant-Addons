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
    Grid,
    Tooltip,
    IconButton
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { formatCurrency, formatDate } from '../utils/formatters'; // Assuming formatters exist

/**
 * Displays a list of YNAB transactions.
 * Needs account/payee/category names resolved from IDs ideally.
 * @param {object} props - Component props.
 * @param {Array<object>} props.transactions - Array of transaction objects.
 * @param {boolean} props.isLoading - Indicates if data is loading.
 * @param {Error|null} props.error - Any error object if fetching failed.
 * @param {object} props.accountsMap - Map of account ID to account name (for display).
 * @param {object} props.payeesMap - Map of payee ID to payee name (for display).
 * @param {object} props.categoriesMap - Map of category ID to category name (for display).
 * @param {function} props.onEdit - Callback function when edit button is clicked, passed the transaction object.
 * @param {function} props.onDelete - Callback function when delete button is clicked, passed the transaction id.
 */
const TransactionsList = ({
    transactions = [],
    isLoading = false,
    error = null,
    accountsMap = {},
    payeesMap = {},
    categoriesMap = {},
    onEdit = () => {},
    onDelete = () => {},
}) => {

    if (isLoading) {
        return (
            <Box display=\"flex\" justifyContent=\"center\" alignItems=\"center\" minHeight=\"100px\">
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return (
            <Paper elevation={1} sx={{ p: 2, mb: 2, backgroundColor: 'error.light' }}>
                <Typography color=\"error.contrastText\">
                    Error loading transactions: {error.message || 'Unknown error'}
                </Typography>
            </Paper>
        );
    }

    if (!transactions || transactions.length === 0) {
        return (
            <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
                <Typography>No YNAB transactions found or loaded.</Typography>
            </Paper>
        );
    }

    // Sort transactions by date descending (most recent first)
    const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

    return (
        <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
            <Typography variant=\"h6\" gutterBottom>
                YNAB Transactions
            </Typography>
            <List dense>
                {sortedTransactions.map((t) => {
                    const payeeName = payeesMap[t.payee_id] || t.payee_name || 'Unknown Payee';
                    const categoryName = categoriesMap[t.category_id] || 'Uncategorized';
                    const accountName = accountsMap[t.account_id] || 'Unknown Account';
                    const isOutflow = t.amount < 0;
                    const currencyColor = isOutflow ? 'error.main' : 'success.main';

                    return (
                        <ListItem
                            key={t.id}
                            divider
                            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', py: 1.5 }}
                        >
                            <Box sx={{ flexGrow: 1, mr: 2 }}>
                                <Typography variant=\"body1\" component=\"div\" fontWeight=\"medium\">
                                    {payeeName}
                                </Typography>
                                <Typography variant=\"body2\" color=\"text.secondary\" component=\"div\">
                                    {categoryName} ({accountName})
                                </Typography>
                            </Box>
                            <Box sx={{ textAlign: 'right' }}>
                                <Typography variant=\"body1\" fontWeight=\"medium\" color={currencyColor} component=\"div\">
                                    {formatCurrency(t.amount)}
                                </Typography>
                                <Typography variant=\"body2\" color=\"text.secondary\" component=\"div\">
                                    {formatDate(t.date)}
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                                <Tooltip title=\"Edit Transaction\">
                                    <IconButton size=\"small\" onClick={() => onEdit(t)}>
                                        <EditIcon fontSize=\"small\" />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title=\"Delete Transaction\">
                                    <IconButton size=\"small\" onClick={() => onDelete(t.id)} sx={{ color: 'error.main'}}>
                                        <DeleteIcon fontSize=\"small\" />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        </ListItem>
                    );
                })}
            </List>
        </Paper>
    );
};

TransactionsList.propTypes = {
    transactions: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        date: PropTypes.string.isRequired,
        amount: PropTypes.number.isRequired, // milliunits
        payee_id: PropTypes.string,
        payee_name: PropTypes.string, // Can be null if payee_id exists
        category_id: PropTypes.string,
        account_id: PropTypes.string.isRequired,
        // Add other fields like memo, cleared, approved, flag_color etc. as needed
    })),
    isLoading: PropTypes.bool,
    error: PropTypes.object,
    accountsMap: PropTypes.objectOf(PropTypes.string),
    payeesMap: PropTypes.objectOf(PropTypes.string),
    categoriesMap: PropTypes.objectOf(PropTypes.string),
    onEdit: PropTypes.func,
    onDelete: PropTypes.func,
};

export default TransactionsList;