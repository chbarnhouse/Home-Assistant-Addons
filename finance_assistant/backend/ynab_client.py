import ynab_api
from ynab_api.api import accounts_api, budgets_api, transactions_api, user_api, scheduled_transactions_api, categories_api, payees_api
from ynab_api.model.save_transaction import SaveTransaction
from ynab_api.model.update_transaction import UpdateTransaction
import logging
from datetime import datetime
import json

from .config import config

_LOGGER = logging.getLogger(__name__)

# Monkey patch YNAB API client to handle newer goal_type values
# The client library only supports ['TB', 'TBD', 'MF', 'NEED', None]
# but YNAB has added 'DEBT' which causes errors
try:
    from ynab_api.model.category import Category
    # If allowed_values is a property and has a 'goal_type' key, update it
    if hasattr(Category, 'allowed_values') and 'goal_type' in getattr(Category, 'allowed_values', {}):
        if 'DEBT' not in Category.allowed_values['goal_type']:
            _LOGGER.info("Adding 'DEBT' to allowed goal_type values")
            # Add 'DEBT' to the allowed values
            Category.allowed_values['goal_type'].append('DEBT')
    else:
        _LOGGER.warning("Could not add 'DEBT' to allowed goal_type values, structure differs from expected")
except Exception as e:
    _LOGGER.warning(f"Failed to monkey patch YNAB API for goal_type: {e}")

