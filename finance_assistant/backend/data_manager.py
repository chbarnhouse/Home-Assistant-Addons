import json
import os
import logging
import uuid
from datetime import datetime, date
import sqlite3

_LOGGER = logging.getLogger(__name__)

DATA_DIR = "/data"
DB_FILE = os.path.join(DATA_DIR, "finance_assistant.db")

# Default types definitions for initial DB population
DEFAULT_ASSET_TYPES = [{"id": str(uuid.uuid4()), "name": "Stocks"}, {"id": str(uuid.uuid4()), "name": "Retirement Plan"}]
DEFAULT_LIABILITY_TYPES = [
    {"id": str(uuid.uuid4()), "name": "Student Loan"},
    {"id": str(uuid.uuid4()), "name": "Auto Loan"},
    {"id": str(uuid.uuid4()), "name": "Personal Loan"},
    {"id": str(uuid.uuid4()), "name": "Mortgage"}
]
DEFAULT_ACCOUNT_TYPES = [{"id": str(uuid.uuid4()), "name": "Checking"}, {"id": str(uuid.uuid4()), "name": "Savings"}, {"id": str(uuid.uuid4()), "name": "Cash"}]
DEFAULT_BANKS = [{"id": str(uuid.uuid4()), "name": "Default Bank"}]
DEFAULT_PAYMENT_METHODS = [] # Add if needed
DEFAULT_POINTS_PROGRAMS = [] # Add if needed

