import json
import os
import logging
import uuid # Added for generating unique IDs
from datetime import datetime, date

_LOGGER = logging.getLogger(__name__)

DATA_DIR = "/data"
ACCOUNTS_FILE = os.path.join(DATA_DIR, "manual_accounts.json")
# Add paths for other data types (banks, types, assets, liabilities, cards) here
BANKS_FILE = os.path.join(DATA_DIR, "banks.json")
ACCOUNT_TYPES_FILE = os.path.join(DATA_DIR, "account_types.json")
ASSETS_FILE = os.path.join(DATA_DIR, "manual_assets.json")
ASSET_TYPES_FILE = os.path.join(DATA_DIR, "asset_types.json")
# Define Liability Types file
LIABILITY_TYPES_FILE = os.path.join(DATA_DIR, "liability_types.json")
# Define Payment Methods file
PAYMENT_METHODS_FILE = os.path.join(DATA_DIR, "payment_methods.json")
# Define Manual Liabilities file
MANUAL_LIABILITIES_FILE = os.path.join(DATA_DIR, "manual_liabilities.json")
# Define Manual Credit Cards file
MANUAL_CREDIT_CARDS_FILE = os.path.join(DATA_DIR, "manual_credit_cards.json")
# Define Manual Only Liabilities file
MANUAL_ONLY_LIABILITIES_FILE = os.path.join(DATA_DIR, "manual_only_liabilities.json")

# New files for rewards enhancements
MANAGED_CATEGORIES_FILE = os.path.join(DATA_DIR, "managed_categories.json")
MANAGED_PAYEES_FILE = os.path.join(DATA_DIR, "managed_payees.json")
IMPORTED_YNAB_PAYEE_IDS_FILE = os.path.join(DATA_DIR, "imported_ynab_payee_ids.json")

# Add a constant for the points programs file
POINTS_PROGRAMS_FILE = os.path.join(DATA_DIR, "points_programs.json")

# Constants for Reward Rule data
REWARDS_CATEGORIES_FILE = os.path.join(DATA_DIR, "rewards_categories.json")
REWARDS_PAYEES_FILE = os.path.join(DATA_DIR, "rewards_payees.json")

# File paths
DATA_DIRECTORY = os.path.join(os.path.dirname(__file__), "..", "data")
CREDIT_CARDS_FILE = MANUAL_CREDIT_CARDS_FILE  # Alias for backward compatibility

# Ensure the data directory exists
os.makedirs(DATA_DIRECTORY, exist_ok=True)

DEFAULT_ASSET_TYPES = [{"id": str(uuid.uuid4()), "name": "Stocks"}, {"id": str(uuid.uuid4()), "name": "Retirement Plan"}]
DEFAULT_LIABILITY_TYPES = [
    {"id": str(uuid.uuid4()), "name": "Student Loan"},
    {"id": str(uuid.uuid4()), "name": "Auto Loan"},
    {"id": str(uuid.uuid4()), "name": "Personal Loan"},
    {"id": str(uuid.uuid4()), "name": "Mortgage"}
]