class YNABClient:
    def __init__(self):
        self._configuration = None
        self._api_client = None
        self.budget_id = config.ynab_budget_id
        self._setup_client()

    def _setup_client(self):
        if not config.ynab_api_key or not self.budget_id:
            print("YNAB API Key or Budget ID is missing.")
            return

        # Ensure API key is clean (no Bearer prefix)
        api_key = config.ynab_api_key.strip()
        if api_key.startswith('Bearer '):
            api_key = api_key[7:].strip()
            _LOGGER.debug("Removed 'Bearer ' prefix from API key")

        # Debug key length and format (without revealing the full key)
        key_len = len(api_key)
        key_start = api_key[:4] if key_len >= 4 else ""
        key_end = api_key[-4:] if key_len >= 4 else ""
        _LOGGER.debug(f"API key length: {key_len}, format: {key_start}...{key_end}")

        try:
            # Create configuration
            self._configuration = ynab_api.Configuration(host="https://api.ynab.com/v1")

            # Create API client with direct header configuration
            self._api_client = ynab_api.ApiClient(self._configuration)

            # Set authorization header directly on the client
            self._api_client.default_headers['Authorization'] = f'Bearer {api_key}'
            _LOGGER.debug(f"Using Authorization header: Bearer {api_key[:4]}...{api_key[-4:]}")

            # Remove any config-level settings to avoid potential duplication
            if 'Authorization' in self._configuration.api_key:
                del self._configuration.api_key['Authorization']

            # Test the connection by making a simple API call (get_user is simpler)
            _LOGGER.debug("Attempting test connection to YNAB API using get_user()...")
            user_api_instance = user_api.UserApi(self._api_client)
            try:
                user_response = user_api_instance.get_user()
                user_id = user_response.data.user.id
                _LOGGER.debug(f"Successfully connected to YNAB API. User ID: {user_id}")
                # Now that connection is confirmed, we assume the client is configured
                # Subsequent calls will handle specific budget/account errors if they occur

            except ynab_api.ApiException as api_exc:
                 _LOGGER.error(f"YNAB API error during initial user fetch: {api_exc}")
                 _LOGGER.error(f"API Response Headers: {api_exc.headers if hasattr(api_exc, 'headers') else 'No headers'}")
                 _LOGGER.error(f"API Response Body: {api_exc.body if hasattr(api_exc, 'body') else 'No body'}")
                 self._api_client = None # Mark client as not configured on API error
            except Exception as test_exc:
                 # Catch any other exception during the user fetch
                 _LOGGER.error(f"Unexpected error during initial user fetch: {test_exc}")
                 self._api_client = None # Mark client as not configured

        except Exception as setup_exc:
            # Catch errors during the broader setup (config, client creation)
            _LOGGER.error(f"Unexpected error during YNAB client setup: {setup_exc}")
            self._api_client = None

        # Final check if client is configured
        if not self.is_configured():
             _LOGGER.warning("YNAB client initialization failed. Client is not configured.")

    def is_configured(self):
        return bool(self._api_client)

    # --- Budgets API ---
    def get_budgets(self):
        if not self.is_configured(): return None
        budgets_api_instance = budgets_api.BudgetsApi(self._api_client)
        try:
            api_response = budgets_api_instance.get_budgets(include_accounts=False)
            return api_response.data.budgets
        except ynab_api.ApiException as e:
            _LOGGER.error(f"Exception when calling BudgetsApi->get_budgets: {e}")
            return None

    def get_budget_settings(self):
        if not self.is_configured(): return None
        budgets_api_instance = budgets_api.BudgetsApi(self._api_client)
        try:
            api_response = budgets_api_instance.get_budget_settings_by_id(self.budget_id)
            return api_response.data.settings
        except ynab_api.ApiException as e:
            _LOGGER.error(f"Exception when calling BudgetsApi->get_budget_settings_by_id: {e}")
            return None

    # --- Accounts API ---
    def get_accounts(self):
        if not self.is_configured(): return None
        accounts_api_instance = accounts_api.AccountsApi(self._api_client)
        try:
            api_response = accounts_api_instance.get_accounts(self.budget_id)
            # Filter out closed accounts
            active_accounts = [acc for acc in api_response.data.accounts if not acc.closed]
            return active_accounts
        except ynab_api.ApiException as e:
            _LOGGER.error(f"Exception when calling AccountsApi->get_accounts: {e}")
            return None

    def get_account_by_id(self, account_id):
        if not self.is_configured(): return None
        accounts_api_instance = accounts_api.AccountsApi(self._api_client)
        try:
            api_response = accounts_api_instance.get_account_by_id(self.budget_id, account_id)
            return api_response.data.account
        except ynab_api.ApiException as e:
            _LOGGER.error(f"Exception when calling AccountsApi->get_account_by_id: {e}")
            return None

    # --- Transactions API ---
    def get_transactions(self, since_date=None):
        """Fetches transactions for the configured budget, optionally filtered by date."""
        if not self.is_configured():
            return None

        transactions_api_instance = transactions_api.TransactionsApi(self._api_client)
        try:
            # Prepare parameters
            kwargs = {}
            if since_date:
                kwargs["since_date"] = since_date

            _LOGGER.debug(f"Fetching transactions since: {kwargs.get('since_date', 'beginning')}")

            # Call the YNAB API with the configured budget_id
            api_response = transactions_api_instance.get_transactions(self.budget_id, **kwargs)

            # Return the list of transactions
            return api_response.data.transactions

        except ynab_api.ApiException as e:
            _LOGGER.error(f"Exception when calling TransactionsApi->get_transactions: {e}")
            return None
        except Exception as e:
            _LOGGER.error(f"Unexpected error in get_transactions: {e}")
            return None

    def get_transactions_by_account(self, account_id, since_date=None):
        if not self.is_configured(): return None
        transactions_api_instance = transactions_api.TransactionsApi(self._api_client)
        try:
            api_response = transactions_api_instance.get_transactions_by_account(self.budget_id, account_id, since_date=since_date)
            return api_response.data.transactions
        except ynab_api.ApiException as e:
            _LOGGER.error(f"Exception when calling TransactionsApi->get_transactions_by_account: {e}")
            return None

    def create_transaction(self, account_id, date, amount, payee_id=None, payee_name=None, memo=None):
        if not self.is_configured(): return None
        transactions_api_instance = transactions_api.TransactionsApi(self._api_client)
        transaction = SaveTransaction(
            account_id=account_id,
            date=date, # Format: "YYYY-MM-DD"
            amount=amount, # Amount in milliunits (amount * 1000)
            payee_id=payee_id,
            payee_name=payee_name, # Max 50 chars
            memo=memo # Max 200 chars
            # Add other fields like category_id, cleared, approved, flag_color if needed
        )
        body = ynab_api.SaveTransactionsWrapper(transaction=transaction) # SaveTransactionsWrapper | The transaction or transactions to create. Single transaction specified as {"transaction": transaction} or multiple within {"transactions": [transaction_1, transaction_2, ...]}
        try:
            api_response = transactions_api_instance.create_transaction(self.budget_id, body)
            return api_response.data
        except ynab_api.ApiException as e:
            _LOGGER.error(f"Exception when calling TransactionsApi->create_transaction: {e}")
            return None

    def update_transaction(self, transaction_id, account_id, date, amount, payee_id=None, payee_name=None, memo=None):
        if not self.is_configured(): return None
        transactions_api_instance = transactions_api.TransactionsApi(self._api_client)
        transaction = UpdateTransaction(
            account_id=account_id,
            date=date, # Format: "YYYY-MM-DD"
            amount=amount, # Amount in milliunits (amount * 1000)
            payee_id=payee_id,
            payee_name=payee_name, # Max 50 chars
            memo=memo # Max 200 chars
            # Add other fields like category_id, cleared, approved, flag_color if needed
        )
        body = ynab_api.UpdateTransactionsWrapper(transaction=transaction)
        try:
            api_response = transactions_api_instance.update_transaction(self.budget_id, transaction_id, body)
            return api_response.data
        except ynab_api.ApiException as e:
            _LOGGER.error(f"Exception when calling TransactionsApi->update_transaction: {e}")
            return None

    def get_scheduled_transactions(self):
        """Fetches scheduled transactions for the configured budget."""
        if not self.is_configured():
            return None

        scheduled_transactions_api_instance = scheduled_transactions_api.ScheduledTransactionsApi(self._api_client)
        try:
            # Call the YNAB API with the configured budget_id
            _LOGGER.debug(f"Fetching scheduled transactions for budget")
            api_response = scheduled_transactions_api_instance.get_scheduled_transactions(self.budget_id)

            # Return the list of scheduled transactions
            return api_response.data.scheduled_transactions

        except ynab_api.ApiException as e:
            _LOGGER.error(f"Exception when calling ScheduledTransactionsApi->get_scheduled_transactions: {e}")
            return None
        except Exception as e:
            _LOGGER.error(f"Unexpected error in get_scheduled_transactions: {e}")
            # Try to create a sample empty list as a fallback
            return []

    # --- REMOVED Categories API ---
    # def get_categories(self):
    #     """Fetches categories for the configured budget."""
    #     # ... (implementation removed) ...

    # --- REMOVED Payees API ---
    # def get_payees(self):
    #     """Fetches payees for the configured budget."""
    #     # ... (implementation removed) ...

# --- Add other API interactions as needed (Categories, Payees, etc.) ---

# Global YNAB client instance
ynab_client = YNABClient()