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
} from '@mui/material';

/**
 * Displays a list of YNAB payees.
 * @param {object} props - Component props.
 * @param {Array<object>} props.payees - Array of payee objects.
 * @param {boolean} props.isLoading - Indicates if data is loading.
 * @param {Error|null} props.error - Any error object if fetching failed.
 */
const PayeesList = ({ payees = [], isLoading = false, error = null }) => {
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
                    Error loading payees: {error.message || 'Unknown error'}
                </Typography>
            </Paper>
        );
    }

    if (!payees || payees.length === 0) {
        return (
            <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
                <Typography>No YNAB payees found or loaded.</Typography>
            </Paper>
        );
    }

    return (
        <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
            <Typography variant=\"h6\" gutterBottom>
                YNAB Payees
            </Typography>
            <List dense>
                {payees.map((payee) => (
                    <ListItem key={payee.id}>
                        <ListItemText primary={payee.name} />
                        {/* Can add transfer_account_id or other details later if needed */}
                    </ListItem>
                ))}
            </List>
        </Paper>
    );
};

PayeesList.propTypes = {
    payees: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string.isRequired,
        // transfer_account_id: PropTypes.string, // Optional
    })),
    isLoading: PropTypes.bool,
    error: PropTypes.object,
};

export default PayeesList;