class DataManager:
    """Manages financial data storage using an SQLite database."""
    def __init__(self, ynab_client=None):
        self.ynab_client = ynab_client
        self.db_path = DB_FILE
        self._conn = None # Initialize connection attribute
        _LOGGER.debug(f"DataManager initialized. Using DB: {self.db_path}. YNAB client configured: {self.ynab_client is not None and self.ynab_client.is_configured()}")
        try:
            os.makedirs(DATA_DIR, exist_ok=True)
            _LOGGER.info(f"Ensured data directory exists: {DATA_DIR}")
            self._conn = self._initialize_connection() # Store the connection
        except Exception as e:
            _LOGGER.error(f"CRITICAL: Failed to create or access data directory or connect to DB {DATA_DIR}: {e}")
            raise
        if self._conn:
            self._setup_database() # Setup schema using the persistent connection
        else:
             _LOGGER.error("Database connection could not be established. Setup skipped.")

    def close_db(self):
         """Closes the database connection."""
         if self._conn:
              _LOGGER.info("Closing database connection.")
              self._conn.close()
              self._conn = None

    # --- Database Helper Methods ---
    def _initialize_connection(self):
        """Establishes and configures the persistent database connection."""
        conn = None
        try:
            conn = sqlite3.connect(self.db_path, check_same_thread=False) # Allow access from different threads (Flask requests)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON;")
            conn.execute("PRAGMA journal_mode=WAL;")
            _LOGGER.debug(f"Successfully connected to database and configured: {self.db_path}")
            return conn
        except sqlite3.Error as e:
            _LOGGER.error(f"Error connecting to database {self.db_path}: {e}", exc_info=True)
            if conn: conn.close()
            return None # Return None on failure

    def _execute_query(self, query, params=(), fetch_one=False, fetch_all=False, commit=False):
        """Executes a given SQL query with parameters using the persistent connection."""
        if not self._conn:
             _LOGGER.error("Database connection is not available.")
             return None

        cursor = None # Initialize cursor to None
        try:
            cursor = self._conn.cursor() # Use the instance connection
            cursor.execute(query, params)
            if commit:
                self._conn.commit() # Commit on the instance connection
                return cursor.rowcount # Return affected rows for commit operations
            elif fetch_one:
                row = cursor.fetchone()
                return dict(row) if row else None
            elif fetch_all:
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
            else: # Correctly indented else for try block
                # For execute without commit/fetch (like CREATE TABLE)
                return None
        except sqlite3.Error as e: # Correctly aligned except
            _LOGGER.error(f"Database error executing query: {query} with params {params} - {e}", exc_info=True)
            if commit: self._conn.rollback()
            # Re-raise specific errors if needed (e.g., IntegrityError for duplicate checks)
            if isinstance(e, sqlite3.IntegrityError):
                 raise e
            return None # Indicate error for fetches/non-commit execute
        finally: # Correctly aligned finally
            pass # No need to close connection in finally

    def _setup_database(self):
        """Creates necessary tables if they don't exist and inserts defaults using the persistent connection."""
        if not self._conn:
             _LOGGER.error("Cannot setup database schema, no connection.")
             return
        _LOGGER.info("Setting up database schema...")
        cursor = self._conn.cursor() # Use instance connection
        try:
            # Settings
            cursor.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
            cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", ('use_calculated_asset_value', json.dumps(False)))
            cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", ('include_ynab_emoji', json.dumps(False)))
            # Banks
            cursor.execute("CREATE TABLE IF NOT EXISTS banks (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE)")
            cursor.executemany("INSERT OR IGNORE INTO banks (id, name) VALUES (?, ?)", [(b['id'], b['name']) for b in DEFAULT_BANKS])
            # Account Types
            cursor.execute("CREATE TABLE IF NOT EXISTS account_types (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE)")
            cursor.executemany("INSERT OR IGNORE INTO account_types (id, name) VALUES (?, ?)", [(t['id'], t['name']) for t in DEFAULT_ACCOUNT_TYPES])
            # Asset Types
            cursor.execute("CREATE TABLE IF NOT EXISTS asset_types (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE)")
            cursor.executemany("INSERT OR IGNORE INTO asset_types (id, name) VALUES (?, ?)", [(t['id'], t['name']) for t in DEFAULT_ASSET_TYPES])
            # Liability Types
            cursor.execute("CREATE TABLE IF NOT EXISTS liability_types (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE)")
            cursor.executemany("INSERT OR IGNORE INTO liability_types (id, name) VALUES (?, ?)", [(t['id'], t['name']) for t in DEFAULT_LIABILITY_TYPES])
            # Manual Assets
            cursor.execute("""CREATE TABLE IF NOT EXISTS manual_assets (
                id TEXT PRIMARY KEY, name TEXT, asset_type_id TEXT, bank_id TEXT,
                symbol TEXT, shares REAL, entity_id TEXT, last_updated TEXT,
                ynab_value_last_updated_on TEXT,
                current_value REAL,
                json_data TEXT,
                FOREIGN KEY (asset_type_id) REFERENCES asset_types (id) ON DELETE SET NULL,
                FOREIGN KEY (bank_id) REFERENCES banks (id) ON DELETE SET NULL)""")
            # Add json_data column if it doesn't exist (migration)
            try:
                cursor.execute("ALTER TABLE manual_assets ADD COLUMN json_data TEXT;")
                _LOGGER.info("Added json_data column to manual_assets table.")
            except sqlite3.OperationalError as e:
                 if "duplicate column name: json_data" in str(e):
                    _LOGGER.debug("json_data column already exists in manual_assets.") # Expected in most cases
                 else:
                    # This handles other OperationalErrors
                    _LOGGER.error(f"Error adding json_data column: {e}", exc_info=True)
            # Add current_value column if it doesn't exist (migration)
            try:
                cursor.execute("ALTER TABLE manual_assets ADD COLUMN current_value REAL;")
                _LOGGER.info("Added current_value column to manual_assets table.")
            except sqlite3.OperationalError as e:
                 if "duplicate column name: current_value" in str(e):
                    _LOGGER.debug("current_value column already exists in manual_assets.") # Expected now
                 else:
                    _LOGGER.error(f"Error adding current_value column: {e}", exc_info=True)
            # Manual Accounts
            cursor.execute("""CREATE TABLE IF NOT EXISTS manual_accounts (
                id TEXT PRIMARY KEY, bank_id TEXT, account_type_id TEXT, last_4_digits TEXT,
                include_bank_in_name BOOLEAN DEFAULT TRUE, allocation_rules TEXT, notes TEXT, last_updated TEXT,
                FOREIGN KEY (bank_id) REFERENCES banks (id) ON DELETE SET NULL,
                FOREIGN KEY (account_type_id) REFERENCES account_types (id) ON DELETE SET NULL)""")
            # Manual Liabilities
            cursor.execute("""CREATE TABLE IF NOT EXISTS manual_liabilities (
                id TEXT PRIMARY KEY, liability_type_id TEXT, bank_id TEXT, interest_rate REAL,
                start_date TEXT, notes TEXT, is_ynab BOOLEAN DEFAULT TRUE, value REAL, name TEXT, last_updated TEXT,
                FOREIGN KEY (liability_type_id) REFERENCES liability_types (id) ON DELETE SET NULL,
                FOREIGN KEY (bank_id) REFERENCES banks (id) ON DELETE SET NULL)""")
            # Payment Methods
            cursor.execute("CREATE TABLE IF NOT EXISTS payment_methods (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE)")
            # Points Programs
            cursor.execute("CREATE TABLE IF NOT EXISTS points_programs (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE)")
            # Manual Credit Cards
            cursor.execute("""CREATE TABLE IF NOT EXISTS manual_credit_cards (
                id TEXT PRIMARY KEY, card_name TEXT, bank_id TEXT,
                include_bank_in_name BOOLEAN DEFAULT TRUE, last_4_digits TEXT, expiration_date TEXT,
                auto_pay_day_1 INTEGER, auto_pay_day_2 INTEGER, credit_limit REAL, annual_fee REAL,
                payment_methods TEXT, notes TEXT, base_rate REAL DEFAULT 0.0, reward_system TEXT DEFAULT 'Cashback',
                points_program_id TEXT, reward_structure_type TEXT DEFAULT 'Static', static_rewards TEXT,
                rotating_rules TEXT, rotation_period TEXT, dynamic_tiers TEXT, activation_period TEXT,
                requires_activation BOOLEAN DEFAULT FALSE, rotating_period_status TEXT, last_updated TEXT,
                FOREIGN KEY (bank_id) REFERENCES banks (id) ON DELETE SET NULL,
                FOREIGN KEY (points_program_id) REFERENCES points_programs (id) ON DELETE SET NULL)""")
            # Managed Categories
            cursor.execute("""CREATE TABLE IF NOT EXISTS managed_categories (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT,
                FOREIGN KEY (parent_id) REFERENCES managed_categories (id) ON DELETE CASCADE)""")
            # Managed Payees
            cursor.execute("""CREATE TABLE IF NOT EXISTS managed_payees (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT,
                FOREIGN KEY (parent_id) REFERENCES managed_payees (id) ON DELETE CASCADE)""")
            # Rewards Categories
            cursor.execute("""CREATE TABLE IF NOT EXISTS rewards_categories (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT,
                FOREIGN KEY (parent_id) REFERENCES rewards_categories (id) ON DELETE CASCADE)""")
            # Rewards Payees
            cursor.execute("""CREATE TABLE IF NOT EXISTS rewards_payees (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT,
                FOREIGN KEY (parent_id) REFERENCES rewards_payees (id) ON DELETE CASCADE)""")
            # Imported YNAB Payee IDs
            cursor.execute("CREATE TABLE IF NOT EXISTS imported_ynab_payee_ids (payee_id TEXT PRIMARY KEY)")

            # TODO: Migration logic from JSON files if they exist

            self._conn.commit() # Commit directly after setup
            _LOGGER.info("Database schema setup complete.")
        except sqlite3.Error as e:
            _LOGGER.error(f"Error setting up database schema: {e}", exc_info=True)
            self._conn.rollback()
        finally:
            pass # Don't close persistent connection

    # --- Settings Management ---
    def get_setting(self, key, default=None):
        # *** REVERTING TEMPORARY DEBUGGING ***
        # _LOGGER.debug(f"[DEBUG] get_setting: Connecting separately for key '{key}'")
        # temp_conn = None
        # value_to_return = default
        # try:
        #     # Use the _initialize_connection logic but store temporarily
        #     temp_conn = sqlite3.connect(self.db_path, timeout=5) # Use standard connect
        #     temp_conn.row_factory = sqlite3.Row
        #     temp_conn.execute("PRAGMA foreign_keys = ON;")
        #     temp_conn.execute("PRAGMA journal_mode=WAL;") # Keep WAL mode consistent
        #
        #     cursor = temp_conn.cursor()
        #     cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
        #     row = cursor.fetchone()
        #     if row:
        #         try:
        #             value_to_return = json.loads(row['value']) if row['value'] is not None else default
        #             _LOGGER.debug(f"[DEBUG] get_setting: Found value '{value_to_return}' for key '{key}' using separate connection.")
        #         except (json.JSONDecodeError, TypeError) as e:
        #             _LOGGER.error(f"[DEBUG] get_setting: Error decoding JSON for key '{key}': {e}. Returning default.")
        #             value_to_return = default
        #     else:
        #          _LOGGER.debug(f"[DEBUG] get_setting: Key '{key}' not found using separate connection. Returning default.")
        #          value_to_return = default
        # except sqlite3.Error as e:
        #     _LOGGER.error(f"[DEBUG] get_setting: DB error using separate connection for key '{key}': {e}", exc_info=True)
        #     value_to_return = default # Return default on error
        # finally:
        #     if temp_conn:
        #         temp_conn.close()
        #         _LOGGER.debug(f"[DEBUG] get_setting: Closed separate connection for key '{key}'.")
        # return value_to_return
        # *** END REVERTING TEMPORARY DEBUGGING ***

        # --- Original Code Using Persistent Connection ---
        row = self._execute_query("SELECT value FROM settings WHERE key = ?", (key,), fetch_one=True)
        if row:
            try: return json.loads(row['value']) if row['value'] is not None else default
            except (json.JSONDecodeError, TypeError): return default
        return default
        # --- End Original Code ---

    def update_setting(self, key, value):
        try: json_value = json.dumps(value)
        except TypeError: _LOGGER.error(f"Cannot serialize value for setting {key}"); return False
        _LOGGER.debug(f"Executing update_setting for key='{key}', json_value='{json_value}'")
        result = self._execute_query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, json_value), commit=True)
        _LOGGER.debug(f"_execute_query result (rowcount) for update_setting '{key}': {result}") # Log the rowcount
        # The return value should be True if result (rowcount) is 1 (or potentially > 0)
        # Return True if result is not None and result > 0 ? Or just not None?
        # Let's stick with `is not None` for now, as None indicates an error in _execute_query.
        success = result is not None
        _LOGGER.debug(f"update_setting for '{key}' returning: {success}")
        return success

    # --- Generic Type/Lookup Table Management (Banks, AccountTypes, AssetTypes, LiabilityTypes, PaymentMethods, PointsPrograms) ---
    def _get_lookup_items(self, table_name):
        return self._execute_query(f"SELECT id, name FROM {table_name} ORDER BY name COLLATE NOCASE", fetch_all=True) or []

    def _add_lookup_item(self, table_name, name):
        if not name or not isinstance(name, str): return False, "Name must be a non-empty string", None
        normalized_name = name.strip()
        if not normalized_name: return False, "Name cannot be empty", None
        new_id = str(uuid.uuid4())
        try:
            result = self._execute_query(f"INSERT INTO {table_name} (id, name) VALUES (?, ?)", (new_id, normalized_name), commit=True)
            if result is not None:
                 items = self._get_lookup_items(table_name)
                 return True, f"{table_name[:-1].capitalize()} added successfully", items
            else:
                 return False, "Database error during insert", None # _execute_query handles logging
        except sqlite3.IntegrityError: # Catch duplicate name
             _LOGGER.warning(f"Attempted to add duplicate name to {table_name}: {normalized_name}")
             return False, f"{table_name[:-1].capitalize()} '{normalized_name}' already exists", None
        except Exception as e: # Catch any other unexpected error
            _LOGGER.error(f"Unexpected error adding to {table_name}: {e}", exc_info=True)
            return False, "An unexpected error occurred", None

    def _update_lookup_item(self, table_name, item_id, new_name):
        if not item_id or not new_name or not isinstance(new_name, str): return False, "ID and new name required", None
        normalized_name = new_name.strip()
        if not normalized_name: return False, "New name cannot be empty", None
        try:
             affected_rows = self._execute_query(f"UPDATE {table_name} SET name = ? WHERE id = ?", (normalized_name, item_id), commit=True)
             if affected_rows == 1:
                 items = self._get_lookup_items(table_name)
                 # TODO: Add cascade logic if name changes need to propagate (e.g., update card payment_methods JSON)
                 return True, f"{table_name[:-1].capitalize()} updated successfully", items
             elif affected_rows == 0:
                 return False, f"{table_name[:-1].capitalize()} ID '{item_id}' not found", None
             else: # Should not happen with PK
                 return False, "Database error during update (multiple rows?)", None
        except sqlite3.IntegrityError: # Catch duplicate name
            _LOGGER.warning(f"Attempted duplicate name update in {table_name}: {normalized_name}")
            return False, f"{table_name[:-1].capitalize()} name '{normalized_name}' already exists", None
        except Exception as e: # Catch any other unexpected error
            _LOGGER.error(f"Unexpected error updating {table_name}: {e}", exc_info=True)
            return False, "An unexpected error occurred", None

    def _delete_lookup_item(self, table_name, item_id, dependency_tables=[]):
        if not item_id: return False, "ID cannot be empty", None
        cursor = self._conn.cursor()
        try:
            # Check dependencies
            for dep_table, dep_column in dependency_tables:
                cursor.execute(f"SELECT 1 FROM {dep_table} WHERE {dep_column} = ? LIMIT 1", (item_id,))
                if cursor.fetchone():
                    _LOGGER.warning(f"Deletion prevented: {table_name[:-1]} ID {item_id} is in use by {dep_table}.")
                    return False, f"{table_name[:-1].capitalize()} is in use by {dep_table} and cannot be deleted", None

            cursor.execute(f"DELETE FROM {table_name} WHERE id = ?", (item_id,))
            self._conn.commit()
            if cursor.rowcount == 0:
                 return False, f"{table_name[:-1].capitalize()} ID '{item_id}' not found", None
            else: # Correctly indented else
                 items = self._get_lookup_items(table_name)
                 return True, f"{table_name[:-1].capitalize()} deleted successfully", items
        except sqlite3.IntegrityError as e: # Catch potential FK violations not checked above
             _LOGGER.error(f"Integrity error deleting from {table_name}, ID {item_id}: {e}")
             return False, "Cannot delete item as it is still in use", None
        except sqlite3.Error as e:
             _LOGGER.error(f"Error deleting from {table_name}, ID {item_id}: {e}", exc_info=True)
             self._conn.rollback()
             return False, "Database error occurred", None

    # --- Specific Lookup Table Methods ---
    def get_banks(self): return self._get_lookup_items('banks')
    def add_bank(self, name): return self._add_lookup_item('banks', name)
    def update_bank(self, item_id, new_name): return self._update_lookup_item('banks', item_id, new_name)
    def delete_bank(self, item_id):
        return self._delete_lookup_item('banks', item_id,
                                        dependency_tables=[('manual_accounts', 'bank_id'),
                                                         ('manual_assets', 'bank_id'),
                                                         ('manual_liabilities', 'bank_id'),
                                                         ('manual_credit_cards', 'bank_id')])

    def get_account_types(self): return self._get_lookup_items('account_types')
    def add_account_type(self, name): return self._add_lookup_item('account_types', name)
    def update_account_type(self, item_id, new_name): return self._update_lookup_item('account_types', item_id, new_name)
    def delete_account_type(self, item_id):
        return self._delete_lookup_item('account_types', item_id,
                                        dependency_tables=[('manual_accounts', 'account_type_id')])

    def get_asset_types(self): return self._get_lookup_items('asset_types')
    def add_asset_type(self, name): return self._add_lookup_item('asset_types', name)
    def update_asset_type(self, item_id, new_name): return self._update_lookup_item('asset_types', item_id, new_name)
    def delete_asset_type(self, item_id):
        return self._delete_lookup_item('asset_types', item_id,
                                        dependency_tables=[('manual_assets', 'asset_type_id')])

    def get_liability_types(self): return self._get_lookup_items('liability_types')
    def add_liability_type(self, name):
        # API expects different return structure for add
        success, msg, items = self._add_lookup_item('liability_types', name)
        new_item = next((i for i in items if i['name'] == name.strip()), None) if success else None
        return success, msg, new_item
    def update_liability_type(self, item_id, new_name):
        # API expects different return structure for update
        success, msg, items = self._update_lookup_item('liability_types', item_id, new_name)
        updated_item = next((i for i in items if i['id'] == item_id), None) if success else None
        return success, msg, updated_item
    def delete_liability_type(self, item_id):
         # API expects different return structure for delete
        success, msg, _ = self._delete_lookup_item('liability_types', item_id,
                                                   dependency_tables=[('manual_liabilities', 'liability_type_id')])
        return success, msg, None

    def get_payment_methods(self): return self._get_lookup_items('payment_methods')
    def add_payment_method(self, name): return self._add_lookup_item('payment_methods', name)
    def update_payment_method(self, item_id, new_name):
         # Need to handle updates in credit card JSON
        success, msg, items = self._update_lookup_item('payment_methods', item_id, new_name)
        if success:
            self._update_payment_method_in_cards(item_id, new_name) # Cascade
        return success, msg, items
    def delete_payment_method(self, item_id):
         # Need to handle updates in credit card JSON
        success, msg, items = self._delete_lookup_item('payment_methods', item_id)
        if success:
            self._remove_payment_method_from_cards(item_id) # Cascade
        return success, msg, items

    def get_points_programs(self): return self._get_lookup_items('points_programs')
    def add_points_program(self, name): return self._add_lookup_item('points_programs', name)
    def update_points_program(self, item_id, new_name): return self._update_lookup_item('points_programs', item_id, new_name)
    def delete_points_program(self, item_id):
        return self._delete_lookup_item('points_programs', item_id,
                                        dependency_tables=[('manual_credit_cards', 'points_program_id')])

    # --- Manual Assets ---
    def get_manual_assets(self):
        assets = self._execute_query("SELECT * FROM manual_assets", fetch_all=True)
        return {asset['id']: asset for asset in assets} if assets else {}

    def get_manual_asset_details(self, asset_id):
        """Get manual details for a specific asset, reading from dedicated columns."""
        if not self._conn:
            _LOGGER.error("Database connection is not available.")
            return None
        conn = self._conn
        conn.row_factory = sqlite3.Row # Return rows as dictionary-like objects
        cursor = conn.cursor()
        # --- FIX: Select all relevant columns --- #
        cursor.execute("""
            SELECT id, name, asset_type_id, bank_id, symbol, shares, entity_id, current_value, last_updated, ynab_value_last_updated_on, json_data
            FROM manual_assets
            WHERE id = ?
        """, (asset_id,))
        row = cursor.fetchone()
        # --- END FIX --- #
        if row:
            # Convert Row object to a standard dictionary
            details = dict(row)
            # Optional: merge any extra fields from json_data if needed (belt & suspenders)
            try:
                if details.get('json_data'):
                    json_blob_data = json.loads(details['json_data'])
                    # Merge JSON data only for keys NOT already present from dedicated columns
                    for key, value in json_blob_data.items():
                        if key not in details or details[key] is None: # Only add if missing or None
                            details[key] = value
            except json.JSONDecodeError:
                _LOGGER.warning(f"Could not parse json_data for asset {asset_id}")
            # Ensure id is present (should be from DB)
            details['id'] = asset_id
            # Remove json_data itself before returning if desired
            # details.pop('json_data', None)
            return details
        else:
            return None

    def save_manual_asset(self, asset_id, details):
        if not isinstance(details, dict): _LOGGER.error("Invalid asset details format"); return None
        is_new = asset_id is None
        if is_new: asset_id = str(uuid.uuid4())

        updated_data = details.copy()
        updated_data['last_updated'] = datetime.now().isoformat()

        # Extract specific fields to save into dedicated columns
        asset_type_id = details.get('asset_type_id') or details.get('type_id') # Handle 'type_id' from frontend
        bank_id = details.get('bank_id')
        entity_id = details.get('entity_id')
        symbol = details.get('symbol')
        shares = details.get('shares')
        current_value = details.get('value') # Use 'value' from frontend for current_value

        # Convert shares and current_value to appropriate types
        try:
            shares = float(shares) if shares is not None else None
        except (ValueError, TypeError):
            _LOGGER.warning(f"Invalid shares value '{shares}' for asset {asset_id}, saving as NULL.")
            shares = None
        try:
            # Frontend sends value as dollars, convert to milliunits for storage if needed?
            # Let's assume current_value column stores the raw float value for now.
            # If it needs milliunits, multiply by 1000.
            current_value_float = float(current_value) if current_value is not None else None
        except (ValueError, TypeError):
             _LOGGER.warning(f"Invalid current_value '{current_value}' for asset {asset_id}, saving as NULL.")
             current_value_float = None

        # Use INSERT OR REPLACE to handle both new and existing assets
        # Include the new columns in the statement
        cursor = self._conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO manual_assets
            (id, asset_type_id, bank_id, entity_id, symbol, shares, current_value, json_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            asset_id,
            asset_type_id,
            bank_id,
            entity_id,
            symbol,
            shares,
            current_value_float, # Save the float value
            json.dumps(updated_data) # Still save the full JSON for backup/other fields
        ))
        self._conn.commit()
        _LOGGER.info(f"Successfully saved manual asset details for ID: {asset_id}")
        return asset_id

    def delete_manual_asset(self, asset_id):
        if not asset_id: return False, "Asset ID required", None
        affected_rows = self._execute_query("DELETE FROM manual_assets WHERE id = ?", (asset_id,), commit=True)
        if affected_rows == 1: return True, "Asset deleted", None
        elif affected_rows == 0: return False, "Asset not found", None
        else: return False, "Database error", None

    # --- Manual Accounts ---
    def get_manual_accounts(self):
        accounts_list = self._execute_query("SELECT * FROM manual_accounts", fetch_all=True)
        accounts_dict = {}
        if accounts_list:
            for acc in accounts_list:
                try: acc['allocation_rules'] = json.loads(acc['allocation_rules']) if acc.get('allocation_rules') else []
                except (json.JSONDecodeError, TypeError):
                    _LOGGER.warning(f"Corrupted allocation rules for account {acc['id']}, resetting.")
                    acc['allocation_rules'] = []
                acc['include_bank_in_name'] = bool(acc.get('include_bank_in_name'))
                accounts_dict[acc['id']] = acc
        return accounts_dict

    def get_manual_account_details(self, ynab_account_id, account_type=None):
        if not ynab_account_id: return {}
        details = self._execute_query("SELECT * FROM manual_accounts WHERE id = ?", (ynab_account_id,), fetch_one=True)
        if not details:
            return {'allocation_rules': self._get_default_allocation_rules(account_type)}
        try:
            rules = json.loads(details['allocation_rules']) if details.get('allocation_rules') else []
            if not isinstance(rules, list): # Extra validation
                _LOGGER.warning(f"Invalid allocation_rules format (not a list) for {ynab_account_id}, resetting.")
                rules = []
        except (json.JSONDecodeError, TypeError):
            _LOGGER.warning(f"Corrupted allocation rules JSON for account {ynab_account_id}, resetting.")
            rules = []
        original_rules_json = json.dumps(rules) # Store original state for comparison

        # --- FIX: Validate/Repair rules, especially 'remaining' --- #
        remaining_index = -1
        for i, rule in enumerate(rules):
            if isinstance(rule, dict) and rule.get('id') == 'remaining':
                remaining_index = i
                break

        if remaining_index != -1:
            remaining_rule = rules[remaining_index]
            rule_needs_update = False
            if remaining_rule.get('type') != 'remaining':
                _LOGGER.warning(f"Correcting type for remaining rule in account {ynab_account_id}")
                remaining_rule['type'] = 'remaining'
                rule_needs_update = True
            if remaining_rule.get('name') != 'Remaining':
                _LOGGER.warning(f"Correcting name for remaining rule in account {ynab_account_id}")
                remaining_rule['name'] = 'Remaining'
                rule_needs_update = True
            if remaining_rule.get('value') is not None:
                _LOGGER.warning(f"Correcting value for remaining rule in account {ynab_account_id}")
                remaining_rule['value'] = None
                rule_needs_update = True
            # Ensure it's last
            if remaining_index < len(rules) - 1:
                 _LOGGER.warning(f"Moving remaining rule to end for account {ynab_account_id}")
                 rules.pop(remaining_index) # Remove from current position
                 rules.append(remaining_rule) # Add to end
                 rule_needs_update = False # Position fixed, no need to update in place

            # If only content needed update (was already last)
            if rule_needs_update and remaining_index == len(rules) - 1:
                rules[remaining_index] = remaining_rule # Update in place
        else:
            _LOGGER.warning(f"No remaining rule found for account {ynab_account_id}, adding default.")
            rules.append(self._get_default_allocation_rules(account_type)[-1]) # Add default remaining
        # --- END FIX --- #

        details['allocation_rules'] = rules # Assign potentially corrected rules back

        # --- FIX: Save corrected rules back to DB if they were changed --- #
        if original_rules_json != json.dumps(rules): # Check if rules actually changed
            _LOGGER.info(f"Saving corrected allocation rules back to DB for account {ynab_account_id}")
            # Use a simplified save just for the rules to avoid complex parameter passing
            try:
                self._execute_query("UPDATE manual_accounts SET allocation_rules = ? WHERE id = ?",
                                  (json.dumps(rules), ynab_account_id),
                                  commit=True)
            except Exception as save_err:
                 _LOGGER.error(f"Failed to save corrected rules for {ynab_account_id}: {save_err}")
        # --- END FIX --- #

        details['include_bank_in_name'] = bool(details.get('include_bank_in_name'))
        # Add 'account_type' name
        if details.get('account_type_id'):
             atype = self._execute_query("SELECT name FROM account_types WHERE id = ?", (details['account_type_id'],), fetch_one=True)
             details['account_type'] = atype['name'] if atype else None
        else: details['account_type'] = None
        return details

    def save_manual_account_details(self, ynab_account_id, details):
        if not ynab_account_id or not isinstance(details, dict): return False
        try: rules_json = json.dumps(details.get('allocation_rules', []))
        except TypeError: _LOGGER.error("Cannot serialize allocation rules"); return False
        account_data = (
            ynab_account_id, details.get('bank_id'), details.get('account_type_id'), details.get('last_4_digits'),
            bool(details.get('include_bank_in_name', True)), rules_json,
            details.get('notes'), datetime.now().isoformat()
        )
        sql = "INSERT OR REPLACE INTO manual_accounts (id, bank_id, account_type_id, last_4_digits, include_bank_in_name, allocation_rules, notes, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        result = self._execute_query(sql, account_data, commit=True)
        return result is not None

    def delete_manual_account_details(self, ynab_account_id):
        if not ynab_account_id: return False
        result = self._execute_query("DELETE FROM manual_accounts WHERE id = ?", (ynab_account_id,), commit=True)
        # Returns True even if not found, as the end state is achieved
        return result is not None

    def _get_default_allocation_rules(self, account_type=None):
        _LOGGER.debug(f"Getting default allocation rules for account type: {account_type}")
        # --- FIX: Make comparison case-insensitive --- #
        normalized_type = account_type.lower() if isinstance(account_type, str) else None

        if normalized_type == 'savings':
        # --- END FIX --- #
            # --- FIX: Change default status to Frozen --- #
            return [
                {"id": "savings_frozen", "name": "Savings Frozen", "type": "percentage", "value": 100, "status": "Frozen"},
                {"id": "remaining", "name": "Remaining", "status": "Frozen"} # Remaining also Frozen
            ]
            # --- END FIX --- #
        # --- FIX: Make comparison case-insensitive --- #
        elif normalized_type == 'cash':
        # --- END FIX --- #
            return [
                {"id": "cash_liquid", "name": "Cash Liquid", "type": "percentage", "value": 100, "status": "Liquid"},
                {"id": "remaining", "name": "Remaining", "status": "Liquid"}
            ]
        # Default (Checking)
        return [
            {"id": "checking_liquid", "name": "Checking Liquid", "type": "percentage", "value": 100, "status": "Liquid"},
            {"id": "remaining", "name": "Remaining", "status": "Liquid"}
        ]

    # --- Manual Liabilities ---
    def get_manual_liabilities(self):
        liabs_list = self._execute_query("SELECT * FROM manual_liabilities", fetch_all=True)
        liabs_dict = {}
        if liabs_list:
            for liab in liabs_list:
                liab['is_ynab'] = bool(liab.get('is_ynab'))
                # Add type name
                if liab.get('liability_type_id'):
                     ltype = self._execute_query("SELECT name FROM liability_types WHERE id = ?", (liab['liability_type_id'],), fetch_one=True)
                     liab['type'] = ltype['name'] if ltype else None
                else: liab['type'] = None
                liabs_dict[liab['id']] = liab
        return liabs_dict

    def get_manual_liability_details(self, liability_id):
        if not liability_id: return None
        details = self._execute_query("SELECT * FROM manual_liabilities WHERE id = ?", (liability_id,), fetch_one=True)
        if details:
            details['is_ynab'] = bool(details.get('is_ynab'))
            if details.get('liability_type_id'):
                 ltype = self._execute_query("SELECT name FROM liability_types WHERE id = ?", (details['liability_type_id'],), fetch_one=True)
                 details['type'] = ltype['name'] if ltype else None
            else: details['type'] = None
        return details

    def save_manual_liability_details(self, liability_id, details):
        if not liability_id or not isinstance(details, dict): return False
        # Ensure numeric fields are numeric or None
        interest_rate = details.get('interest_rate')
        value = details.get('value')
        try: rate_val = float(interest_rate) if interest_rate is not None else None
        except (ValueError, TypeError): rate_val = None
        try: value_val = float(value) if value is not None else None
        except (ValueError, TypeError): value_val = None

        liability_data = (
            liability_id, details.get('liability_type_id'), details.get('bank_id'),
            rate_val, details.get('start_date'), details.get('notes'),
            details.get('is_ynab', True), value_val, details.get('name'),
            datetime.now().isoformat()
        )
        sql = "INSERT OR REPLACE INTO manual_liabilities (id, liability_type_id, bank_id, interest_rate, start_date, notes, is_ynab, value, name, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        result = self._execute_query(sql, liability_data, commit=True)
        return result is not None

    def add_manual_liability(self, details):
        if not isinstance(details, dict): return None
        new_id = str(uuid.uuid4())
        details['id'] = new_id
        details['is_ynab'] = False
        if self.save_manual_liability_details(new_id, details):
            return self.get_manual_liability_details(new_id)
        return None

    def update_manual_liability(self, liability_id, update_data):
        existing = self.get_manual_liability_details(liability_id)
        if not existing: return {"error": "Liability not found"}, 404
        if existing.get('is_ynab'): return {"error": "Cannot update YNAB liability via this route."}, 400
        merged = {**existing, **update_data}
        if self.save_manual_liability_details(liability_id, merged):
            updated = self.get_manual_liability_details(liability_id)
            return updated, 200
        return {"error": "Failed to save update"}, 500

    def delete_manual_liability(self, liability_id):
        if not liability_id: return False, "ID required", None
        affected_rows = self._execute_query("DELETE FROM manual_liabilities WHERE id = ?", (liability_id,), commit=True)
        if affected_rows == 1: return True, "Liability deleted", None
        elif affected_rows == 0: return False, "Liability not found", None
        else: return False, "Database error", None

    # --- Manual Credit Cards ---
    def get_manual_credit_cards(self):
        cards_raw = self._execute_query("SELECT * FROM manual_credit_cards", fetch_all=True)
        valid_cards = []
        if cards_raw:
            for card in cards_raw:
                try:
                    card['payment_methods'] = json.loads(card['payment_methods']) if card.get('payment_methods') else []
                    card['static_rewards'] = json.loads(card['static_rewards']) if card.get('static_rewards') else []
                    card['rotating_rules'] = json.loads(card['rotating_rules']) if card.get('rotating_rules') else []
                    card['dynamic_tiers'] = json.loads(card['dynamic_tiers']) if card.get('dynamic_tiers') else []
                    card['rotating_period_status'] = json.loads(card['rotating_period_status']) if card.get('rotating_period_status') else []
                    card['include_bank_in_name'] = bool(card.get('include_bank_in_name'))
                    card['requires_activation'] = bool(card.get('requires_activation'))
                    valid_cards.append(card) # Moved inside try block
                except (json.JSONDecodeError, TypeError) as e: # Correctly indented except
                    _LOGGER.error(f"Error decoding JSON for card {card.get('id')}: {e}")
                    # Potentially skip card or reset JSON fields?
        return valid_cards # Correctly indented return

    def get_manual_credit_card_details(self, card_id):
        if not card_id: return None
        details = self._execute_query("SELECT * FROM manual_credit_cards WHERE id = ?", (card_id,), fetch_one=True)
        if details:
            try:
                details['payment_methods'] = json.loads(details['payment_methods']) if details.get('payment_methods') else []
                details['static_rewards'] = json.loads(details['static_rewards']) if details.get('static_rewards') else []
                details['rotating_rules'] = json.loads(details['rotating_rules']) if details.get('rotating_rules') else []
                details['dynamic_tiers'] = json.loads(details['dynamic_tiers']) if details.get('dynamic_tiers') else []
                details['rotating_period_status'] = json.loads(details['rotating_period_status']) if details.get('rotating_period_status') else []
                details['include_bank_in_name'] = bool(details.get('include_bank_in_name'))
                details['requires_activation'] = bool(details.get('requires_activation'))
            except (json.JSONDecodeError, TypeError) as e:
                 _LOGGER.error(f"Error decoding JSON for card {card_id}: {e}")
                 # Reset fields on error to prevent downstream issues
                 details['payment_methods'] = []; details['static_rewards'] = []; details['rotating_rules'] = [];
                 details['dynamic_tiers'] = []; details['rotating_period_status'] = []
        return details

    def save_manual_credit_card_details(self, card_id, card_details):
        if not card_id or not isinstance(card_details, dict): return False
        try:
             # Ensure numeric fields are numeric or None
             auto_pay_1 = card_details.get('auto_pay_day_1'); day1_val = int(auto_pay_1) if auto_pay_1 is not None else None
             auto_pay_2 = card_details.get('auto_pay_day_2'); day2_val = int(auto_pay_2) if auto_pay_2 is not None else None
             credit_limit = card_details.get('credit_limit'); limit_val = float(credit_limit) if credit_limit is not None else None
             annual_fee = card_details.get('annual_fee'); fee_val = float(annual_fee) if annual_fee is not None else None
             base_rate = card_details.get('base_rate', 0.0); rate_val = float(base_rate) if base_rate is not None else 0.0

             data_tuple = (
                 card_id, card_details.get('card_name'), card_details.get('bank_id'),
                 bool(card_details.get('include_bank_in_name', True)), card_details.get('last_4_digits'), card_details.get('expiration_date'),
                 day1_val, day2_val, limit_val, fee_val,
                 json.dumps(card_details.get('payment_methods', [])), card_details.get('notes'), rate_val,
                 card_details.get('reward_system', 'Cashback'), card_details.get('points_program_id'), card_details.get('reward_structure_type', 'Static'),
                 json.dumps(card_details.get('static_rewards', [])), json.dumps(card_details.get('rotating_rules', [])), card_details.get('rotation_period'),
                 json.dumps(card_details.get('dynamic_tiers', [])), card_details.get('activation_period'), bool(card_details.get('requires_activation', False)),
                 json.dumps(card_details.get('rotating_period_status', [])), datetime.now().isoformat()
             )
             sql = "INSERT OR REPLACE INTO manual_credit_cards (id, card_name, bank_id, include_bank_in_name, last_4_digits, expiration_date, auto_pay_day_1, auto_pay_day_2, credit_limit, annual_fee, payment_methods, notes, base_rate, reward_system, points_program_id, reward_structure_type, static_rewards, rotating_rules, rotation_period, dynamic_tiers, activation_period, requires_activation, rotating_period_status, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
             result = self._execute_query(sql, data_tuple, commit=True)
             return result is not None
        except (TypeError, json.JSONDecodeError, ValueError) as e:
            _LOGGER.error(f"Error serializing/preparing data for card {card_id}: {e}")
            return False # Correctly indented return False

    def delete_manual_credit_card_details(self, card_id):
        if not card_id: return False
        result = self._execute_query("DELETE FROM manual_credit_cards WHERE id = ?", (card_id,), commit=True)
        return result is not None # True if deleted (1) or not found (0)

    def _update_payment_method_in_cards(self, old_id, new_name):
        """Helper to update payment method references in cards JSON field."""
        cards = self.get_manual_credit_cards() # Gets deserialized cards
        updated_count = 0
        for card in cards:
            pms = card.get('payment_methods', [])
            if isinstance(pms, list) and old_id in pms:
                # Retrieve the actual ID of the payment method being referenced
                pm_item = self._execute_query("SELECT id FROM payment_methods WHERE id = ?", (old_id,), fetch_one=True)
                if pm_item:
                    # Use the name of the payment method for storage in the JSON field
                    pm_name = self._execute_query("SELECT name FROM payment_methods WHERE id = ?", (old_id,), fetch_one=True)
                    new_pms = [new_name if pm == pm_name['name'] else pm for pm in pms]
                    # Remove duplicates if new_name was already present
                    new_pms = sorted(list(set(new_pms)))
                    card['payment_methods'] = new_pms
                    # Resave this specific card
                    if not self.save_manual_credit_card_details(card['id'], card):
                         _LOGGER.error(f"Failed to update payment methods in card {card['id']}")
        else:
                         updated_count += 1
        if updated_count > 0: _LOGGER.info(f"Updated payment method ID {old_id} to {new_name} in {updated_count} cards.")


    def _remove_payment_method_from_cards(self, deleted_id):
        """Helper to remove deleted payment method references from cards JSON field."""
        cards = self.get_manual_credit_cards()
        updated_count = 0
        for card in cards:
            pms = card.get('payment_methods', [])
            # Find the name associated with the deleted_id before filtering
            # This assumes the name was stored in the JSON, not the ID
            # We need the name to remove it correctly if the update logic stores names
            deleted_pm_name = None # We might not know the name if only ID is passed
            # A better approach: always store IDs in the JSON or fetch the name before deleting

            if isinstance(pms, list):
                # If storing IDs:
                # new_pms = [pm for pm in pms if pm != deleted_id]
                # If storing names (requires knowing the name of deleted_id):
                # We cannot reliably do this without fetching the name first or storing IDs
                # Assuming IDs are stored for now:
                new_pms = [pm for pm in pms if pm != deleted_id]

                if len(new_pms) < len(pms):
                    card['payment_methods'] = new_pms # Already unique and sorted
                    # Resave this specific card
                    if not self.save_manual_credit_card_details(card['id'], card):
                         _LOGGER.error(f"Failed to remove payment method from card {card['id']}")
                else:
                         updated_count += 1
        if updated_count > 0: _LOGGER.info(f"Removed deleted payment method ID {deleted_id} from {updated_count} cards.")

    # --- Generic Hierarchical Item Helpers ---
    def _get_hierarchical_items(self, table_name):
        return self._execute_query(f"SELECT id, name, parent_id FROM {table_name} ORDER BY name COLLATE NOCASE", fetch_all=True) or []

    def _add_hierarchical_item(self, table_name, name, parent_id=None):
        if not name or not isinstance(name, str): return False, f"{table_name[:-1].capitalize()} name required", None
        if parent_id is not None and not isinstance(parent_id, str): return False, "Invalid parent ID", None
        normalized_name = name.strip();
        if not normalized_name: return False, f"{table_name[:-1].capitalize()} name empty", None
        cursor = self._conn.cursor()
        try:
            # Check for duplicate name under same parent
            sql_check_name = f"SELECT 1 FROM {table_name} WHERE LOWER(name) = ? AND "
            params_check_name = [normalized_name.lower()]
            if parent_id:
                sql_check_name += "parent_id = ?"
                params_check_name.append(parent_id)
            else:
                sql_check_name += "parent_id IS NULL"
            cursor.execute(sql_check_name, tuple(params_check_name))
            if cursor.fetchone():
                return False, f"{table_name[:-1].capitalize()} '{normalized_name}' already exists under this parent.", None
            # Check parent exists
            if parent_id:
                cursor.execute(f"SELECT 1 FROM {table_name} WHERE id = ?", (parent_id,))
                if not cursor.fetchone():
                     return False, f"Parent ID '{parent_id}' not found in {table_name}.", None
            new_id = str(uuid.uuid4())
            cursor.execute(f"INSERT INTO {table_name} (id, name, parent_id) VALUES (?, ?, ?)", (new_id, normalized_name, parent_id))
            self._conn.commit()
            items = self._get_hierarchical_items(table_name)
            return True, f"{table_name[:-1].capitalize()} added", items
        except sqlite3.Error as e:
            _LOGGER.error(f"Database error adding to {table_name}: {e}", exc_info=True)
            self._conn.rollback()
            return False, "Database error", None
        finally:
            pass # No need to close connection in finally

    def _update_hierarchical_item(self, table_name, item_id, new_name, new_parent_id=None):
        if not item_id: return False, "Item ID required", None
        if new_name is not None:
            if not isinstance(new_name, str): return False, "New name must be string", None
            new_name = new_name.strip();
            if not new_name: return False, "New name empty", None
        if new_parent_id is not None and not isinstance(new_parent_id, str): return False, "Invalid parent ID", None

        cursor = self._conn.cursor()
        try:
            # Get current data
            cursor.execute(f"SELECT name, parent_id FROM {table_name} WHERE id = ?", (item_id,))
            current_row = cursor.fetchone()
            if not current_row: return False, f"Item ID '{item_id}' not found", None
            current_data = dict(current_row)

            target_name = new_name if new_name is not None else current_data['name']
            target_parent_id = new_parent_id if new_parent_id is not None else current_data['parent_id']

            needs_update = (target_name != current_data['name']) or (target_parent_id != current_data['parent_id'])
            if not needs_update: return True, "No changes detected", self._get_hierarchical_items(table_name)

            # Validate parent change
            if target_parent_id != current_data['parent_id']:
                if target_parent_id == item_id: return False, "Cannot parent to self", None
                if target_parent_id:
                     cursor.execute(f"SELECT 1 FROM {table_name} WHERE id = ?", (target_parent_id,))
                     if not cursor.fetchone(): return False, f"Parent ID '{target_parent_id}' not found", None
                     # Cyclical check: Ensure new parent is not a descendant of item_id
                     descendants = self._get_descendant_ids_recursive(cursor, table_name, item_id)
                     if target_parent_id in descendants:
                         return False, "Cannot move item under one of its descendants", None

            # Check name conflict under target parent
            sql_check_name = f"SELECT 1 FROM {table_name} WHERE LOWER(name) = ? AND id != ? AND "
            params_check_name = [target_name.lower(), item_id]
            if target_parent_id:
                sql_check_name += "parent_id = ?"
                params_check_name.append(target_parent_id)
            else: # Correctly indented else
                sql_check_name += "parent_id IS NULL"
            cursor.execute(sql_check_name, tuple(params_check_name))
            if cursor.fetchone():
                return False, f"{table_name[:-1].capitalize()} '{target_name}' already exists under target parent.", None

            # Perform update
            cursor.execute(f"UPDATE {table_name} SET name = ?, parent_id = ? WHERE id = ?", (target_name, target_parent_id, item_id))
            self._conn.commit()
            if cursor.rowcount == 1:
                items = self._get_hierarchical_items(table_name)
                return True, "Item updated", items
            else: # Should not happen if existence checked
                return False, "Item not found during update", None
        except sqlite3.Error as e:
            _LOGGER.error(f"Database error updating in {table_name}: {e}", exc_info=True)
            self._conn.rollback()
            return False, "Database error", None
        finally:
            pass # No need to close connection in finally

    def _get_descendant_ids_recursive(self, cursor, table_name, item_id):
        """Helper function (requires cursor) to get all descendant IDs."""
        descendants = set()
        children_to_check = {item_id}
        while children_to_check:
            current_id = children_to_check.pop()
            cursor.execute(f"SELECT id FROM {table_name} WHERE parent_id = ?", (current_id,))
            direct_children = {row['id'] for row in cursor.fetchall()}
            new_children = direct_children - descendants
            descendants.update(new_children)
            children_to_check.update(new_children)
        return descendants

    def _delete_hierarchical_item(self, table_name, item_id):
        if not item_id: return False, "ID required", None
        cursor = self._conn.cursor()
        try:
            # Check for children
            cursor.execute(f"SELECT 1 FROM {table_name} WHERE parent_id = ? LIMIT 1", (item_id,))
            if cursor.fetchone():
                return False, f"Cannot delete {table_name[:-1]} with children", None
            # TODO: Check dependencies in other tables (e.g., card rewards)
            result = cursor.execute(f"DELETE FROM {table_name} WHERE id = ?", (item_id,))
            self._conn.commit()
            if result.rowcount == 1:
                items = self._get_hierarchical_items(table_name)
                return True, "Item deleted", items
            elif result.rowcount == 0: return False, "Item not found", None
            else: return False, "Database error (multiple rows deleted?)", None # Should not happen
        except sqlite3.Error as e:
            _LOGGER.error(f"Database error deleting from {table_name}: {e}", exc_info=True)
            self._conn.rollback()
            return False, "Database error", None
        finally:
            pass # No need to close connection in finally

    # --- Specific Hierarchical Methods ---
    def get_managed_categories(self): return self._get_hierarchical_items("managed_categories")
    def add_managed_category(self, name, parent_id=None): return self._add_hierarchical_item("managed_categories", name, parent_id)
    def update_managed_category(self, item_id, new_name, new_parent_id=None): return self._update_hierarchical_item("managed_categories", item_id, new_name, new_parent_id)
    def delete_managed_category(self, item_id): return self._delete_hierarchical_item("managed_categories", item_id)

    def get_managed_payees(self): return self._get_hierarchical_items("managed_payees")
    def add_managed_payee(self, name, parent_id=None): return self._add_hierarchical_item("managed_payees", name, parent_id)
    def update_managed_payee(self, item_id, new_name, new_parent_id=None): return self._update_hierarchical_item("managed_payees", item_id, new_name, new_parent_id)
    def delete_managed_payee(self, item_id): return self._delete_hierarchical_item("managed_payees", item_id)

    def get_rewards_categories(self): return self._get_hierarchical_items("rewards_categories")
    def add_rewards_category(self, name, parent_id=None): return self._add_hierarchical_item("rewards_categories", name, parent_id)
    def update_rewards_category(self, item_id, new_name, new_parent_id=None): return self._update_hierarchical_item("rewards_categories", item_id, new_name, new_parent_id)
    def delete_rewards_category(self, item_id): return self._delete_hierarchical_item("rewards_categories", item_id)

    def get_rewards_payees(self): return self._get_hierarchical_items("rewards_payees")
    def add_rewards_payee(self, name, parent_id=None): return self._add_hierarchical_item("rewards_payees", name, parent_id)
    def update_rewards_payee(self, item_id, new_name, new_parent_id=None): return self._update_hierarchical_item("rewards_payees", item_id, new_name, new_parent_id)
    def delete_rewards_payee(self, item_id): return self._delete_hierarchical_item("rewards_payees", item_id)

    # --- Imported YNAB Payee IDs ---
    def get_imported_ynab_payee_ids(self):
        ids_list = self._execute_query("SELECT payee_id FROM imported_ynab_payee_ids", fetch_all=True)
        return [row['payee_id'] for row in ids_list] if ids_list else []

    def save_imported_ynab_payee_ids(self, ids):
        if not isinstance(ids, list) or not all(isinstance(i, str) for i in ids): return False
        cursor = self._conn.cursor()
        try:
            cursor.execute("BEGIN TRANSACTION")
            cursor.execute("DELETE FROM imported_ynab_payee_ids")
            if ids: cursor.executemany("INSERT INTO imported_ynab_payee_ids (payee_id) VALUES (?)", [(id,) for id in ids])
            self._conn.commit()
            return True # Moved inside the try block after commit
        except sqlite3.Error as e: # Correctly aligned except
             _LOGGER.error(f"Error saving imported YNAB payee IDs: {e}", exc_info=True)
             self._conn.rollback()
             return False # Correctly indented return False
        finally:
            pass # No need to close connection in finally

    # --- Reward Calculation/Optimization Logic --- (Needs review/update for SQLite)
    def find_best_card_for_transaction(self, category_id=None, payee_id=None, payment_method_id=None, amount_milliunits=0):
        # This logic needs to fetch card rules and hierarchy names from the DB
        _LOGGER.warning("find_best_card_for_transaction needs refactoring for SQLite - returning default")
        # Placeholder - return default/empty response
        return {
            "scenario_results": [],
            "scenario_suggestions": []
        }

    def get_best_overall_reward_scenarios(self):
        # This logic needs to fetch card rules, names, etc., from DB
        _LOGGER.warning("get_best_overall_reward_scenarios needs refactoring for SQLite - returning default")
        # Placeholder - return default/empty response
        return []