class DataManager:
    def __init__(self, ynab_client=None): # Accept ynab_client
        self.ynab_client = ynab_client # Store the client
        _LOGGER.debug(f"DataManager initialized. YNAB client configured: {self.ynab_client is not None and self.ynab_client.is_configured()}")

        # Explicitly ensure data directory exists with logging
        try:
            os.makedirs(DATA_DIR, exist_ok=True)
            _LOGGER.info(f"Ensured data directory exists: {DATA_DIR}")
        except Exception as e:
            _LOGGER.error(f"CRITICAL: Failed to create or access data directory {DATA_DIR}: {e}")
            # Depending on desired behavior, could raise an error or proceed cautiously

        # Initialize files if they don't exist
        self._initialize_file(ACCOUNTS_FILE, {})
        # Initialize banks.json with a default bank {id, name}
        self._initialize_file(BANKS_FILE, [{"id": "Default Bank", "name": "Default Bank"}])
        self._initialize_file(ACCOUNT_TYPES_FILE, [{"id": "Checking", "name": "Checking"}, {"id": "Savings", "name": "Savings"}, {"id": "Cash", "name": "Cash"}])

        # --- Initialize type files with defaults ---
        self._ensure_default_types_structured(ASSET_TYPES_FILE, DEFAULT_ASSET_TYPES)
        self._ensure_default_types_structured(LIABILITY_TYPES_FILE, DEFAULT_LIABILITY_TYPES)
        # --- End type file initialization ---

        # Initialize asset files
        self._initialize_file(ASSETS_FILE, {})
        # Initialize payment methods file
        self._initialize_file(PAYMENT_METHODS_FILE, [])
        # Initialize manual liabilities file (similar to accounts/assets)
        self._initialize_file(MANUAL_LIABILITIES_FILE, {})
        # Initialize manual credit cards file - Change default to empty list []
        self._initialize_file(MANUAL_CREDIT_CARDS_FILE, [])
        # Initialize new files
        self._initialize_file(MANAGED_CATEGORIES_FILE, [])
        self._initialize_file(MANAGED_PAYEES_FILE, [])
        self._initialize_file(IMPORTED_YNAB_PAYEE_IDS_FILE, [])
        # Initialize manual only liabilities file
        self._initialize_file(MANUAL_ONLY_LIABILITIES_FILE, {})
        # Initialize points programs file
        self._initialize_file(POINTS_PROGRAMS_FILE, [])
        # Initialize rewards files
        self._initialize_file(REWARDS_CATEGORIES_FILE, [])
        self._initialize_file(REWARDS_PAYEES_FILE, [])

    def _initialize_file(self, file_path, default_content):
        if not os.path.exists(file_path):
            self._write_json(file_path, default_content)
            _LOGGER.info(f"Initialized data file: {file_path}")

    def _ensure_default_types(self, file_path, default_types):
        """DEPRECATED: Ensures a type file exists and contains the specified default types (as strings)."""
        _LOGGER.warning("_ensure_default_types is deprecated. Use _ensure_default_types_structured.")
        data = []
        file_exists = os.path.exists(file_path)
        if file_exists:
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
                if not isinstance(data, list):
                    _LOGGER.warning(f"File {file_path} is not a list. Re-initializing with defaults.")
                    data = [] # Reset if format is wrong
                    file_exists = False # Treat as non-existent to force rebuild
            except json.JSONDecodeError:
                _LOGGER.error(f"Error decoding JSON from {file_path}. Re-initializing with defaults.")
                data = []
                file_exists = False # Treat as non-existent
            except Exception as e:
                _LOGGER.error(f"Unexpected error reading {file_path}: {e}. Re-initializing with defaults.")
                data = []
                file_exists = False # Treat as non-existent

        # Normalize existing data to be a list of strings (names)
        current_names = set()
        if file_exists:
             for item in data:
                 if isinstance(item, dict) and 'name' in item:
                      current_names.add(item['name'])
                 elif isinstance(item, str):
                      current_names.add(item)

        needs_update = False
        types_to_add = []
        for default_name in default_types:
            if default_name not in current_names:
                types_to_add.append(default_name)
                needs_update = True

        if not file_exists or needs_update:
            _LOGGER.info(f"Initializing or updating {file_path} with defaults: {default_types}")
            # Add new default names to the existing names
            updated_names = sorted(list(current_names.union(set(types_to_add))))

            # Write back as a list of strings for simplicity now
            # If complex objects are needed later, this needs adjustment
            self._write_json(file_path, updated_names)
            _LOGGER.info(f"Successfully wrote default types to {file_path}")
        else:
             _LOGGER.debug(f"File {file_path} exists and contains all default types.")

    def _ensure_default_types_structured(self, file_path, default_type_objects):
        """Ensures a type file exists and contains the specified default types as {id, name} objects."""
        data = []
        file_exists = os.path.exists(file_path)
        if file_exists:
            try:
                data = self._read_json(file_path)
                if not isinstance(data, list) or not all(isinstance(item, dict) and 'id' in item and 'name' in item for item in data):
                    _LOGGER.warning(f"File {file_path} format incorrect. Re-initializing with defaults.")
                    data = []
                    file_exists = False
            except Exception as e:
                _LOGGER.error(f"Error reading or validating {file_path}: {e}. Re-initializing.")
                data = []
                file_exists = False

        current_names = {item['name'] for item in data}
        needs_update = False
        types_to_add = []
        for default_obj in default_type_objects:
            if default_obj['name'] not in current_names:
                types_to_add.append(default_obj)
                needs_update = True

        if not file_exists or needs_update:
            _LOGGER.info(f"Initializing or updating {file_path} with default type objects.")
            updated_data = data + types_to_add
            # Sort by name for consistency
            updated_data.sort(key=lambda x: x['name'])
            self._write_json(file_path, updated_data)
            _LOGGER.info(f"Successfully wrote default type objects to {file_path}")
        else:
            _LOGGER.debug(f"File {file_path} exists and contains all default types.")

    def _read_json(self, file_path):
        try:
            with open(file_path, 'r') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            _LOGGER.error(f"Error reading {file_path}: {e}")
            # Depending on the file type, return an appropriate empty default
            if file_path in [ACCOUNTS_FILE, ASSETS_FILE, MANUAL_LIABILITIES_FILE, MANUAL_CREDIT_CARDS_FILE]: # Added MANUAL_CREDIT_CARDS_FILE
                return {}
            elif file_path in [BANKS_FILE, ACCOUNT_TYPES_FILE, ASSET_TYPES_FILE, LIABILITY_TYPES_FILE, PAYMENT_METHODS_FILE, MANAGED_CATEGORIES_FILE, MANAGED_PAYEES_FILE, IMPORTED_YNAB_PAYEE_IDS_FILE, POINTS_PROGRAMS_FILE, REWARDS_CATEGORIES_FILE, REWARDS_PAYEES_FILE]: # Added POINTS_PROGRAMS_FILE, REWARDS_CATEGORIES_FILE, REWARDS_PAYEES_FILE
                return []
            return None # Or raise an error

    def _write_json(self, file_path, data):
        """Write data to a JSON file with better error handling."""
        try:
            _LOGGER.debug(f"Attempting to write to {file_path}. Data type: {type(data)}")

            # Create the directory if it doesn't exist
            os.makedirs(os.path.dirname(file_path), exist_ok=True)

            # Special handling for empty list
            if isinstance(data, list) and len(data) == 0:
                _LOGGER.info(f"Writing empty list to {file_path}")
                with open(file_path, 'w') as f:
                    f.write("[]")  # Directly write empty list
                return True

            # Log first few items if it's a list
            if isinstance(data, list):
                _LOGGER.debug(f"Data is a list with {len(data)} items")
                for i, item in enumerate(data[:3]):  # Check first 3 items
                    _LOGGER.debug(f"Item {i} type: {type(item)}")

            # Verify data is serializable
            try:
                json_str = json.dumps(data, indent=4)
                # Write the data
                with open(file_path, 'w') as f:
                    f.write(json_str)
                _LOGGER.debug(f"Successfully wrote data to {file_path}")
                return True
            except TypeError as stest:
                _LOGGER.error(f"Data is not JSON serializable: {stest}. Attempting fallback serialization.")
                # Try fallback serialization with str defaults
                with open(file_path, 'w') as f:
                    json.dump(data, f, indent=4, default=str)
                _LOGGER.info(f"Successfully wrote data to {file_path} using fallback serialization")
                return True

        except TypeError as te:
            _LOGGER.error(f"Serialization Error writing to {file_path}: {te}")
            # Log the problematic data snippet
            problem_snippet = str(data)[:500] if data else "None"  # Log first 500 chars
            _LOGGER.error(f"Problematic data snippet (approx): {problem_snippet}")
            return False

        except Exception as e:
            _LOGGER.error(f"Error writing to {file_path}: {e.__class__.__name__} - {e}")
            return False

    def _title_case(self, text):
        """Properly title cases text, capitalizing the first letter of each word."""
        if not text:
            return text
        # Split on spaces, title case each word, and rejoin
        return ' '.join(word.capitalize() for word in text.split())

    # --- Managed Categories ---
    def get_managed_categories(self):
        return self._read_json(MANAGED_CATEGORIES_FILE)

    def save_managed_categories(self, categories):
        # Basic validation: ensure it's a list of dicts with id and name?
        if not isinstance(categories, list):
            _LOGGER.error("Invalid format for saving managed categories: must be a list.")
            return False
        for cat in categories:
            if not isinstance(cat, dict) or 'id' not in cat or 'name' not in cat:
                _LOGGER.error(f"Invalid category item format: {cat}")
                return False
        self._write_json(MANAGED_CATEGORIES_FILE, categories)
        return True

    # --- Managed Payees ---
    def get_managed_payees(self):
        return self._read_json(MANAGED_PAYEES_FILE)

    def save_managed_payees(self, payees):
        # Basic validation similar to categories
        if not isinstance(payees, list):
            _LOGGER.error("Invalid format for saving managed payees: must be a list.")
            return False
        for payee in payees:
             if not isinstance(payee, dict) or 'id' not in payee or 'name' not in payee:
                 _LOGGER.error(f"Invalid payee item format: {payee}")
                 return False
        self._write_json(MANAGED_PAYEES_FILE, payees)
        return True

    # --- Imported YNAB Payee IDs ---
    def get_imported_ynab_payee_ids(self):
        return self._read_json(IMPORTED_YNAB_PAYEE_IDS_FILE)

    def save_imported_ynab_payee_ids(self, ids):
        if not isinstance(ids, list) or not all(isinstance(i, str) for i in ids):
            _LOGGER.error("Invalid format for saving imported YNAB payee IDs: must be a list of strings.")
            return False
        self._write_json(IMPORTED_YNAB_PAYEE_IDS_FILE, ids)
        return True

    # --- Manual Account Data ---
    def get_manual_accounts(self):
        """Gets all manually stored account details, keyed by YNAB account ID."""
        return self._read_json(ACCOUNTS_FILE)

    def get_manual_account_details(self, ynab_account_id, account_type=None):
        """Gets manual details for a specific account, ensuring allocation_rules format and default status."""
        accounts = self.get_manual_accounts()
        details = accounts.get(ynab_account_id, {})

        # Determine the default status for the remaining rule
        # Prioritize manual account type, then YNAB type
        effective_account_type = details.get('account_type', account_type)
        default_status = "Frozen" if effective_account_type and effective_account_type == "Savings" else "Liquid"
        _LOGGER.debug(f"Account {ynab_account_id}: Effective type '{effective_account_type}', Default remaining status: '{default_status}'")

        needs_save = False # Flag if we modified the rules and need to save back
        # Ensure allocation_rules exists and has the default remaining rule if empty
        if 'allocation_rules' not in details or not isinstance(details['allocation_rules'], list):
            _LOGGER.debug(f"Initializing allocation_rules for account {ynab_account_id} with default status '{default_status}'")
            details['allocation_rules'] = [
                {
                    "id": "remaining",
                    "type": "remaining",
                    "value": None,
                    "status": default_status,
                    "isRemaining": True
                }
            ]
            needs_save = True # We created the default rules
            # Remove old keys if migrating
            details.pop('allocation_liquid', None)
            details.pop('allocation_frozen', None)
            details.pop('allocation_deep_freeze', None)

        # Ensure the 'remaining' rule is always last and exists, and has correct default status if not modified
        remaining_rule = next((rule for rule in details['allocation_rules'] if rule.get('id') == 'remaining'), None)

        if not remaining_rule:
            _LOGGER.debug(f"Adding missing remaining rule for account {ynab_account_id} with status '{default_status}'")
            # Remove any potential duplicates first
            details['allocation_rules'] = [rule for rule in details['allocation_rules'] if rule.get('id') != 'remaining']
            details['allocation_rules'].append({
                "id": "remaining", "type": "remaining", "value": None, "status": default_status, "isRemaining": True
            })
            needs_save = True
        elif details['allocation_rules'][-1].get('id') != 'remaining':
            _LOGGER.debug(f"Moving remaining rule to end for account {ynab_account_id}")
            # Move existing remaining rule to the end
            remaining_rule_instance = next((rule for rule in details['allocation_rules'] if rule.get('id') == 'remaining'), None)
            details['allocation_rules'] = [rule for rule in details['allocation_rules'] if rule.get('id') != 'remaining']
            details['allocation_rules'].append(remaining_rule_instance)
            needs_save = True
        # Optionally: Update the status of an existing remaining rule if it still has the OLD default
        # This is debatable - maybe we shouldn't overwrite if the user set it previously?
        # For now, let's NOT overwrite an existing remaining rule's status automatically.
        # else:
        #     # Check if the status needs updating based on current default
        #     if remaining_rule.get('status') != default_status:
        #         # This part is tricky - was it the old default or user-set?
        #         # We might need a flag or heuristic. Let's skip auto-update for now.
        #         pass

        # If we made changes (added/moved rules), save them back immediately
        if needs_save:
            _LOGGER.info(f"Saving updated/initialized allocation rules for account {ynab_account_id}")
            accounts = self.get_manual_accounts()
            accounts[ynab_account_id] = details
            self._write_json(ACCOUNTS_FILE, accounts)

        return details

    def save_manual_account_details(self, ynab_account_id, details):
        """Saves or updates manual details. Merges with existing data.
           Expects allocation_rules in payload if they are being modified.
        """
        try:
            if not ynab_account_id:
                _LOGGER.error("Missing account ID for save operation")
                return False

            _LOGGER.info(f"💾 Saving manual account details for {ynab_account_id}")
            accounts = self.get_manual_accounts()
            current_details = accounts.get(ynab_account_id, {})

            _LOGGER.info(f"💾 Current details: {current_details}")
            _LOGGER.info(f"💾 New details: {details}")

            if not isinstance(details, dict):
                _LOGGER.error(f"💾 Invalid details format: {type(details)}")
                return False

            # If the request contains a 'details' field, it might be wrapped by frontend
            if 'details' in details and isinstance(details['details'], dict):
                _LOGGER.info("💾 Request has nested 'details' field, extracting...")
                details = details['details']

            # Enhanced account_type normalization and consistency
            if 'account_type' in details:
                # Strip whitespace and ensure proper capitalization
                original_account_type = details['account_type']
                # Ensure it's a string before stripping
                if not isinstance(original_account_type, str):
                    _LOGGER.error(f"Invalid type for 'account_type' received: {type(original_account_type)}. Value: {original_account_type}")
                    # Decide how to handle: return False, default, raise error?
                    # For now, let's try to extract name if it looks like our object format
                    if isinstance(original_account_type, dict) and 'name' in original_account_type:
                        normalized_type = original_account_type['name'].strip()
                        _LOGGER.warning("Received account_type as object, extracted name.")
                    else:
                        return False # Cannot proceed
                else:
                     normalized_type = original_account_type.strip()


                # Check against existing account types (which are dicts) for exact case match on name
                existing_types = self.get_account_types()
                # Compare incoming string with the 'name' field of the existing type dicts
                case_match_obj = next((t_obj for t_obj in existing_types if isinstance(t_obj, dict) and t_obj.get('name', '').lower() == normalized_type.lower()), None)

                if case_match_obj:
                    # Use the existing case version (name) from the matched object
                    details['account_type'] = case_match_obj['name']
                    _LOGGER.debug(f"Account type case-matched to existing type: '{original_account_type}' → '{details['account_type']}'")
                else:
                    # If no match, apply standard capitalization to the incoming string
                    details['account_type'] = normalized_type.capitalize()
                    _LOGGER.debug(f"Normalized account_type with standard capitalization: '{original_account_type}' → '{details['account_type']}'")

                # For consistency, also store as 'type' if not present
                if 'type' not in details:
                    details['type'] = details['account_type']
                    _LOGGER.debug(f"Also storing account_type as type field: '{details['account_type']}'")
            elif 'type' in details:
                # If only type is provided, ensure it's also stored as account_type with proper formatting
                original_type = details['type']
                 # Ensure it's a string before stripping
                if not isinstance(original_type, str):
                    _LOGGER.error(f"Invalid type for 'type' received: {type(original_type)}. Value: {original_type}")
                    if isinstance(original_type, dict) and 'name' in original_type:
                        normalized_type = original_type['name'].strip()
                        _LOGGER.warning("Received type as object, extracted name.")
                    else:
                        return False # Cannot proceed
                else:
                    normalized_type = original_type.strip()

                # Check against existing account types (which are dicts)
                existing_types = self.get_account_types()
                # Compare incoming string with the 'name' field of the existing type dicts
                case_match_obj = next((t_obj for t_obj in existing_types if isinstance(t_obj, dict) and t_obj.get('name', '').lower() == normalized_type.lower()), None)

                if case_match_obj:
                    details['type'] = case_match_obj['name']
                    details['account_type'] = case_match_obj['name']
                    _LOGGER.debug(f"Type field case-matched to existing type: '{original_type}' → '{case_match_obj['name']}'")
                else:
                    details['type'] = normalized_type.capitalize()
                    details['account_type'] = details['type']
                    _LOGGER.debug(f"Normalized type field with standard capitalization: '{original_type}' → '{details['type']}'")

            # Ensure final account_type is properly capitalized before merging
            if 'account_type' in details and isinstance(details['account_type'], str):
                details['account_type'] = self._title_case(details['account_type'])
                _LOGGER.debug(f"Applied final title case normalization: '{details['account_type']}'")
                # Ensure 'type' is also updated if it exists
                if 'type' in details:
                    details['type'] = details['account_type']

            # If allocation_rules are in the payload, validate them
            if 'allocation_rules' in details:
                if not isinstance(details['allocation_rules'], list):
                    _LOGGER.error("Invalid details format: allocation_rules must be a list.")
                    return False
                # Ensure the final rule is the 'remaining' one
                if not details['allocation_rules'] or details['allocation_rules'][-1].get('id') != 'remaining':
                    _LOGGER.error("Invalid allocation_rules: Final rule must be the 'remaining' rule.")
                    return False
                # Remove old direct allocation fields if present in payload (shouldn't be)
                details.pop('allocation_liquid', None)
                details.pop('allocation_frozen', None)
                details.pop('allocation_deep_freeze', None)

            # Merge new details into current details
            # This preserves fields not included in the payload (e.g., if only saving notes)
            _LOGGER.info(f"💾 Merging new details into current details")
            current_details.update(details)

            # <<< MOVE CAPITALIZATION HERE >>>
            # Ensure final account_type is properly capitalized *after* merging
            if 'account_type' in current_details and isinstance(current_details['account_type'], str):
                current_details['account_type'] = self._title_case(current_details['account_type'])
                _LOGGER.debug(f"Applied final title case normalization after merge: '{current_details['account_type']}'")
                # Ensure 'type' is also updated if it exists
                if 'type' in current_details:
                    current_details['type'] = current_details['account_type']

            # Explicitly overwrite allocation_rules if they were provided in the payload
            if 'allocation_rules' in details:
                _LOGGER.debug(f"💾 Explicitly updating allocation_rules from payload.")
                current_details['allocation_rules'] = details['allocation_rules']

            # If allocation_rules are now missing after merge (e.g., empty payload overwrote them?),
            # re-initialize them. This shouldn't happen with dict.update but is a safeguard.
            if 'allocation_rules' not in current_details or not isinstance(current_details.get('allocation_rules'), list):
                 _LOGGER.warning(f"Allocation rules missing after update for {ynab_account_id}. Re-initializing.")
                 # Need account type here to get the correct default! Fetch it?
                 # For simplicity now, default to Liquid if re-initializing here.
                 current_details['allocation_rules'] = [
                    {"id": "remaining", "type": "remaining", "value": None, "status": "Liquid", "isRemaining": True}
                 ]

            _LOGGER.info(f"💾 Final account details to be saved: {current_details}")
            accounts[ynab_account_id] = current_details
            # <<< ADD LOGGING HERE >>>
            _LOGGER.info(f"💾 Just before write_json: allocation_rules = {current_details.get('allocation_rules')}")
            # <<< END LOGGING >>>
            self._write_json(ACCOUNTS_FILE, accounts)
            _LOGGER.info(f"💾 Successfully saved details for account {ynab_account_id}")
            return True
        except Exception as e:
            import traceback
            _LOGGER.error(f"💾 Error saving manual account details: {e}")
            _LOGGER.error(f"💾 Traceback: {traceback.format_exc()}")
            return False

    def delete_manual_account_details(self, ynab_account_id):
        """Deletes manual details for a specific account."""
        accounts = self.get_manual_accounts()
        if ynab_account_id in accounts:
            del accounts[ynab_account_id]
            self._write_json(ACCOUNTS_FILE, accounts)
            return True
        return False

    # --- Manual Asset Data ---
    def get_manual_assets(self):
        """Gets all manually stored asset details, keyed by asset ID (YNAB or UUID)."""
        return self._read_json(ASSETS_FILE)

    def get_manual_asset_details(self, asset_id):
        """Gets manual details for a specific asset."""
        assets = self.get_manual_assets()
        return assets.get(asset_id)

    def save_manual_asset(self, asset_id, details):
        """Saves or updates manual details for a specific asset.
           Generates a UUID if asset_id is None (for new manual assets).
        """
        assets = self.get_manual_assets()
        if not isinstance(details, dict):
             _LOGGER.error("Invalid details format for saving manual asset.")
             return None # Return None on failure

        # If asset_id is None, generate a new UUID
        if asset_id is None:
            asset_id = str(uuid.uuid4())
            _LOGGER.info(f"Generated new UUID for manual asset: {asset_id}")

        details['id'] = asset_id # Ensure the ID is part of the details stored
        assets[asset_id] = details
        self._write_json(ASSETS_FILE, assets)
        _LOGGER.info(f"Saved asset details for ID: {asset_id}")
        return asset_id # Return the ID (new or existing)

    def delete_manual_asset(self, asset_id):
        """Deletes manual details for a specific asset by its ID."""
        assets = self.get_manual_assets()
        if asset_id in assets:
            del assets[asset_id]
            self._write_json(ASSETS_FILE, assets)
            _LOGGER.info(f"Deleted asset with ID: {asset_id}")
            return True
        _LOGGER.warning(f"Attempted to delete non-existent asset with ID: {asset_id}")
        return False

    # --- Banks ---
    def get_banks(self):
        """Gets the list of banks as {id, name} objects."""
        banks_raw = self._read_json(BANKS_FILE)
        if not isinstance(banks_raw, list):
            _LOGGER.warning(f"Banks file {BANKS_FILE} corrupted or not a list. Resetting.")
            self._write_json(BANKS_FILE, []) # Attempt to fix the file
            return []

        formatted_banks = []
        needs_resave = False
        processed_names = set() # To handle case-insensitive duplicates during conversion

        for bank in banks_raw:
            if isinstance(bank, str):
                bank_name = bank.strip()
                if bank_name and bank_name.lower() not in processed_names:
                    formatted_banks.append({"id": bank_name, "name": bank_name})
                    processed_names.add(bank_name.lower())
                    needs_resave = True # Mark for resave if conversion happened
            elif isinstance(bank, dict) and "name" in bank:
                 name = bank.get("name", "").strip()
                 if name:
                     # Use name as ID if ID is missing or invalid, otherwise use existing ID
                     bank_id = bank.get("id", name)
                     if not isinstance(bank_id, str) or not bank_id:
                         bank_id = name

                     if name.lower() not in processed_names:
                         formatted_banks.append({"id": bank_id, "name": name})
                         processed_names.add(name.lower())
                         if bank.get("id") != bank_id: # Mark for resave if ID was fixed
                             needs_resave = True
                     else:
                          _LOGGER.warning(f"Skipping duplicate bank name during load: {name}")

            else:
                 _LOGGER.warning(f"Skipping invalid entry in banks file: {bank}")

        # Sort by name, case-insensitive
        formatted_banks.sort(key=lambda x: x['name'].lower())

        # If we converted strings or fixed IDs, save the updated format back
        if needs_resave:
             _LOGGER.info(f"Resaving banks file {BANKS_FILE} in standardized format.")
             self._write_json(BANKS_FILE, formatted_banks)

        return formatted_banks

    def add_bank(self, bank_name):
        """Adds a new bank, storing as {id, name}. ID is the name."""
        if not bank_name or not isinstance(bank_name, str):
            return False, "Bank name must be a non-empty string", None

        normalized_name = bank_name.strip()
        if not normalized_name:
            return False, "Bank name cannot be empty", None

        banks = self.get_banks() # Already returns sorted list of dicts

        # Case-insensitive check if bank already exists by name
        if any(b['name'].lower() == normalized_name.lower() for b in banks):
            return False, f"Bank '{normalized_name}' already exists", None

        new_bank = {"id": normalized_name, "name": normalized_name}
        banks.append(new_bank)
        banks.sort(key=lambda x: x['name'].lower()) # Keep sorted
        self._write_json(BANKS_FILE, banks) # Fix indentation
        return True, "Bank added successfully", banks # Return the full updated list

    def update_bank(self, old_name, new_name):
        """Updates a bank name. Updates both id and name."""
        if not old_name or not new_name or not isinstance(old_name, str) or not isinstance(new_name, str):
            return {"error": "Bank names must be non-empty strings"}

        old_name_norm = old_name.strip()
        new_name_norm = new_name.strip()
        if not old_name_norm or not new_name_norm:
            return {"error": "Bank names cannot be empty"}

        banks = self.get_banks() # Already returns sorted list of dicts
        bank_to_update = next((b for b in banks if b['name'].lower() == old_name_norm.lower()), None)

        if not bank_to_update:
            return {"error": f"Bank '{old_name_norm}' not found"}

        # Check if the new name already exists (and is different from old name)
        if old_name_norm.lower() != new_name_norm.lower() and any(b['name'].lower() == new_name_norm.lower() for b in banks):
            return {"error": f"Bank '{new_name_norm}' already exists"}

        # Update the specific dictionary; ID also changes as it's based on name
        bank_to_update['id'] = new_name_norm
        bank_to_update['name'] = new_name_norm

        # The list contains the reference, so modification is reflected. Now just sort and save.
        banks.sort(key=lambda x: x['name'].lower())
        self._write_json(BANKS_FILE, banks)

        # Also update any credit cards that use this bank
        cards = self.get_manual_credit_cards()
        cards_updated = False
        for i, card in enumerate(cards):
             # Check if 'bank' field exists and matches the old name (case-insensitive)
            if card.get('bank') and isinstance(card['bank'], str) and card['bank'].lower() == old_name_norm.lower():
                cards[i]['bank'] = new_name_norm # Update to the new name
                cards_updated = True

        if cards_updated:
            _LOGGER.info(f"Updating manual credit cards file after renaming bank '{old_name_norm}' to '{new_name_norm}'")
            self._write_json(MANUAL_CREDIT_CARDS_FILE, cards)
            self.MANUAL_CREDIT_CARDS = cards # Update cache

        return {"success": True, "banks": banks} # Return the full updated list

    def delete_bank(self, name):
        """Deletes a bank by name."""
        if not name or not isinstance(name, str):
            return {"error": "Bank name must be a non-empty string"}

        name_norm = name.strip()
        if not name_norm:
            return {"error": "Bank name cannot be empty"}

        banks = self.get_banks() # Returns list of dicts
        original_length = len(banks)

        # Filter out the bank to delete (case-insensitive by name)
        updated_banks = [b for b in banks if b['name'].lower() != name_norm.lower()]

        if len(updated_banks) == original_length:
            return {"error": f"Bank '{name_norm}' not found"}

        # Check if any credit cards use this bank
        cards = self.get_manual_credit_cards()
        for card in cards:
            if card.get('bank') and isinstance(card['bank'], str) and card['bank'].lower() == name_norm.lower():
                return {"error": f"Cannot delete bank '{name_norm}' because it is used by card '{card.get('card_name', 'Unnamed Card')}'"}

        self._write_json(BANKS_FILE, updated_banks) # Already sorted from get_banks

        return {"success": True, "banks": updated_banks} # Return the full updated list

    # --- Account Types ---
    def get_account_types(self):
        """Gets the list of account types as {id, name} objects."""
        types_raw = self._read_json(ACCOUNT_TYPES_FILE)
        if not isinstance(types_raw, list):
            _LOGGER.warning(f"Account types file {ACCOUNT_TYPES_FILE} corrupted or not a list. Resetting.")
            self._write_json(ACCOUNT_TYPES_FILE, [])
            return []

        formatted_types = []
        needs_resave = False
        processed_names = set()

        for acct_type in types_raw:
            if isinstance(acct_type, str):
                type_name = acct_type.strip()
                if type_name and type_name.lower() not in processed_names:
                    formatted_types.append({"id": type_name, "name": type_name})
                    processed_names.add(type_name.lower())
                    needs_resave = True
            elif isinstance(acct_type, dict) and "name" in acct_type:
                 name = acct_type.get("name", "").strip()
                 if name:
                     type_id = acct_type.get("id", name)
                     if not isinstance(type_id, str) or not type_id:
                         type_id = name

                     if name.lower() not in processed_names:
                         formatted_types.append({"id": type_id, "name": name})
                         processed_names.add(name.lower())
                         if acct_type.get("id") != type_id:
                             needs_resave = True
                     else:
                         _LOGGER.warning(f"Skipping duplicate account type name during load: {name}")
            else:
                 _LOGGER.warning(f"Skipping invalid entry in account types file: {acct_type}")

        formatted_types.sort(key=lambda x: x['name'].lower())

        if needs_resave:
             _LOGGER.info(f"Resaving account types file {ACCOUNT_TYPES_FILE} in standardized format.")
             self._write_json(ACCOUNT_TYPES_FILE, formatted_types)

        return formatted_types


    def add_account_type(self, type_name):
        """Adds a new account type, storing as {id, name}. ID is the name."""
        if not type_name or not isinstance(type_name, str):
            return False, "Account type name must be a non-empty string", None

        normalized_name = type_name.strip()
        if not normalized_name:
             return False, "Account type name cannot be empty", None

        types = self.get_account_types() # Returns sorted list of dicts

        if any(t['name'].lower() == normalized_name.lower() for t in types):
            return False, f"Account type '{normalized_name}' already exists", None

        new_type = {"id": normalized_name, "name": normalized_name}
        types.append(new_type)
        types.sort(key=lambda x: x['name'].lower())
        self._write_json(ACCOUNT_TYPES_FILE, types) # Fix indentation
        return True, "Account type added successfully", types # Return full updated list

    def update_account_type(self, old_name, new_name):
        """Updates an account type name. Updates both id and name."""
        if not old_name or not new_name or not isinstance(old_name, str) or not isinstance(new_name, str):
            return {"error": "Account type names must be non-empty strings"}

        old_name_norm = old_name.strip()
        new_name_norm = new_name.strip()
        if not old_name_norm or not new_name_norm:
             return {"error": "Account type names cannot be empty"}

        types = self.get_account_types() # Returns sorted list of dicts
        type_to_update = next((t for t in types if t['name'].lower() == old_name_norm.lower()), None)

        if not type_to_update:
            return {"error": f"Account type '{old_name_norm}' not found"}

        if old_name_norm.lower() != new_name_norm.lower() and any(t['name'].lower() == new_name_norm.lower() for t in types):
            return {"error": f"Account type '{new_name_norm}' already exists"}

        # Update the specific dictionary
        type_to_update['id'] = new_name_norm
        type_to_update['name'] = new_name_norm

        types.sort(key=lambda x: x['name'].lower())
        self._write_json(ACCOUNT_TYPES_FILE, types) # Fix indentation

        # TODO: Update manual accounts that might use this type?

        return {"success": True, "types": types} # Return full updated list

    def delete_account_type(self, type_name):
        """Deletes an account type by name."""
        if not type_name or not isinstance(type_name, str):
            return {"error": "Account type name must be a non-empty string"}

        name_norm = type_name.strip()
        if not name_norm:
             return {"error": "Account type name cannot be empty"}

        types = self.get_account_types() # Returns list of dicts
        original_length = len(types)
        updated_types = [t for t in types if t['name'].lower() != name_norm.lower()]

        if len(updated_types) == original_length:
            return {"error": f"Account type '{name_norm}' not found"}

        # TODO: Check if any manual accounts use this type before deleting?

        self._write_json(ACCOUNT_TYPES_FILE, updated_types)

        return {"success": True, "types": updated_types} # Return full updated list

    # --- Asset Types ---
    def get_asset_types(self):
        types = self._read_json(ASSET_TYPES_FILE)
        if not isinstance(types, list) or not all(isinstance(t, dict) and 'id' in t and 'name' in t for t in types):
            _LOGGER.error(f"Invalid data format in {ASSET_TYPES_FILE}. Expected list of dicts.")
            # Attempt to repair or return default
            self._ensure_default_types_structured(ASSET_TYPES_FILE, DEFAULT_ASSET_TYPES)
            return self._read_json(ASSET_TYPES_FILE) # Re-read after potential repair
        return types

    def add_asset_type(self, type_name):
        """Adds a new asset type to asset_types.json."""
        types = self.get_asset_types()
        type_name = self._title_case(type_name.strip())
        if any(t['name'].lower() == type_name.lower() for t in types):
            _LOGGER.warning(f"Asset type '{type_name}' already exists.")
            existing_type = next((t for t in types if t['name'].lower() == type_name.lower()), None)
            return existing_type # Return the existing type object
        new_type = {"id": str(uuid.uuid4()), "name": type_name}
        types.append(new_type)
        types.sort(key=lambda x: x['name']) # Keep sorted
        if self._write_json(ASSET_TYPES_FILE, types):
             _LOGGER.info(f"Added new asset type: {new_type}")
             return new_type
        else:
             _LOGGER.error(f"Failed to add asset type '{type_name}'")
             return None

    def update_asset_type(self, type_id, new_name):
        """Updates the name of an existing asset type."""
        types = self.get_asset_types()
        new_name = self._title_case(new_name.strip())
        target_index = -1
        for i, t in enumerate(types):
            if t['id'] == type_id:
                target_index = i
                break

        if target_index == -1:
            _LOGGER.error(f"Asset type with ID '{type_id}' not found for update.")
            return False

        # Check if new name already exists (case-insensitive) excluding the current item
        if any(t['name'].lower() == new_name.lower() and t['id'] != type_id for t in types):
             _LOGGER.warning(f"Asset type name '{new_name}' already exists.")
             return False # Or handle as needed, maybe return the conflicting item's ID?

        _LOGGER.info(f"Updating asset type ID {type_id} name from '{types[target_index]['name']}' to '{new_name}'")
        types[target_index]['name'] = new_name
        types.sort(key=lambda x: x['name']) # Keep sorted
        if self._write_json(ASSET_TYPES_FILE, types):
            _LOGGER.info(f"Successfully updated asset type ID {type_id}")
            return True
        else:
            _LOGGER.error(f"Failed to update asset type ID {type_id}")
            return False

    def delete_asset_type(self, type_id):
        """Deletes an asset type from asset_types.json."""
        types = self.get_asset_types()
        original_length = len(types)
        types_to_keep = [t for t in types if t['id'] != type_id]

        if len(types_to_keep) == original_length:
            _LOGGER.warning(f"Asset type with ID '{type_id}' not found for deletion.")
            return False

        # Note: No need to re-sort after deletion
        if self._write_json(ASSET_TYPES_FILE, types_to_keep):
            _LOGGER.info(f"Deleted asset type with ID: {type_id}")
            # TODO: Add logic to update assets that used this type? Set to null or default?
            return True
        else:
            _LOGGER.error(f"Failed to delete asset type with ID '{type_id}'")
            return False

    # --- Liability Types ---
    def get_liability_types(self):
        types = self._read_json(LIABILITY_TYPES_FILE)
        if not isinstance(types, list) or not all(isinstance(t, dict) and 'id' in t and 'name' in t for t in types):
            _LOGGER.error(f"Invalid data format in {LIABILITY_TYPES_FILE}. Expected list of dicts.")
            # Attempt to repair or return default
            self._ensure_default_types_structured(LIABILITY_TYPES_FILE, DEFAULT_LIABILITY_TYPES)
            return self._read_json(LIABILITY_TYPES_FILE) # Re-read after potential repair
        return types

    def add_liability_type(self, type_name):
        """Adds a new liability type to liability_types.json."""
        types = self.get_liability_types()
        type_name = self._title_case(type_name.strip())
        if any(t['name'].lower() == type_name.lower() for t in types):
            _LOGGER.warning(f"Liability type '{type_name}' already exists.")
            existing_type = next((t for t in types if t['name'].lower() == type_name.lower()), None)
            return existing_type # Return the existing type object
        new_type = {"id": str(uuid.uuid4()), "name": type_name}
        types.append(new_type)
        types.sort(key=lambda x: x['name']) # Keep sorted
        if self._write_json(LIABILITY_TYPES_FILE, types):
            _LOGGER.info(f"Added new liability type: {new_type}")
            return new_type
        else:
            _LOGGER.error(f"Failed to add liability type '{type_name}'")
            return None

    def update_liability_type(self, type_id, new_name):
        """Updates the name of an existing liability type."""
        types = self.get_liability_types()
        new_name = self._title_case(new_name.strip())
        target_index = -1
        for i, t in enumerate(types):
            if t['id'] == type_id:
                target_index = i
                break

        if target_index == -1:
            _LOGGER.error(f"Liability type with ID '{type_id}' not found for update.")
            return False

        # Check if new name already exists (case-insensitive) excluding the current item
        if any(t['name'].lower() == new_name.lower() and t['id'] != type_id for t in types):
             _LOGGER.warning(f"Liability type name '{new_name}' already exists.")
             return False

        _LOGGER.info(f"Updating liability type ID {type_id} name from '{types[target_index]['name']}' to '{new_name}'")
        types[target_index]['name'] = new_name
        types.sort(key=lambda x: x['name']) # Keep sorted
        if self._write_json(LIABILITY_TYPES_FILE, types):
            _LOGGER.info(f"Successfully updated liability type ID {type_id}")
            return True
        else:
            _LOGGER.error(f"Failed to update liability type ID {type_id}")
            return False

    def delete_liability_type(self, type_id):
        """Deletes a liability type from liability_types.json."""
        types = self.get_liability_types()
        original_length = len(types)
        types_to_keep = [t for t in types if t['id'] != type_id]

        if len(types_to_keep) == original_length:
            _LOGGER.warning(f"Liability type with ID '{type_id}' not found for deletion.")
            return False

        if self._write_json(LIABILITY_TYPES_FILE, types_to_keep):
            _LOGGER.info(f"Deleted liability type with ID: {type_id}")
            # TODO: Add logic to update liabilities that used this type?
            return True
        else:
            _LOGGER.error(f"Failed to delete liability type with ID '{type_id}'")
            return False

    # --- Manual Liability Data ---
    def get_manual_liabilities(self):
        """Gets all manually stored liability details (for YNAB enrichment), keyed by YNAB account ID."""
        return self._read_json(MANUAL_LIABILITIES_FILE)

    def get_manual_liability_details(self, ynab_account_id):
        """Gets manual details for a specific YNAB liability."""
        liabilities = self.get_manual_liabilities()
        return liabilities.get(ynab_account_id)

    def save_manual_liability_details(self, ynab_account_id, details):
        """Saves or updates manual details for a specific YNAB liability."""
        liabilities = self.get_manual_liabilities()
        if not isinstance(details, dict):
             _LOGGER.error("Invalid details format for saving manual liability details.")
             return False
        liabilities[ynab_account_id] = details
        self._write_json(MANUAL_LIABILITIES_FILE, liabilities)
        return True

    def delete_manual_liability_details(self, ynab_account_id):
        """Deletes manual details for a specific YNAB liability."""
        liabilities = self.get_manual_liabilities()
        if ynab_account_id in liabilities:
            del liabilities[ynab_account_id]
            self._write_json(MANUAL_LIABILITIES_FILE, liabilities)
            return True
        return False

    # --- Purely Manual Liabilities (Not linked to YNAB accounts) ---
    def get_manual_only_liabilities(self):
        """Gets all purely manual liabilities, keyed by UUID."""
        return self._read_json(MANUAL_ONLY_LIABILITIES_FILE)

    def add_manual_liability(self, details):
        """Adds a new purely manual liability, generating a UUID."""
        liabilities = self.get_manual_only_liabilities()
        if not isinstance(details, dict):
            _LOGGER.error("Invalid details format for adding manual liability.")
            return None # Indicate failure

        # Generate new ID
        new_id = str(uuid.uuid4())
        details['id'] = new_id
        details['is_ynab'] = False # Explicitly mark as manual
        details['value_last_updated'] = None # Initialize

        # Ensure required fields have defaults?
        details.setdefault('name', f"Manual Liability ({details.get('type', 'Unknown')})")
        details.setdefault('type', None)
        details.setdefault('value', 0)
        details.setdefault('bank', None)
        details.setdefault('interest_rate', None)
        details.setdefault('start_date', None)
        details.setdefault('notes', None)

        liabilities[new_id] = details
        self._write_json(MANUAL_ONLY_LIABILITIES_FILE, liabilities)
        _LOGGER.info(f"Added new manual liability with ID: {new_id}")
        return liabilities[new_id] # Return the newly added liability object

    def update_manual_liability(self, liability_id, update_data):
        """Updates an existing purely manual liability by UUID."""
        liabilities = self.get_manual_only_liabilities()
        if liability_id not in liabilities:
            _LOGGER.warning(f"Attempted to update non-existent manual liability: {liability_id}")
            return False

        if not isinstance(update_data, dict):
            _LOGGER.error("Invalid update_data format for updating manual liability.")
            return False

        # Get existing data and update it selectively
        existing_data = liabilities[liability_id]
        # Only update fields present in update_data
        for key, value in update_data.items():
            # Ensure we don't overwrite critical internal fields like id or is_ynab
            if key not in ['id', 'is_ynab']:
                existing_data[key] = value

        # Ensure 'value_last_updated' is updated? Maybe not needed here.

        liabilities[liability_id] = existing_data # Put the merged data back
        self._write_json(MANUAL_ONLY_LIABILITIES_FILE, liabilities)
        _LOGGER.info(f"Updated manual liability with ID: {liability_id}")
        return True

    def delete_manual_liability(self, liability_id):
        """Deletes a purely manual liability by UUID."""
        liabilities = self.get_manual_only_liabilities()
        if liability_id in liabilities:
            del liabilities[liability_id]
            self._write_json(MANUAL_ONLY_LIABILITIES_FILE, liabilities)
            _LOGGER.info(f"Deleted manual liability: {liability_id}")
            return True
        _LOGGER.warning(f"Attempted to delete non-existent manual liability: {liability_id}")
        return False

    # --- Manual Credit Card Data ---
    def get_manual_credit_cards(self):
        """Gets the list of manual credit cards, performing validation and standardization."""
        # Existing code to read and validate base structure...
        if hasattr(self, 'MANUAL_CREDIT_CARDS'):
            return self.MANUAL_CREDIT_CARDS

        raw_cards_data = self._read_json(MANUAL_CREDIT_CARDS_FILE)
        if not raw_cards_data:
            self.MANUAL_CREDIT_CARDS = []
            return self.MANUAL_CREDIT_CARDS

        valid_cards = []
        standardized_card_ids = set()
        _LOGGER.debug("[LOAD_DEBUG] Starting get_manual_credit_cards")
        _LOGGER.debug(f"[LOAD_DEBUG] Raw data type: {type(raw_cards_data)}, Data: {raw_cards_data}")

        for i, card in enumerate(raw_cards_data):
            _LOGGER.debug(f"[LOAD_DEBUG] Processing card {i+1}/{len(raw_cards_data)}: Type={type(card)}, Data={card}")
            if not isinstance(card, dict):
                _LOGGER.warning(f"Skipping invalid non-dictionary entry in manual_credit_cards.json: {card}")
                continue

            if 'id' not in card or not card.get('id'):
                card['id'] = str(uuid.uuid4())
                _LOGGER.warning(f"Assigned new UUID {card['id']} to a card missing an ID.")
            elif card['id'] in standardized_card_ids:
                _LOGGER.warning(f"Skipping duplicate card ID found during standardization: {card['id']}")
                continue
            standardized_card_ids.add(card['id'])
            _LOGGER.debug(f"[LOAD_DEBUG] Card ID: {card['id']}")

            # --- Start: Add new field defaults and normalization ---
            card.setdefault('base_rate', 0.0)
            card.setdefault('reward_system', 'Cashback')
            card.setdefault('points_program', None)
            # --- New Field Defaults ---
            card.setdefault('requires_activation', False)
            card.setdefault('rotating_period_status', [])
            # --- End New Field Defaults ---

            # Ensure reward_system is valid
            if card['reward_system'] not in ['Cashback', 'Points']:
                _LOGGER.warning(f"Invalid reward_system '{card['reward_system']}' for card {card['id']}, defaulting to Cashback.")
                card['reward_system'] = 'Cashback'

            # Ensure points_program is None if system is Cashback
            if card['reward_system'] == 'Cashback' and card['points_program'] is not None:
                _LOGGER.warning(f"Points program set for Cashback card {card['id']}, setting to None.")
                card['points_program'] = None
            # --- End: Add new field defaults and normalization ---

            # Normalize reward structure fields (using .get for safety)
            if card.get('reward_type') and 'reward_structure_type' not in card:
                 card['reward_structure_type'] = card['reward_type']

            if card.get('rotating_period') and 'rotation_period' not in card:
                 card['rotation_period'] = card['rotating_period']

            if card.get('dynamic_period') and 'activation_period' not in card:
                 card['activation_period'] = card['dynamic_period']

            if 'reward_structure_type' not in card:
                 card['reward_structure_type'] = 'Static'
                 _LOGGER.debug(f"[LOAD_DEBUG] Card {card['id']}: Defaulting reward_structure_type to Static")
            else:
                _LOGGER.debug(f"[LOAD_DEBUG] Card {card['id']}: Existing reward_structure_type: {card['reward_structure_type']}")

            # Ensure rewards data arrays exist based on type
            reward_structure_type = card.get('reward_structure_type', 'Static')
            _LOGGER.debug(f"[LOAD_DEBUG] Card {card['id']}: Validating rewards for type: {reward_structure_type}")

            if reward_structure_type == 'Static':
                if 'static_rewards' not in card:
                    _LOGGER.debug(f"[LOAD_DEBUG] Card {card['id']}: Initializing missing static_rewards = []")
                    card['static_rewards'] = []
                else:
                    _LOGGER.debug(f"[LOAD_DEBUG] Card {card['id']}: Found static_rewards: Type={type(card['static_rewards'])}, Data={card['static_rewards']}")
            elif reward_structure_type == 'Rotating':
                if 'rotating_rules' not in card:
                    _LOGGER.debug(f"[LOAD_DEBUG] Card {card['id']}: Initializing missing rotating_rules = []")
                    card['rotating_rules'] = []
                else:
                    _LOGGER.debug(f"[LOAD_DEBUG] Card {card['id']}: Found rotating_rules: Type={type(card['rotating_rules'])}, Data={card['rotating_rules']}")
            elif reward_structure_type == 'Dynamic':
                if 'dynamic_tiers' not in card:
                    _LOGGER.debug(f"[LOAD_DEBUG] Card {card['id']}: Initializing missing dynamic_tiers = []")
                    card['dynamic_tiers'] = []
                else:
                    _LOGGER.debug(f"[LOAD_DEBUG] Card {card['id']}: Found dynamic_tiers: Type={type(card['dynamic_tiers'])}, Data={card['dynamic_tiers']}")

            # Ensure reward fields are not None
            for field in ['static_rewards', 'rotating_rules', 'dynamic_tiers']:
                if field in card and card[field] is None:
                    _LOGGER.debug(f"[LOAD_DEBUG] Card {card['id']}: Field '{field}' was None, setting to []")
                    card[field] = []

            _LOGGER.debug(f"[LOAD_DEBUG] Card {card['id']} after validation: {card}")
            valid_cards.append(card)

        if len(valid_cards) < len(raw_cards_data):
            _LOGGER.warning(f"Removed {len(raw_cards_data) - len(valid_cards)} invalid entries from manual_credit_cards.json during load.")
            # self._write_json(MANUAL_CREDIT_CARDS_FILE, valid_cards) # Optionally auto-heal

        self.MANUAL_CREDIT_CARDS = valid_cards
        _LOGGER.debug(f"Loaded {len(self.MANUAL_CREDIT_CARDS)} valid credit cards. Final cache: {self.MANUAL_CREDIT_CARDS}")
        return self.MANUAL_CREDIT_CARDS

    def get_manual_credit_card_details(self, ynab_account_id):
        """Gets detailed information for a specific manual credit card."""
        _LOGGER.debug(f"Getting details for credit card {ynab_account_id}")

        cards = self.get_manual_credit_cards()
        card_details = None
        for card in cards:
            if isinstance(card, dict) and card.get('id') == ynab_account_id:
                card_details = card
                break

        if not card_details:
            _LOGGER.debug(f"Creating default card for {ynab_account_id}")
            card_details = {
                'id': ynab_account_id,
                'name': '',
                'card_name_original': '',
                'bank_name': '',
                'institution_name': '',
                'last_4_digits': '',
                'credit_limit': None,
                'annual_fee': None,
                'expiration_date': None,
                'payment_day_1': None,
                'auto_pay_day_1': None,
                'payment_day_2': None,
                'auto_pay_day_2': None,
                'payment_methods': [],
                'notes': '',
                'balance': 0,
                'apr': 0,
                'base_rate': 0.0, # Add default
                'reward_system': 'Cashback', # Add default
                'points_program': None, # Add default
                'reward_structure_type': 'Static',
                'static_rewards': [],
                'rotating_rules': [],
                'rotation_period': 'Quarterly',
                'dynamic_tiers': [],
                'activation_period': 'Monthly',
                'includeBankInName': True,
                # --- New Field Defaults ---
                'requires_activation': False,
                'rotating_period_status': [],
                # --- End New Field Defaults ---
            }
        else:
            # Ensure new fields have defaults if loading an older card entry
            card_details.setdefault('base_rate', 0.0)
            card_details.setdefault('reward_system', 'Cashback')
            card_details.setdefault('points_program', None)
            # --- New Field Defaults ---
            card_details.setdefault('requires_activation', False)
            card_details.setdefault('rotating_period_status', [])
            # --- End New Field Defaults ---
             # Validate reward_system again for older entries
            if card_details['reward_system'] not in ['Cashback', 'Points']:
                card_details['reward_system'] = 'Cashback'
            if card_details['reward_system'] == 'Cashback':
                 card_details['points_program'] = None


        # Existing validation for reward structure...
        reward_structure_type = card_details.get('reward_structure_type')
        if reward_structure_type is not None:
            valid_structures = ['Static', 'Rotating', 'Dynamic']
            if reward_structure_type not in valid_structures:
                 _LOGGER.warning(f"Invalid reward_structure_type: {reward_structure_type}, setting to 'Static'")
                 card_details['reward_structure_type'] = 'Static'
                 reward_structure_type = 'Static'

            if reward_structure_type == 'Static':
                if not isinstance(card_details.get('static_rewards', []), list):
                    _LOGGER.warning(f"static_rewards is not a list for {ynab_account_id}, resetting.")
                    card_details['static_rewards'] = []
            elif reward_structure_type == 'Rotating':
                 if not isinstance(card_details.get('rotating_rules', []), list):
                    _LOGGER.warning(f"rotating_rules is not a list for {ynab_account_id}, resetting.")
                    card_details['rotating_rules'] = []
            elif reward_structure_type == 'Dynamic':
                 if not isinstance(card_details.get('dynamic_tiers', []), list):
                     _LOGGER.warning(f"dynamic_tiers is not a list for {ynab_account_id}, resetting.")
                     card_details['dynamic_tiers'] = []

        # Ensure reward arrays exist based on type
        reward_type = card_details.get('reward_structure_type', 'Static')
        if reward_type == 'Static' and 'static_rewards' not in card_details: card_details['static_rewards'] = []
        if reward_type == 'Rotating' and 'rotating_rules' not in card_details: card_details['rotating_rules'] = []
        if reward_type == 'Dynamic' and 'dynamic_tiers' not in card_details: card_details['dynamic_tiers'] = []

        # Ensure non-null arrays
        for reward_field in ['static_rewards', 'rotating_rules', 'dynamic_tiers']:
            if reward_field in card_details and card_details[reward_field] is None:
                card_details[reward_field] = []

        return card_details

    def save_manual_credit_card_details(self, card_id, card_details):
        """Saves the details of a manual credit card."""
        try:
            _LOGGER.debug(f"Starting save_manual_credit_card_details for card_id: {card_id}")
            _LOGGER.debug(f"Received details payload: {card_details}")

            cards = self.get_manual_credit_cards()
            if not isinstance(cards, list):
                _LOGGER.error(f"Cards data is not a list! Type: {type(cards)}")
                cards = []

            _LOGGER.debug(f"Loaded {len(cards)} cards, searching for card_id: {card_id}")
            card_idx = next((i for i, c in enumerate(cards) if isinstance(c, dict) and c.get('id') == card_id), None)
            _LOGGER.debug(f"Card index found: {card_idx}")

            if card_idx is None:
                _LOGGER.info(f"Card with ID {card_id} not found, creating new card")
                new_card = {
                    'id': card_id,
                    'card_name': card_details.get('card_name'),
                    'bank': card_details.get('bank'),
                    'include_bank_in_name': card_details.get('include_bank_in_name', True),
                    'last_4_digits': card_details.get('last_4_digits'),
                    'annual_fee': card_details.get('annual_fee'),
                    'credit_limit': card_details.get('credit_limit'),
                    'payment_methods': card_details.get('payment_methods', []),
                    'auto_pay_day_1': card_details.get('auto_pay_day_1'),
                    'auto_pay_day_2': card_details.get('auto_pay_day_2'),
                    'notes': card_details.get('notes'),
                    'expiration_date': card_details.get('expiration_date'),
                    'base_rate': card_details.get('base_rate', 0.0),
                    'reward_system': card_details.get('reward_system', 'Cashback'),
                    'points_program': card_details.get('points_program'),
                    'reward_structure_type': card_details.get('reward_structure_type', 'Static'),
                    'static_rewards': card_details.get('static_rewards', []),
                    'rotating_rules': card_details.get('rotating_rules', []),
                    'dynamic_tiers': card_details.get('dynamic_tiers', []),
                    'rotation_period': card_details.get('rotation_period'),
                    'activation_period': card_details.get('activation_period'),
                    # --- New Fields (for new card creation) ---
                    'requires_activation': card_details.get('requires_activation', False),
                    'rotating_period_status': card_details.get('rotating_period_status', []),
                    # --- End New Fields ---
                }
                cards.append(new_card)
                card_idx = len(cards) - 1
                target_card = cards[card_idx]
                _LOGGER.debug(f"[SAVE_DEBUG] New card template created (before validation): {target_card}") # DEBUG LOG for new card
            else:
                 target_card = cards[card_idx]
                 _LOGGER.debug(f"[SAVE_DEBUG] Existing card BEFORE update loop: {target_card}")
                 # Update existing card by merging the payload dictionary
                 target_card.update(card_details)
                 _LOGGER.debug(f"[SAVE_DEBUG] Card AFTER merge/update (before validation): {target_card}")

            # --- Validation and Sanitization after update/creation ---
            _LOGGER.debug(f"[SAVE_DEBUG] Starting validation for card: {target_card.get('id')}") # DEBUG LOG 3

            # --- New Field Validation ---
            if not isinstance(target_card.get('requires_activation', False), bool):
                _LOGGER.warning(f"Invalid requires_activation type for card {card_id}, defaulting to False.")
                target_card['requires_activation'] = False

            rotating_status = target_card.get('rotating_period_status', [])
            if not isinstance(rotating_status, list):
                _LOGGER.warning(f"Invalid rotating_period_status type for card {card_id}, defaulting to empty list.")
                target_card['rotating_period_status'] = []
            else:
                # Validate each item in the list
                validated_status = []
                for i, status_item in enumerate(rotating_status):
                    if not isinstance(status_item, dict):
                        _LOGGER.warning(f"Skipping invalid non-dict item in rotating_period_status for card {card_id} at index {i}")
                        continue
                    # Ensure required keys exist and have correct types
                    period = status_item.get('period')
                    updated = status_item.get('updated', False) # Default to False
                    activated = status_item.get('activated', False) # Default to False

                    if not isinstance(period, str) or not period:
                        _LOGGER.warning(f"Skipping invalid rotating_period_status item (bad period: {period}) for card {card_id} at index {i}")
                        continue
                    if not isinstance(updated, bool):
                        _LOGGER.warning(f"Invalid 'updated' type in rotating_period_status for card {card_id} at index {i}, using False.")
                        updated = False
                    if not isinstance(activated, bool):
                        _LOGGER.warning(f"Invalid 'activated' type in rotating_period_status for card {card_id} at index {i}, using False.")
                        activated = False

                    validated_status.append({'period': period, 'updated': updated, 'activated': activated})

                target_card['rotating_period_status'] = validated_status
            # --- End New Field Validation ---

            # ... (validation for base_rate, reward_system, points_program as before) ...
            if not isinstance(target_card.get('base_rate'), (int, float)):
                 target_card['base_rate'] = 0.0
            if target_card.get('reward_system') not in ['Cashback', 'Points']:
                target_card['reward_system'] = 'Cashback'
            if target_card['reward_system'] == 'Cashback':
                target_card['points_program'] = None
            elif target_card['reward_system'] == 'Points' and not target_card.get('points_program'):
                 target_card['points_program'] = None

            # Validate reward_structure_type and ensure related fields exist
            reward_structure_type = target_card.get('reward_structure_type')
            valid_structures = ['Static', 'Rotating', 'Dynamic']
            if reward_structure_type not in valid_structures:
                _LOGGER.warning(f"Invalid reward_structure_type: {reward_structure_type}, setting to 'Static' for card {card_id}")
                target_card['reward_structure_type'] = 'Static'
                reward_structure_type = 'Static'

            _LOGGER.debug(f"[SAVE_DEBUG] Final reward_structure_type for validation: {reward_structure_type}") # DEBUG LOG 4

            # Ensure reward fields exist and are lists based on final reward_structure_type
            # DO NOT clear the arrays for the *other* types, just ensure the active one exists.
            if reward_structure_type == 'Static':
                if 'static_rewards' not in target_card or not isinstance(target_card.get('static_rewards'), list):
                    _LOGGER.debug(f"[SAVE_DEBUG] Ensuring static_rewards exists and is a list.")
                    target_card['static_rewards'] = []
                # REMOVED: target_card['rotating_rules'] = []
                # REMOVED: target_card['dynamic_tiers'] = []
            elif reward_structure_type == 'Rotating':
                if 'rotating_rules' not in target_card or not isinstance(target_card.get('rotating_rules'), list):
                    _LOGGER.debug(f"[SAVE_DEBUG] Ensuring rotating_rules exists and is a list.")
                    target_card['rotating_rules'] = []
                # REMOVED: target_card['static_rewards'] = []
                # REMOVED: target_card['dynamic_tiers'] = []
                if 'rotation_period' not in target_card or target_card['rotation_period'] not in ['Monthly', 'Quarterly']:
                     target_card['rotation_period'] = 'Quarterly'
            elif reward_structure_type == 'Dynamic':
                if 'dynamic_tiers' not in target_card or not isinstance(target_card.get('dynamic_tiers'), list):
                    _LOGGER.debug(f"[SAVE_DEBUG] Ensuring dynamic_tiers exists and is a list.")
                    target_card['dynamic_tiers'] = []
                # REMOVED: target_card['static_rewards'] = []
                # REMOVED: target_card['rotating_rules'] = []
                if 'activation_period' not in target_card or target_card['activation_period'] not in ['Monthly', 'Quarterly']:
                     target_card['activation_period'] = 'Monthly'

                # Clean dynamic tiers if needed (remains the same)
                dynamic_tiers = target_card.get('dynamic_tiers', [])
                cleaned_tiers = []
                for i, tier in enumerate(dynamic_tiers):
                    if not isinstance(tier, dict):
                        continue
                    if 'eligible_rules' in tier and not isinstance(tier['eligible_rules'], list):
                        tier['eligible_rules'] = []
                    cleaned_tiers.append(tier)
                target_card['dynamic_tiers'] = cleaned_tiers

            _LOGGER.debug(f"[SAVE_DEBUG] Final card state BEFORE saving index {card_idx}: {target_card}") # DEBUG LOG 6

            # Save the updated list
            _LOGGER.debug(f"Saving updated cards list with {len(cards)} cards to file")
            try:
                self._write_json(MANUAL_CREDIT_CARDS_FILE, cards)
                self.MANUAL_CREDIT_CARDS = cards # Update cache
                _LOGGER.info(f"Successfully saved details for card ID {card_id}")
                return True
            except Exception as write_err:
                _LOGGER.exception(f"Error writing manual credit cards file for card {card_id}: {write_err}")
                return False

        except Exception as e:
            _LOGGER.exception(f"Unexpected error in save_manual_credit_card_details: {e}")
            return False

    def delete_manual_credit_card_details(self, ynab_account_id):
        """Deletes manual details for a specific credit card."""
        cards = self.get_manual_credit_cards()
        original_length = len(cards)
        # Find the card by ID and create a new list without it
        updated_cards = [card for card in cards if card.get('id') != ynab_account_id]

        if len(updated_cards) < original_length:
            try:
                self._write_json(MANUAL_CREDIT_CARDS_FILE, updated_cards)
                # Update the cache
                self.MANUAL_CREDIT_CARDS = updated_cards
                _LOGGER.info(f"Successfully deleted manual details for card ID {ynab_account_id}")
                return True
            except Exception as write_err:
                 _LOGGER.exception(f"Error writing manual credit cards file after deleting card {ynab_account_id}: {write_err}")
                 return False
        else:
             _LOGGER.warning(f"Attempted to delete non-existent manual details for card ID {ynab_account_id}")
             return False # Indicate card wasn't found/deleted

    # --- Payment Methods ---
    def get_payment_methods(self):
        """Gets the list of payment methods as {id, name} objects."""
        methods_raw = self._read_json(PAYMENT_METHODS_FILE)
        if not isinstance(methods_raw, list):
            _LOGGER.warning(f"Payment methods file {PAYMENT_METHODS_FILE} corrupted or not a list. Resetting.")
            self._write_json(PAYMENT_METHODS_FILE, [])
            return []

        formatted_methods = []
        needs_resave = False
        processed_names = set()

        for method in methods_raw:
            if isinstance(method, str):
                method_name = method.strip()
                if method_name and method_name.lower() not in processed_names:
                    formatted_methods.append({"id": method_name, "name": method_name})
                    processed_names.add(method_name.lower())
                    needs_resave = True
            elif isinstance(method, dict) and "name" in method:
                 name = method.get("name", "").strip()
                 if name:
                     method_id = method.get("id", name)
                     if not isinstance(method_id, str) or not method_id:
                         method_id = name

                     if name.lower() not in processed_names:
                         formatted_methods.append({"id": method_id, "name": name})
                         processed_names.add(name.lower())
                         if method.get("id") != method_id:
                             needs_resave = True
                     else:
                         _LOGGER.warning(f"Skipping duplicate payment method name during load: {name}")
            else:
                 _LOGGER.warning(f"Skipping invalid entry in payment methods file: {method}")

        formatted_methods.sort(key=lambda x: x['name'].lower())

        if needs_resave:
             _LOGGER.info(f"Resaving payment methods file {PAYMENT_METHODS_FILE} in standardized format.")
             self._write_json(PAYMENT_METHODS_FILE, formatted_methods)

        return formatted_methods

    def add_payment_method(self, name):
        """Adds a new payment method, storing as {id, name}. ID is the name."""
        if not name or not isinstance(name, str):
            return False, "Payment method name must be a non-empty string", None

        normalized_name = name.strip()
        if not normalized_name:
             return False, "Payment method name cannot be empty", None

        methods = self.get_payment_methods() # Returns sorted list of dicts

        if any(m['name'].lower() == normalized_name.lower() for m in methods):
            return False, f"Payment method '{normalized_name}' already exists", None

        new_method = {"id": normalized_name, "name": normalized_name}
        methods.append(new_method)
        methods.sort(key=lambda x: x['name'].lower())
        self._write_json(PAYMENT_METHODS_FILE, methods)
        return True, "Payment method added successfully", methods

    def update_payment_method(self, old_name, new_name):
        """Updates a payment method name. Updates both id and name."""
        if not old_name or not new_name or not isinstance(old_name, str) or not isinstance(new_name, str):
            return {"error": "Payment method names must be non-empty strings"}

        old_name_norm = old_name.strip()
        new_name_norm = new_name.strip()
        if not old_name_norm or not new_name_norm:
            return {"error": "Payment method names cannot be empty"}

        methods = self.get_payment_methods() # Returns sorted list of dicts
        method_to_update = next((m for m in methods if m['name'].lower() == old_name_norm.lower()), None)

        if not method_to_update:
            return {"error": f"Payment method '{old_name_norm}' not found"}

        if old_name_norm.lower() != new_name_norm.lower() and any(m['name'].lower() == new_name_norm.lower() for m in methods):
            return {"error": f"Payment method '{new_name_norm}' already exists"}

        # Update the specific dictionary
        method_to_update['id'] = new_name_norm
        method_to_update['name'] = new_name_norm

        methods.sort(key=lambda x: x['name'].lower())
        self._write_json(PAYMENT_METHODS_FILE, methods)

        # Also update any credit cards that use this payment method
        cards = self.get_manual_credit_cards()
        cards_updated = False
        for i, card in enumerate(cards):
             # Payment methods in cards are stored as a list of strings
            if 'payment_methods' in card and isinstance(card['payment_methods'], list):
                updated_list = False
                new_pm_list = []
                for pm_name in card['payment_methods']:
                    if isinstance(pm_name, str) and pm_name.lower() == old_name_norm.lower():
                        new_pm_list.append(new_name_norm)
                        updated_list = True
                    else:
                        new_pm_list.append(pm_name) # Keep existing

                if updated_list:
                    card['payment_methods'] = sorted(list(set(new_pm_list))) # Ensure unique and sorted
                    cards[i] = card
                    cards_updated = True

        if cards_updated:
            _LOGGER.info(f"Updating manual credit cards file after renaming payment method '{old_name_norm}' to '{new_name_norm}'")
            self._write_json(MANUAL_CREDIT_CARDS_FILE, cards)
            self.MANUAL_CREDIT_CARDS = cards

        return {"success": True, "methods": methods}

    def delete_payment_method(self, name):
        """Deletes a payment method by name."""
        if not name or not isinstance(name, str):
            return {"error": "Payment method name must be a non-empty string"}

        name_norm = name.strip()
        if not name_norm:
            return {"error": "Payment method name cannot be empty"}

        methods = self.get_payment_methods() # Returns list of dicts
        original_length = len(methods)
        updated_methods = [m for m in methods if m['name'].lower() != name_norm.lower()]

        if len(updated_methods) == original_length:
            return {"error": f"Payment method '{name_norm}' not found"}

        # Also remove this payment method from any credit cards that use it
        cards = self.get_manual_credit_cards()
        cards_updated = False
        for i, card in enumerate(cards):
            if 'payment_methods' in card and isinstance(card['payment_methods'], list):
                original_pm_count = len(card['payment_methods'])
                filtered_pms = [pm for pm in card['payment_methods'] if not (isinstance(pm, str) and pm.lower() == name_norm.lower())]
                if len(filtered_pms) < original_pm_count:
                    card['payment_methods'] = filtered_pms
                    cards[i] = card
                    cards_updated = True

        if cards_updated:
            _LOGGER.info(f"Updating manual credit cards file after deleting payment method '{name_norm}'")
            self._write_json(MANUAL_CREDIT_CARDS_FILE, cards)
            self.MANUAL_CREDIT_CARDS = cards

        self._write_json(PAYMENT_METHODS_FILE, updated_methods)
        return {"success": True, "methods": updated_methods}

    # --- Points Programs Management ---
    def get_points_programs(self):
        """Gets the list of points programs as {id, name} objects."""
        programs_raw = self._read_json(POINTS_PROGRAMS_FILE)
        if not isinstance(programs_raw, list):
            _LOGGER.warning(f"Points programs file {POINTS_PROGRAMS_FILE} corrupted or not a list. Resetting.")
            self._write_json(POINTS_PROGRAMS_FILE, [])
            return []

        formatted_programs = []
        needs_resave = False
        processed_names = set()

        for program in programs_raw:
            if isinstance(program, str):
                program_name = program.strip()
                if program_name and program_name.lower() not in processed_names:
                    formatted_programs.append({"id": program_name, "name": program_name})
                    processed_names.add(program_name.lower())
                    needs_resave = True
            elif isinstance(program, dict) and "name" in program:
                 name = program.get("name", "").strip()
                 if name:
                     program_id = program.get("id", name)
                     if not isinstance(program_id, str) or not program_id:
                         program_id = name

                     if name.lower() not in processed_names:
                         formatted_programs.append({"id": program_id, "name": name})
                         processed_names.add(name.lower())
                         if program.get("id") != program_id:
                              needs_resave = True
                     else:
                         _LOGGER.warning(f"Skipping duplicate points program name during load: {name}")
            else:
                 _LOGGER.warning(f"Skipping invalid entry in points programs file: {program}")

        formatted_programs.sort(key=lambda x: x['name'].lower())

        if needs_resave:
             _LOGGER.info(f"Resaving points programs file {POINTS_PROGRAMS_FILE} in standardized format.")
             self._write_json(POINTS_PROGRAMS_FILE, formatted_programs)

        return formatted_programs

    def add_points_program(self, name):
        """Adds a new points program, storing as {id, name}. ID is the name."""
        if not name or not isinstance(name, str):
            return {"error": "Points program name must be a non-empty string"}

        normalized_name = name.strip()
        if not normalized_name:
            return {"error": "Points program name cannot be empty"}

        programs = self.get_points_programs() # Returns sorted list of dicts

        if any(p['name'].lower() == normalized_name.lower() for p in programs):
            return {"error": f"Points program '{normalized_name}' already exists"}

        new_program = {"id": normalized_name, "name": normalized_name}
        programs.append(new_program)
        programs.sort(key=lambda x: x['name'].lower())
        self._write_json(POINTS_PROGRAMS_FILE, programs)
        return {"success": True, "programs": programs} # Return full updated list

    def update_points_program(self, old_name, new_name):
        """Updates a points program name. Updates both id and name."""
        if not old_name or not new_name or not isinstance(old_name, str) or not isinstance(new_name, str):
            return {"error": "Points program names must be non-empty strings"}

        old_name_norm = old_name.strip()
        new_name_norm = new_name.strip()
        if not old_name_norm or not new_name_norm:
             return {"error": "Points program names cannot be empty"}

        programs = self.get_points_programs() # Returns sorted list of dicts
        program_to_update = next((p for p in programs if p['name'].lower() == old_name_norm.lower()), None)

        if not program_to_update:
            return {"error": f"Points program '{old_name_norm}' not found"}

        if old_name_norm.lower() != new_name_norm.lower() and any(p['name'].lower() == new_name_norm.lower() for p in programs):
            return {"error": f"Points program '{new_name_norm}' already exists"}

        # Update the specific dictionary
        program_to_update['id'] = new_name_norm
        program_to_update['name'] = new_name_norm

        programs.sort(key=lambda x: x['name'].lower())
        self._write_json(POINTS_PROGRAMS_FILE, programs)

        # Also update any credit cards that use this points program
        cards = self.get_manual_credit_cards()
        cards_updated = False
        for i, card in enumerate(cards):
            if card.get('points_program') and isinstance(card['points_program'], str) and card['points_program'].lower() == old_name_norm.lower():
                cards[i]['points_program'] = new_name_norm
                cards_updated = True

        if cards_updated:
            _LOGGER.info(f"Updating manual credit cards file after renaming points program '{old_name_norm}' to '{new_name_norm}'")
            self._write_json(MANUAL_CREDIT_CARDS_FILE, cards)
            self.MANUAL_CREDIT_CARDS = cards # Update cache

        return {"success": True, "programs": programs} # Return full updated list

    def delete_points_program(self, name):
        """Deletes a points program by name."""
        if not name or not isinstance(name, str):
            return {"error": "Points program name must be a non-empty string"}

        name_norm = name.strip()
        if not name_norm:
            return {"error": "Points program name cannot be empty"}

        programs = self.get_points_programs() # Returns list of dicts
        original_length = len(programs)
        updated_programs = [p for p in programs if p['name'].lower() != name_norm.lower()]

        if len(updated_programs) == original_length:
            return {"error": f"Points program '{name_norm}' not found"}

        # Check if any credit cards use this points program
        cards = self.get_manual_credit_cards()
        for card in cards:
            if card.get('points_program') and isinstance(card['points_program'], str) and card['points_program'].lower() == name_norm.lower():
                return {"error": f"Cannot delete points program '{name_norm}' because it is used by card '{card.get('card_name', 'Unnamed Card')}'"}

        self._write_json(POINTS_PROGRAMS_FILE, updated_programs)
        return {"success": True, "programs": updated_programs} # Return full updated list

    # --- Rewards Category Management ---
    def get_rewards_categories(self):
        """Gets the list of rewards categories as {id, name, parent_id} objects. ID is a UUID."""
        categories_raw = self._read_json(REWARDS_CATEGORIES_FILE)
        if not isinstance(categories_raw, list):
            _LOGGER.warning(f"Rewards categories file {REWARDS_CATEGORIES_FILE} corrupted or not a list. Resetting.")
            self._write_json(REWARDS_CATEGORIES_FILE, [])
            return []

        formatted_categories = []
        needs_resave = False
        processed_ids = set()
        processed_names_by_parent = {} # Track names within each parent

        for category in categories_raw:
            category_name = None
            category_id = None
            parent_id = None

            if isinstance(category, str):
                category_name = category.strip()
                if category_name:
                    category_id = str(uuid.uuid4())
                    parent_id = None
                    needs_resave = True
                else:
                    _LOGGER.warning("Skipping empty category name during string conversion.")
                    continue
            elif isinstance(category, dict) and "name" in category:
                category_name = category.get("name", "").strip()
                category_id = category.get("id")
                parent_id = category.get("parent_id")

                if not category_name:
                     _LOGGER.warning(f"Skipping entry with empty name. ID: {category_id}")
                     continue

                if not isinstance(category_id, str) or not category_id:
                    category_id = str(uuid.uuid4())
                    needs_resave = True
                elif category_id in processed_ids:
                    _LOGGER.warning(f"Duplicate category ID found: {category_id}. Skipping entry for name: {category_name}")
                    continue

                if parent_id is not None and not isinstance(parent_id, str):
                     _LOGGER.warning(f"Invalid parent_id format '{parent_id}' for category '{category_name}'. Setting to null.")
                     parent_id = None
                     needs_resave = True
                if 'parent_id' not in category:
                     parent_id = None
                     needs_resave = True
            else:
                 _LOGGER.warning(f"Skipping invalid entry in rewards categories file: {category}")
                 continue

            parent_key = parent_id if parent_id else '_root_'
            if parent_key not in processed_names_by_parent:
                processed_names_by_parent[parent_key] = set()

            if category_name.lower() in processed_names_by_parent[parent_key]:
                 _LOGGER.warning(f"Duplicate category name '{category_name}' found under parent '{parent_key}'. Skipping entry with ID: {category_id}")
                 continue

            formatted_categories.append({"id": category_id, "name": category_name, "parent_id": parent_id})
            processed_ids.add(category_id)
            processed_names_by_parent[parent_key].add(category_name.lower())

        formatted_categories.sort(key=lambda x: x['name'].lower())

        if needs_resave:
             _LOGGER.info(f"Resaving rewards categories file {REWARDS_CATEGORIES_FILE} in standardized format with UUIDs and parent_id.")
             self._write_json(REWARDS_CATEGORIES_FILE, formatted_categories)

        return formatted_categories

    def add_rewards_category(self, name, parent_id=None):
        """Adds a new rewards category, storing as {id, name, parent_id} with UUID."""
        if not name or not isinstance(name, str):
            return {"error": "Category name must be a non-empty string"}
        if parent_id is not None and not isinstance(parent_id, str):
             return {"error": "Invalid parent_id format, must be string or null"}

        normalized_name = name.strip()
        if not normalized_name:
            return {"error": "Category name cannot be empty"}

        categories = self.get_rewards_categories()

        parent_key_to_check = parent_id if parent_id else '_root_'
        existing_names_under_parent = {
            c['name'].lower() for c in categories if (c['parent_id'] == parent_id)
        }
        if normalized_name.lower() in existing_names_under_parent:
            return {"error": f"Category '{normalized_name}' already exists under the selected parent."}

        if parent_id and not any(c['id'] == parent_id for c in categories):
             return {"error": f"Parent category with ID '{parent_id}' not found."}

        new_category_id = str(uuid.uuid4())
        new_category = {"id": new_category_id, "name": normalized_name, "parent_id": parent_id}
        categories.append(new_category)
        categories.sort(key=lambda x: x['name'].lower())
        self._write_json(REWARDS_CATEGORIES_FILE, categories)
        return {"success": True, "categories": categories}

    def update_rewards_category(self, category_id, new_name, new_parent_id=None):
        """Updates a rewards category name and/or parent using its ID. new_parent_id=None means no change."""
        if not category_id or not isinstance(category_id, str):
            return {"error": "Category ID must be provided"}
        if new_name is not None:
            if not isinstance(new_name, str): return {"error": "New name must be a string if provided"}
            new_name_norm = new_name.strip()
            if not new_name_norm: return {"error": "New name cannot be empty"}
        else:
             new_name_norm = None

        if new_parent_id is not None and not isinstance(new_parent_id, str):
            return {"error": "New parent_id must be a string UUID or None/null"}

        categories = self.get_rewards_categories()
        category_to_update = next((c for c in categories if c['id'] == category_id), None)

        if not category_to_update:
            return {"error": f"Category with ID '{category_id}' not found"}

        original_parent_id = category_to_update.get('parent_id')
        target_parent_id = original_parent_id
        target_name = category_to_update.get('name')

        if new_parent_id is not None:
            if new_parent_id == category_id:
                 return {"error": "Cannot set an item as its own parent."}
            if new_parent_id and not any(c['id'] == new_parent_id for c in categories):
                 return {"error": f"Target parent category with ID '{new_parent_id}' not found."}
            descendant_ids = self._get_descendant_ids(categories, category_id)
            if new_parent_id in descendant_ids:
                 return {"error": "Cannot move an item under one of its own descendants."}
            target_parent_id = new_parent_id

        if new_name_norm and new_name_norm != category_to_update.get('name'):
            target_name = new_name_norm

        target_parent_key = target_parent_id if target_parent_id else '_root_'
        existing_names_under_target_parent = {
            c['name'].lower() for c in categories if c['parent_id'] == target_parent_id and c['id'] != category_id
        }
        if target_name.lower() in existing_names_under_target_parent:
             return {"error": f"Another category named '{target_name}' already exists under the target parent."}

        category_to_update['name'] = target_name
        category_to_update['parent_id'] = target_parent_id

        categories.sort(key=lambda x: x['name'].lower())
        self._write_json(REWARDS_CATEGORIES_FILE, categories)

        return {"success": True, "categories": categories}

    def delete_rewards_category(self, category_id):
        """Deletes a rewards category by ID. Prevents deletion if it has children."""
        if not category_id or not isinstance(category_id, str):
            return {"error": "Category ID must be provided"}

        categories = self.get_rewards_categories()

        category_to_delete = next((c for c in categories if c['id'] == category_id), None)
        if not category_to_delete:
             return {"error": f"Category with ID '{category_id}' not found"}

        has_children = any(c.get('parent_id') == category_id for c in categories)
        if has_children:
            return {"error": f"Cannot delete category '{category_to_delete.get('name')}' because it has child categories. Please move or delete the children first."}

        updated_categories = [c for c in categories if c['id'] != category_id]

        if len(updated_categories) == len(categories):
            return {"error": f"Category with ID '{category_id}' not found (unexpected error after initial check)"}

        self._write_json(REWARDS_CATEGORIES_FILE, updated_categories)
        return {"success": True, "categories": updated_categories}

    # --- Rewards Payee Management ---
    def get_rewards_payees(self):
        """Gets the list of rewards payees as {id, name, parent_id} objects. ID is a UUID."""
        payees_raw = self._read_json(REWARDS_PAYEES_FILE)
        if not isinstance(payees_raw, list):
            _LOGGER.warning(f"Rewards payees file {REWARDS_PAYEES_FILE} corrupted or not a list. Resetting.")
            self._write_json(REWARDS_PAYEES_FILE, [])
            return []

        formatted_payees = []
        needs_resave = False
        processed_ids = set()
        processed_names_by_parent = {} # Track names within each parent (parent_id -> {lowercase_name})

        for payee in payees_raw:
            payee_name = None
            payee_id = None
            parent_id = None

            if isinstance(payee, str):
                payee_name = payee.strip()
                if payee_name:
                    payee_id = str(uuid.uuid4())
                    parent_id = None # Old string format becomes top-level
                    needs_resave = True
                else:
                    _LOGGER.warning(f"Skipping empty payee name during string conversion.")
                    continue
            elif isinstance(payee, dict) and "name" in payee:
                payee_name = payee.get("name", "").strip()
                payee_id = payee.get("id")
                parent_id = payee.get("parent_id") # Can be None or a string UUID

                if not payee_name:
                    _LOGGER.warning(f"Skipping entry with empty name. ID: {payee_id}")
                    continue

                # Validate or generate ID
                if not isinstance(payee_id, str) or not payee_id:
                    payee_id = str(uuid.uuid4())
                    needs_resave = True
                elif payee_id in processed_ids:
                    _LOGGER.warning(f"Duplicate payee ID found: {payee_id}. Skipping entry for name: {payee_name}")
                    continue

                # Validate parent_id (must be a string UUID or None)
                if parent_id is not None and not isinstance(parent_id, str):
                     _LOGGER.warning(f"Invalid parent_id format '{parent_id}' for payee '{payee_name}'. Setting to null.")
                     parent_id = None
                     needs_resave = True

                # Ensure parent_id=null if missing in dict
                if 'parent_id' not in payee:
                    parent_id = None
                    needs_resave = True # Add the field

            else:
                 _LOGGER.warning(f"Skipping invalid entry in rewards payees file: {payee}")
                 continue # Skip invalid entry

            # --- Fix block indentation start ---
            # Check for duplicate names *within the same parent*
            parent_key = parent_id if parent_id else '_root_' # Use '_root_' for None parent_id
            if parent_key not in processed_names_by_parent:
                processed_names_by_parent[parent_key] = set()

            if payee_name.lower() in processed_names_by_parent[parent_key]:
                 _LOGGER.warning(f"Duplicate payee name '{payee_name}' found under parent '{parent_key}'. Skipping entry with ID: {payee_id}")
                 continue

            # Add valid item
            formatted_payees.append({"id": payee_id, "name": payee_name, "parent_id": parent_id})
            processed_ids.add(payee_id)
            processed_names_by_parent[parent_key].add(payee_name.lower())
            # --- Fix block indentation end ---

        # Sort primarily by name, maybe parent later if needed for display?
        formatted_payees.sort(key=lambda x: x['name'].lower())

        if needs_resave:
             _LOGGER.info(f"Resaving rewards payees file {REWARDS_PAYEES_FILE} in standardized format with UUIDs and parent_id.")
             self._write_json(REWARDS_PAYEES_FILE, formatted_payees)

        return formatted_payees

    def add_rewards_payee(self, name, parent_id=None):
        """Adds a new rewards payee, storing as {id, name, parent_id} with UUID."""
        if not name or not isinstance(name, str):
            return {"error": "Payee name must be a non-empty string"}
        if parent_id is not None and not isinstance(parent_id, str):
             return {"error": "Invalid parent_id format, must be string or null"}

        normalized_name = name.strip()
        if not normalized_name:
            return {"error": "Payee name cannot be empty"}

        payees = self.get_rewards_payees() # Returns sorted list of dicts {id, name, parent_id}

        # Check for duplicate name under the *same parent*
        parent_key_to_check = parent_id if parent_id else '_root_'
        existing_names_under_parent = {
            p['name'].lower() for p in payees if (p['parent_id'] == parent_id)
        }
        if normalized_name.lower() in existing_names_under_parent:
            return {"error": f"Payee '{normalized_name}' already exists under the selected parent."}

        # Check if parent_id actually exists (if provided)
        if parent_id and not any(p['id'] == parent_id for p in payees):
             return {"error": f"Parent payee with ID '{parent_id}' not found."}


        new_payee_id = str(uuid.uuid4())
        new_payee = {"id": new_payee_id, "name": normalized_name, "parent_id": parent_id}
        payees.append(new_payee)
        payees.sort(key=lambda x: x['name'].lower()) # Keep simple sort for now
        self._write_json(REWARDS_PAYEES_FILE, payees)
        return {"success": True, "payees": payees} # Return full updated list

    def update_rewards_payee(self, payee_id, new_name, new_parent_id=None):
        """Updates a rewards payee name and/or parent using its ID. new_parent_id=None means no change."""
        if not payee_id or not isinstance(payee_id, str):
            return {"error": "Payee ID must be provided"}
        if new_name is not None: # Allow updating only parent
            if not isinstance(new_name, str): return {"error": "New name must be a string if provided"}
            new_name_norm = new_name.strip()
            if not new_name_norm: return {"error": "New name cannot be empty"}
        else:
             new_name_norm = None # Flag that name is not being changed

        if new_parent_id is not None and not isinstance(new_parent_id, str):
            # Allow explicit setting to null by passing new_parent_id=None in call signature, but not invalid types here
            return {"error": "New parent_id must be a string UUID or None/null"}

        payees = self.get_rewards_payees()
        payee_to_update = next((p for p in payees if p['id'] == payee_id), None)

        if not payee_to_update:
            return {"error": f"Payee with ID '{payee_id}' not found"}

        # --- Prepare for updates ---
        original_parent_id = payee_to_update.get('parent_id')
        target_parent_id = original_parent_id # Default to original if not changing
        target_name = payee_to_update.get('name') # Default to original if not changing

        # --- Validate Parent Change ---
        if new_parent_id is not None: # Explicit request to change parent (could be to null)
            if new_parent_id == payee_id: # Cannot parent to self
                 return {"error": "Cannot set an item as its own parent."}
            # Check if new_parent_id exists (if not null)
            if new_parent_id and not any(p['id'] == new_parent_id for p in payees):
                 return {"error": f"Target parent payee with ID '{new_parent_id}' not found."}
            # Prevent cyclical parenting (check if new_parent_id is a descendant of payee_id)
            descendant_ids = self._get_descendant_ids(payees, payee_id)
            if new_parent_id in descendant_ids:
                 return {"error": "Cannot move an item under one of its own descendants."}
            target_parent_id = new_parent_id # Update target parent

        # --- Validate Name Change ---
        if new_name_norm and new_name_norm != payee_to_update.get('name'):
            target_name = new_name_norm # Update target name

        # --- Check for Name Conflicts Under *Target* Parent ---
        target_parent_key = target_parent_id if target_parent_id else '_root_'
        existing_names_under_target_parent = {
            p['name'].lower() for p in payees if p['parent_id'] == target_parent_id and p['id'] != payee_id # Exclude self
        }
        if target_name.lower() in existing_names_under_target_parent:
             return {"error": f"Another payee named '{target_name}' already exists under the target parent."}

        # --- Apply Updates ---
        payee_to_update['name'] = target_name
        payee_to_update['parent_id'] = target_parent_id

        payees.sort(key=lambda x: x['name'].lower())
        self._write_json(REWARDS_PAYEES_FILE, payees)

        return {"success": True, "payees": payees}

    def delete_rewards_payee(self, payee_id):
        """Deletes a rewards payee by ID. Prevents deletion if it has children."""
        if not payee_id or not isinstance(payee_id, str):
            return {"error": "Payee ID must be provided"}

        payees = self.get_rewards_payees()

        # Check if payee exists
        payee_to_delete = next((p for p in payees if p['id'] == payee_id), None)
        if not payee_to_delete:
             return {"error": f"Payee with ID '{payee_id}' not found"}

        # Check for children
        has_children = any(p.get('parent_id') == payee_id for p in payees)
        if has_children:
            return {"error": f"Cannot delete payee '{payee_to_delete.get('name')}' because it has child payees. Please move or delete the children first."}


        original_length = len(payees)
        updated_payees = [p for p in payees if p['id'] != payee_id]

        # This check should be redundant now if we check existence first, but keep for safety
        if len(updated_payees) == original_length:
            return {"error": f"Payee with ID '{payee_id}' not found (unexpected error after initial check)"}

        self._write_json(REWARDS_PAYEES_FILE, updated_payees)
        return {"success": True, "payees": updated_payees}

    # Helper for cyclical dependency check
    def _get_descendant_ids(self, items, parent_id):
        descendants = set()
        children = [item['id'] for item in items if item.get('parent_id') == parent_id]
        for child_id in children:
            descendants.add(child_id)
            descendants.update(self._get_descendant_ids(items, child_id))
        return descendants

    async def update_credit_card_rewards(self, credit_card_id, rewards_config):
        """Update the rewards for a credit card."""
        # ... existing code ...

    async def add_credit_card_reward_tier(self, credit_card_id, tier_data):
        """
        Add a new rewards tier to a credit card with dynamic rewards structure.

        Args:
            credit_card_id (str): The ID of the credit card
            tier_data (dict): Data defining the tier including:
                - name: Name of the tier
                - rate: Cashback/rewards rate
                - eligible_rules: List of rules for this tier
                - max_active: Maximum number of rules that can be active

        Returns:
            bool: True if successful, False otherwise
        """
        # Get the current card data
        credit_cards = await self.get_credit_cards()

        # Find the card by ID
        for card in credit_cards:
            if card.get('id') == credit_card_id:
                # Check if the card has dynamic rewards structure
                if card.get('rewards_structure') != 'dynamic':
                    self.logger.error(f"Card {credit_card_id} does not have dynamic rewards structure")
                    return False

                # Add the new tier
                if 'dynamic_rewards' not in card:
                    card['dynamic_rewards'] = {'tiers': [], 'last_optimized': None, 'active_rules': []}

                # Validate tier data
                if not all(k in tier_data for k in ['name', 'rate', 'eligible_rules', 'max_active']):
                    self.logger.error(f"Invalid tier data: {tier_data}")
                    return False

                # Add tier ID if not provided
                if 'tier_id' not in tier_data:
                    tier_data['tier_id'] = str(uuid.uuid4())

                # Add the tier
                card['dynamic_rewards']['tiers'].append(tier_data)

                # Save the updated credit cards
                await self.save_credit_cards(credit_cards)
                return True

        self.logger.error(f"Credit card with ID {credit_card_id} not found")
        return False

    async def optimize_dynamic_rewards(self, credit_card_id):
        """
        Optimizes the active rules for a dynamic rewards card based on potential conflicts
        with other cards' static/rotating rewards for the current period.
        This should be run periodically (e.g., monthly/quarterly) per dynamic card.
        """
        _LOGGER.info(f"Optimizing dynamic rewards for card: {credit_card_id}")
        card_details = self.get_manual_credit_card_details(credit_card_id)
        if not card_details or card_details.get('reward_structure', {}).get('type') != 'dynamic':
            _LOGGER.warning(f"Card {credit_card_id} not found or not a dynamic rewards card.")
            return False

        # --- Implementation for optimizing dynamic rules goes here ---
        # 1. Get all other cards' active static/rotating rules for the current period.
        # 2. Get the dynamic card's tiers and eligible rules.
        # 3. For each tier:
        #    a. Filter eligible rules based on conflicts with higher-earning rules on other cards.
        #    b. Sort remaining eligible rules by priority.
        #    c. Select the top N rules (up to maxActiveRules).
        # 4. Save the newly selected active rules for the dynamic card.
        # --- Placeholder ---
        _LOGGER.warning(f"Dynamic reward optimization logic for card {credit_card_id} is not yet implemented.")
        # Example: Assume some logic selects new rules
        # new_active_rules = [...]
        # await self.update_active_rules(credit_card_id, new_active_rules)
        return True # Placeholder return

    def find_best_card_for_transaction(self, category_id=None, payee_id=None, payment_method_id=None, amount_milliunits=0):
        """
        Finds the best reward rates for all cards based on a given transaction context.

        Args:
            category_id (str, optional): The ID of the transaction category.
            payee_id (str, optional): The ID of the transaction payee.
            payment_method_id (str, optional): The ID of the payment method used.
            amount_milliunits (int, optional): The transaction amount in milliunits.

        Returns:
            dict: Contains 'scenario_results' - a list of cards sorted by their applicable
                  reward rate for the given scenario, highest first.
                  Example: {
                      'scenario_results': [
                          {
                              'card': {'id': '...', 'name': 'Card B', 'bank': '...'},
                              'rate': 5.0,
                              'type': '%',
                              'category': [], # List of category names for the matching rule or []
                              'payee': ['Specific Payee'], # List of payee names for the matching rule or []
                              'paymentMethod': [] # List of payment method names for the matching rule or []
                          },
                          # ... other cards
                      ],
                      'scenario_suggestions': [] # Placeholder
                  }
        """
        _LOGGER.info(
            f"Finding card rankings for transaction: category='{category_id}', "
            f"payee='{payee_id}', payment_method='{payment_method_id}', "
            f"amount='{amount_milliunits}'"
        )

        all_cards = self.get_manual_credit_cards()
        scenario_results = [] # Store results for all cards

        today = date.today()
        current_month = today.month
        current_quarter = (current_month - 1) // 3 + 1

        for card in all_cards:
            card_id = card.get('id')
            card_name = card.get('card_name', card.get('name', f'Card {card_id}'))
            card_bank = card.get('bank')
            # Ensure base_rate is a float
            try:
                base_rate = float(card.get('base_rate', 0.0))
            except (ValueError, TypeError):
                _LOGGER.warning(f"Invalid base_rate '{card.get('base_rate')}' for card {card_id}, using 0.0")
                base_rate = 0.0

            card_effective_rate = base_rate # Start with base rate
            _LOGGER.debug(f"Evaluating card: {card_name} (ID: {card_id}), Base Rate: {base_rate}")

            reward_type = card.get('reward_structure_type', 'Static')
            rules_to_check = []

            # --- Gather applicable rules based on card type and current date ---
            if reward_type == 'Static':
                rules_to_check = card.get('static_rewards', [])
                _LOGGER.debug(f" -> Static card. Checking {len(rules_to_check)} rules.")
            elif reward_type == 'Rotating':
                rotation_period = card.get('rotation_period', 'Quarterly')
                raw_rules = card.get('rotating_rules', [])
                _LOGGER.debug(f" -> Rotating card ({rotation_period}). Checking {len(raw_rules)} rules for M{current_month}/Q{current_quarter}.")
                for rule in raw_rules:
                    is_rotating = rule.get('is_rotating', True)
                    if not is_rotating:
                        rules_to_check.append(rule)
                    else:
                        applies_now = False
                        if rotation_period == 'Monthly': applies_now = current_month in rule.get('months', [])
                        elif rotation_period == 'Quarterly': applies_now = current_quarter in rule.get('quarters', [])
                        if applies_now: rules_to_check.append(rule)

            elif reward_type == 'Dynamic':
                dynamic_structure = card.get('dynamic_rewards', {})
                active_rules_raw = dynamic_structure.get('active_rules', [])
                _LOGGER.debug(f" -> Dynamic card. Checking {len(active_rules_raw)} active rules.")
                for active_rule_entry in active_rules_raw:
                    if isinstance(active_rule_entry, dict) and 'rule' in active_rule_entry and 'rate' in active_rule_entry:
                         rule_details = active_rule_entry['rule']
                         rule_details['rate'] = active_rule_entry['rate']
                         rules_to_check.append(rule_details)
                    elif isinstance(active_rule_entry, dict): # Handle flat structure
                         rules_to_check.append(active_rule_entry)

            # --- Evaluate Rules --- Find the best *matching* rule rate for THIS card
            best_rule_rate_for_card = -1.0 # Track highest rate from a matching rule for this card
            applicable_rule_details = { # Store details of the best rule found
                'category': [],
                'payee': [],
                'paymentMethod': []
            }

            for rule in rules_to_check:
                if not isinstance(rule, dict): continue

                rule_cat = rule.get('category_id') # Ensure keys match the data model
                rule_payee = rule.get('payee_id')
                rule_pm = rule.get('payment_method_id')
                # Ensure rule_rate is a float
                try:
                    rule_rate = float(rule.get('rate', 0.0))
                except (ValueError, TypeError):
                    _LOGGER.warning(f"Invalid rule rate '{rule.get('rate')}' in card {card_id}, skipping rule: {rule}")
                    continue # Skip this rule if rate is invalid

                # --- Ensure conditions are lists of STRINGS --- #
                def extract_names(condition_list):
                    if not condition_list: return []
                    if not isinstance(condition_list, list): condition_list = [condition_list]
                    return [
                        item['name'] if isinstance(item, dict) and 'name' in item else str(item)
                        for item in condition_list
                    ]

                rule_cat_list = extract_names(rule.get('category', []))
                rule_payee_list = extract_names(rule.get('payee', []))
                rule_pm_list = extract_names(rule.get('paymentMethod', []))
                # --- End condition normalization --- #

                _LOGGER.debug(f"    - Checking Rule (Normalized): Cat={rule_cat_list}, Payee={rule_payee_list}, PM={rule_pm_list}, Rate={rule_rate}%")

                # --- Corrected Match Logic --- #
                # Log inputs for clarity
                _LOGGER.debug(f"      Inputs: CatID={category_id}, PayeeID={payee_id}, PMID={payment_method_id}")

                category_match = (not rule_cat_list) or (category_id is not None and category_id in rule_cat_list)
                _LOGGER.debug(f"      Category Match Check: RuleRequires={rule_cat_list}, InputProvided={category_id is not None}, InList={category_id in rule_cat_list if category_id else False} -> Match={category_match}")

                payee_match = (not rule_payee_list) or (payee_id is not None and payee_id in rule_payee_list)
                _LOGGER.debug(f"      Payee Match Check: RuleRequires={rule_payee_list}, InputProvided={payee_id is not None}, InList={payee_id in rule_payee_list if payee_id else False} -> Match={payee_match}")

                pm_match = (not rule_pm_list) or (payment_method_id is not None and payment_method_id in rule_pm_list)
                _LOGGER.debug(f"      PM Match Check: RuleRequires={rule_pm_list}, InputProvided={payment_method_id is not None}, InList={payment_method_id in rule_pm_list if payment_method_id else False} -> Match={pm_match}")

                matches = category_match and payee_match and pm_match
                _LOGGER.debug(f"      Overall Match: {matches}")
                # --- End Corrected Match Logic --- #

                if matches:
                    _LOGGER.debug(f"      MATCH FOUND! Rate={rule_rate}%")
                    # If this matching rule has a higher rate, update the best rate for the card
                    if rule_rate > best_rule_rate_for_card:
                        best_rule_rate_for_card = rule_rate
                        # Store the conditions of this best matching rule
                        applicable_rule_details = {
                            'category': rule_cat_list,
                            'payee': rule_payee_list,
                            'paymentMethod': rule_pm_list
                        }
                else:
                    _LOGGER.debug(f"      No match.")

            # The effective rate for this card is the highest of its base rate or best matching rule rate
            card_effective_rate = max(base_rate, best_rule_rate_for_card)

            # If base rate was best, ensure applicable rule details are empty
            if card_effective_rate == base_rate and best_rule_rate_for_card < base_rate:
                 applicable_rule_details = {'category': [], 'payee': [], 'paymentMethod': []}

            _LOGGER.debug(f" -> Card {card_name} effective rate for this scenario: {card_effective_rate}% ({applicable_rule_details})")

            # --- Store result for this card ---
            scenario_results.append({
                'card': {
                    'id': card_id,
                    'name': card_name,
                    'bank': card_bank
                },
                'rate': card_effective_rate,
                'type': '%', # Assuming percentage for now
                # Add the specific condition lists
                'category': applicable_rule_details['category'],
                'payee': applicable_rule_details['payee'],
                'paymentMethod': applicable_rule_details['paymentMethod']
                # REMOVED: 'rule_description': final_rule_desc
            })

        # --- Sort all results by rate (descending) --- #
        scenario_results.sort(key=lambda x: x['rate'], reverse=True)

        _LOGGER.info(f"Calculated rates for {len(scenario_results)} cards for the scenario.")
        if scenario_results:
             _LOGGER.info(f"Top card: {scenario_results[0]['card']['name']} ({scenario_results[0]['rate']}%) ")

        # Return the structure expected by the frontend
        response = {
            "scenario_results": scenario_results,
            "scenario_suggestions": [] # Placeholder for future implementation
        }
        return response

    def _calculate_rule_score(self, rule, tier_rate, other_cards):
        """
        Calculate a score for a rule by comparing with other cards.
        Higher score means this rule should be prioritized for activation.

        Args:
            rule (dict): The rule to score
            tier_rate (float): The rate for the tier containing this rule
            other_cards (list): List of other credit cards to compare against

        Returns:
            float: Score value (higher is better)
        """
        # Extract rule components
        category = rule.get('category')
        payee = rule.get('payee')
        payment_method = rule.get('payment_method')

        # Start with the tier rate as base score
        base_score = tier_rate

        # Find the best competing rate from other cards
        best_competing_rate = 0
        for card in other_cards:
            # Handle different reward structures
            if card.get('rewards_structure') == 'static':
                # Check static rewards
                rewards = card.get('rewards', {})
                if category and category in rewards:
                    best_competing_rate = max(best_competing_rate, rewards[category])
                elif payee and payee in rewards.get('payees', {}):
                    best_competing_rate = max(best_competing_rate, rewards['payees'][payee])
                else:
                    # Default reward rate
                    best_competing_rate = max(best_competing_rate, rewards.get('default', 0))

            elif card.get('rewards_structure') == 'rotating':
                # Check rotating rewards
                current_rewards = card.get('current_rewards', {})
                if category and category in current_rewards:
                    best_competing_rate = max(best_competing_rate, current_rewards[category])
                elif payee and payee in current_rewards.get('payees', {}):
                    best_competing_rate = max(best_competing_rate, current_rewards['payees'][payee])
                else:
                    # Default reward rate
                    best_competing_rate = max(best_competing_rate, current_rewards.get('default', 0))

            elif card.get('rewards_structure') == 'dynamic':
                # Check active rules in dynamic rewards
                for active_rule in card.get('dynamic_rewards', {}).get('active_rules', []):
                    active_rule_def = active_rule.get('rule', {})
                    active_rate = active_rule.get('rate', 0)

                    # Check if this active rule matches our rule
                    if (active_rule_def.get('category') == category or
                        active_rule_def.get('payee') == payee or
                        active_rule_def.get('payment_method') == payment_method):
                        best_competing_rate = max(best_competing_rate, active_rate)

        # Calculate final score (difference between our rate and best competing rate)
        # A positive score means our card is better for this rule
        return tier_rate - best_competing_rate

    async def update_active_rules(self, credit_card_id, active_rules):
        """
        Update the active rules for a credit card with dynamic rewards structure.
        This allows manual configuration of which rules are active.

        Args:
            credit_card_id (str): The ID of the credit card
            active_rules (list): List of active rule objects with tier_id and rule details

        Returns:
            bool: True if successful, False otherwise
        """
        # Get all credit cards
        credit_cards = await self.get_credit_cards()
        target_card = None

        # Find the target card
        for i, card in enumerate(credit_cards):
            if card.get('id') == credit_card_id:
                target_card = card
                card_index = i
                break

        if target_card is None:
            self.logger.error(f"Credit card with ID {credit_card_id} not found")
            return False

        # Verify the card has dynamic rewards
        if target_card.get('rewards_structure') != 'dynamic':
            self.logger.error(f"Card {credit_card_id} does not have dynamic rewards structure")
            return False

        if 'dynamic_rewards' not in target_card:
            target_card['dynamic_rewards'] = {}

        # Validate active rules against tiers
        tiers = target_card.get('dynamic_rewards', {}).get('tiers', [])
        tier_map = {tier.get('tier_id'): tier for tier in tiers}

        valid_active_rules = []
        for rule_data in active_rules:
            tier_id = rule_data.get('tier_id')
            rule = rule_data.get('rule')

            if not tier_id or not rule:
                self.logger.warning(f"Skipping invalid rule data: {rule_data}")
                continue

            if tier_id not in tier_map:
                self.logger.warning(f"Tier ID {tier_id} not found in card {credit_card_id}")
                continue

            # Add the rate from the tier
            rule_with_rate = {
                'tier_id': tier_id,
                'rule': rule,
                'rate': tier_map[tier_id].get('rate', 0)
            }
            valid_active_rules.append(rule_with_rate)

        # Update the active rules
        target_card['dynamic_rewards']['active_rules'] = valid_active_rules
        target_card['dynamic_rewards']['last_updated'] = datetime.now().isoformat()

        # Save the updated credit cards
        await self.save_credit_cards(credit_cards)
        return True

    def reset_credit_cards(self):
        """Force reset the manual credit cards file to an empty array.
        This is a recovery mechanism for corrupted files.
        """
        _LOGGER.warning("PERFORMING EMERGENCY RESET of manual_credit_cards.json to recover from corruption")
        empty_cards_list = []
        try:
            # Attempt to create a backup of the current file first
            backup_path = f"{MANUAL_CREDIT_CARDS_FILE}.backup"
            try:
                if os.path.exists(MANUAL_CREDIT_CARDS_FILE):
                    import shutil
                    shutil.copy2(MANUAL_CREDIT_CARDS_FILE, backup_path)
                    _LOGGER.info(f"Created backup of corrupted file at {backup_path}")
            except Exception as backup_err:
                _LOGGER.error(f"Failed to create backup before reset: {backup_err}")

            # Write a clean, empty array to the file
            with open(MANUAL_CREDIT_CARDS_FILE, 'w') as f:
                json.dump(empty_cards_list, f, indent=4)

            # Update the cache
            self.MANUAL_CREDIT_CARDS = empty_cards_list
            _LOGGER.info("Successfully reset manual_credit_cards.json to empty array")
            return True
        except Exception as reset_err:
            _LOGGER.error(f"Error during credit cards file reset: {reset_err}")
            return False

    def get_best_overall_reward_scenarios(self):
        """
        Gathers all potential reward scenarios (base rates and specific rules)
        across all cards and sorts them by rate.

        Returns:
            list: A list of scenario dictionaries, sorted by rate descending.
                  Example scenario:
                  {
                      'card': {'id': '...', 'name': '...', 'bank': '...'},
                      'rate': 5.0,
                      'type': '%',
                      'category': ['Gas'], # List of applicable categories or [] for Any
                      'payee': [], # List of applicable payees or [] for Any
                      'paymentMethod': ['Visa'] # List of applicable methods or [] for Any
                  }
        """
        _LOGGER.info("Gathering all best possible reward scenarios...")
        all_cards = self.get_manual_credit_cards()
        all_scenarios = []

        today = date.today()
        current_month = today.month
        current_quarter = (current_month - 1) // 3 + 1

        for card in all_cards:
            card_id = card.get('id')
            card_name = card.get('card_name', card.get('name', f'Card {card_id}'))
            card_bank = card.get('bank')
            card_info = {'id': card_id, 'name': card_name, 'bank': card_bank}

            # Ensure base_rate is float
            try:
                base_rate = float(card.get('base_rate', 0.0))
            except (ValueError, TypeError): base_rate = 0.0

            # Add base rate scenario if > 0
            if base_rate > 0:
                all_scenarios.append({
                    'card': card_info,
                    'rate': base_rate,
                    'type': '%', # Assuming percentage
                    'category': [], # Base rate applies to Any Category
                    'payee': [], # Base rate applies to Any Payee
                    'paymentMethod': [] # Base rate applies to Any Payment Method
                })

            # --- Process Rules --- #
            reward_type = card.get('reward_structure_type', 'Static')
            rules_to_process = []

            # Gather static rules
            if reward_type == 'Static':
                rules_to_process.extend(card.get('static_rewards', []))

            # Gather applicable rotating rules
            elif reward_type == 'Rotating':
                rotation_period = card.get('rotation_period', 'Quarterly')
                raw_rules = card.get('rotating_rules', [])
                for rule in raw_rules:
                    is_rotating = rule.get('is_rotating', True)
                    if not is_rotating:
                        rules_to_process.append(rule)
                    else:
                        applies_now = False
                        # TODO: Update logic if months/quarters are stored differently
                        if rotation_period == 'Monthly': applies_now = current_month in rule.get('months', [])
                        elif rotation_period == 'Quarterly': applies_now = current_quarter in rule.get('quarters', [])
                        if applies_now: rules_to_process.append(rule)

            # Gather dynamic active rules
            elif reward_type == 'Dynamic':
                dynamic_structure = card.get('dynamic_rewards', {})
                active_rules_raw = dynamic_structure.get('active_rules', [])
                for active_rule_entry in active_rules_raw:
                    if isinstance(active_rule_entry, dict) and 'rule' in active_rule_entry and 'rate' in active_rule_entry:
                         rule_details = active_rule_entry['rule']
                         rule_details['rate'] = active_rule_entry['rate'] # Add rate to the rule itself
                         rules_to_process.append(rule_details)
                    elif isinstance(active_rule_entry, dict):
                         rules_to_process.append(active_rule_entry)

            # Format rule scenarios
            for rule in rules_to_process:
                if not isinstance(rule, dict): continue
                try:
                    rule_rate = float(rule.get('rate', 0.0))
                except (ValueError, TypeError): continue # Skip rules with invalid rates

                if rule_rate <= 0: continue # Skip rules with no reward

                # Extract conditions, ensuring they are lists of STRINGS (names/IDs)
                def extract_names(condition_list):
                    if not condition_list: return []
                    # Ensure it's a list first
                    if not isinstance(condition_list, list): condition_list = [condition_list]
                    # Extract names if they are dicts, otherwise assume they are strings
                    return [
                        item['name'] if isinstance(item, dict) and 'name' in item else str(item)
                        for item in condition_list
                    ]

                rule_cat_list = extract_names(rule.get('category', []))
                rule_payee_list = extract_names(rule.get('payee', []))
                rule_pm_list = extract_names(rule.get('paymentMethod', []))

                # Avoid adding rules that just duplicate the base rate for "Any/Any/Any"
                if not rule_cat_list and not rule_payee_list and not rule_pm_list and rule_rate == base_rate:
                    continue

                all_scenarios.append({
                    'card': card_info,
                    'rate': rule_rate,
                    'type': '%', # Assuming percentage
                    'category': rule_cat_list, # Now guaranteed list of strings
                    'payee': rule_payee_list, # Now guaranteed list of strings
                    'paymentMethod': rule_pm_list # Now guaranteed list of strings
                })

        # Sort all scenarios by rate, descending
        all_scenarios.sort(key=lambda x: x['rate'], reverse=True)

        _LOGGER.info(f"Found {len(all_scenarios)} total reward scenarios.")
        return all_scenarios

# Global data manager instance
data_manager = DataManager()