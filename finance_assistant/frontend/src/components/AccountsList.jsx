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
import { formatCurrency } from '../utils/formatters'; // Assuming currency formatter exists

/**
 * Displays a list of YNAB accounts with balance.
 * @param {object} props - Component props.
 * @param {Array<object>} props.accounts - Array of account objects (expecting combined accounts from backend).
 * @param {boolean} props.isLoading - Indicates if data is loading.
 * @param {Error|null} props.error - Any error object if fetching failed.
 */
const AccountsList = ({ accounts = [], isLoading = false, error = null }) => {

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
                    Error loading accounts: {error.message || 'Unknown error'}
                </Typography>
            </Paper>
        );
    }

    // Filter out closed accounts if not already done by backend
    const openAccounts = accounts.filter(acc => !acc.closed && !acc.deleted);

    if (!openAccounts || openAccounts.length === 0) {
        return (
            <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
                <Typography>No open YNAB accounts found or loaded.</Typography>
            </Paper>
        );
    }

    // Sort accounts maybe? By type then name?
    const sortedAccounts = [...openAccounts].sort((a, b) => {
        if (a.type !== b.type) {
            return (a.type || '').localeCompare(b.type || '');
        }
        return (a.name || '').localeCompare(b.name || '');
    });

    return (
        <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
            <Typography variant=\"h6\" gutterBottom>
                YNAB Accounts
            </Typography>
            <List dense>
                {sortedAccounts.map((account) => {
                    const balanceColor = account.balance < 0 ? 'error.main' : 'text.primary';
                    return (
                        <ListItem
                            key={account.id}
                            divider
                            secondaryAction={
                                <Tooltip title=\"Current Balance\">
                                    <Typography variant=\"body1\" fontWeight=\"medium\" color={balanceColor}>
                                        {formatCurrency(account.balance)}
                                    </Typography>
                                </Tooltip>
                            }
                        >
                            <ListItemText
                                primary={account.name}
                                secondary={account.type ? `Type: ${account.type}` : ''} // Display type
                            />
                            {/* Add edit/delete buttons or link to details later */}
                        </ListItem>
                    );
                })}
            </List>
        </Paper>
    );
};

AccountsList.propTypes = {
    accounts: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string.isRequired,
        type: PropTypes.string, // YNAB account type
        closed: PropTypes.bool,
        deleted: PropTypes.bool,
        balance: PropTypes.number, // Expecting milliunits
    })),
    isLoading: PropTypes.bool,
    error: PropTypes.object,
};

export default AccountsList;