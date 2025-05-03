from flask import Flask, jsonify, request, send_from_directory, Blueprint, abort, redirect, Response
import logging
import os
import re
from datetime import date, timedelta, datetime
import uuid # Added for generating unique IDs
import json
import ynab_api
from ynab_api.api import accounts_api, budgets_api, transactions_api, user_api, scheduled_transactions_api, categories_api, payees_api # Added payees_api
from ynab_api.model.account import Account as YnabAccount # Import the class to patch
from functools import wraps
import time
from urllib.parse import urljoin, urlparse
import importlib.metadata
from ynab_api.model.save_transaction_wrapper import SaveTransactionWrapper
from ynab_api.exceptions import ApiException
from flask_cors import CORS
from dotenv import load_dotenv
from ynab_api.model.save_account import SaveAccount
from ynab_api.model.save_transaction import SaveTransaction
from ynab_api.model.update_transaction import UpdateTransaction

from .config import config
from .ynab_client import YNABClient # Correct import: class YNABClient
from .data_manager import (
    DataManager
    # PAYMENT_METHODS_FILE # Re-add this import # REMOVE THIS LINE
    # MANUAL_ACCOUNTS_FILE, # Removed
    # MANUAL_ASSETS_FILE, # Removed
    # MANUAL_LIABILITIES_FILE, # Removed
    # MANUAL_CREDIT_CARDS_FILE, # Removed
    # BANKS_FILE, # Removed
    # ACCOUNT_TYPES_FILE, # Removed
    # ASSET_TYPES_FILE, # Removed
    # LIABILITY_TYPES_FILE, # Removed
    # # PAYMENT_METHODS_FILE, # Already Removed
    # POINTS_PROGRAMS_FILE, # Removed
    # REWARDS_CATEGORIES_FILE, # Removed
    # REWARDS_PAYEES_FILE, # Removed
    # MANAGED_CATEGORIES_FILE, # Removed
    # MANAGED_PAYEES_FILE, # Removed
    # IMPORTED_YNAB_PAYEE_IDS_FILE # Removed
)

# Configure logging FIRST
logging.basicConfig(level=logging.DEBUG)
_LOGGER = logging.getLogger(__name__)
# Set YNAB client logger to DEBUG
logging.getLogger('backend.ynab_client').setLevel(logging.DEBUG)

# Define the static folder where Docker copies the built frontend
STATIC_FOLDER = '/app/static' # Changed from relative path calculation
_LOGGER.debug(f"Static folder path set to: {STATIC_FOLDER}")

app = Flask(__name__, static_folder=STATIC_FOLDER, static_url_path='')
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10 MB limit

# --- Instantiate DataManager globally ---
_LOGGER.info("Starting Finance Assistant...")

# Load configuration from addon options
ynab_api_key = os.getenv('YNAB_API_KEY')
ynab_budget_id = os.getenv('YNAB_BUDGET_ID')

if ynab_api_key and ynab_budget_id:
    _LOGGER.info("YNAB API Key and Budget ID found in config.")
    # ynab_client = YNABClient(ynab_api_key, ynab_budget_id) # Incorrect: Constructor takes no arguments
    # Instantiate YNABClient without arguments; it reads from config internally
    ynab_client = YNABClient()
else:
    _LOGGER.warning("YNAB API Key or Budget ID not found in config.")
    ynab_client = None # No YNAB client if config is missing

# Instantiate DataManager globally, passing the ynab_client
data_manager = DataManager(ynab_client=ynab_client)
_LOGGER.info("DataManager initialized globally.")

# --- Authentication decorator for API routes ---
def supervisor_token_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Explicitly log remote_addr early for debugging
        _LOGGER.debug(f"Decorator received request from remote_addr: {request.remote_addr}")
        auth_header = request.headers.get('Authorization')
        _LOGGER.debug(f"Request path: {request.path}")
        _LOGGER.debug(f"Headers: {dict(request.headers)}")

        supervisor_token = os.environ.get('SUPERVISOR_TOKEN')
        if supervisor_token and auth_header == f"Bearer {supervisor_token}":
            _LOGGER.debug("Auth validated via SUPERVISOR_TOKEN.")
            return f(*args, **kwargs)
        elif auth_header and auth_header.startswith('Bearer ') and supervisor_token: # Token provided but doesn't match
             token = auth_header.split('Bearer ')[1]
             _LOGGER.warning(f"Invalid Bearer token provided: {token[:5]}...")
             return jsonify({"error": "Unauthorized - Invalid Token"}), 401
        elif request.remote_addr in ['127.0.0.1', 'localhost', 'host.docker.internal'] or request.remote_addr.startswith('172.'):
             # Allow local dev connections OR internal HA requests even if token is set (FOR DEBUGGING)
             _LOGGER.debug(f"Allowing internal/local API call from {request.remote_addr}")
             return f(*args, **kwargs)
        else:
            # Explicitly log before returning 401 in the final else
            _LOGGER.warning(f"Unauthorized request from {request.remote_addr}. Entering final else block.")
            _LOGGER.warning(f"Auth header: {auth_header}. SUPERVISOR_TOKEN set: {bool(supervisor_token)}")
            return jsonify({"error": "Unauthorized"}), 401
    return decorated_function

# --- API Blueprint ---
# REMOVED url_prefix='/api' to simplify routing with ingress -- Restored prefix below
api_bp = Blueprint('api', __name__) # No url_prefix Initially

# IMPORTANT: Create a secondary registration of the same blueprint with the ingress path as prefix - This might be less critical now
# @app.before_request # REMOVED this handler as it wasn't effective
# def handle_ingress_request():
#     pass # Keep empty or remove entirely

# --- Explicit Ingress Route for /api/all_data ---
@app.route('/api/hassio_ingress/<path:addon_id>/api/all_data', methods=['GET'])
@supervisor_token_required # Ensure auth is checked
def direct_get_all_data_ingress(addon_id):
    """Handles GET requests for all_data coming directly via ingress."""
    _LOGGER.info(f"--- Handling GET /all_data directly via ingress route for addon_id: {addon_id} ---")
    # Simply call the existing blueprint function
    return get_all_data()
# --- End Explicit Ingress Route ---

# --- Simple Ping Test Route (on Blueprint) ---
@api_bp.route('/ping')
# @supervisor_token_required # REMOVED - Ping should not require auth
def ping():
    _LOGGER.info("--- PING ENDPOINT HIT --- (via /api/ping)")
    return jsonify({"message": "pong"})

# Testing route at the root level - no authentication needed
@app.route('/test')
def test():
    _LOGGER.info("Root test endpoint hit!")
    # Return detailed information about the request to help debug
    return jsonify({
        "test": "success",
        "time": str(datetime.now()),
        "request_info": {
            "path": request.path,
            "url": request.url,
            "method": request.method,
            "headers": {k: v for k, v in request.headers.items()},
            "ingress_path": request.headers.get('X-Ingress-Path', '(none)'),
            "remote_addr": request.remote_addr
        },
        "message": "If you can see this, direct API calls to the backend are working!"
    })

# --- Debug endpoint that doesn't require authentication ---
@api_bp.route('/debug')
def debug_endpoint():
    """Debug endpoint that shows request information without auth."""
    debug_info = {
        "remote_addr": request.remote_addr,
        "headers": dict(request.headers),
        "endpoint": request.path,
        "method": request.method,
        "server": {
            "app_running": True,
            "ynab_configured": ynab_client.is_configured()
        }
    }
    _LOGGER.info(f"Debug endpoint accessed from {request.remote_addr}")
    return jsonify(debug_info)

# Define PATCH handler FIRST - ** CHANGED ROUTE **
@api_bp.route('/config/update', methods=['PATCH']) # <<< Changed route to /config/update
@supervisor_token_required # Restore auth decorator
def update_config():
    """Update specific configuration settings (toggles only) via DataManager."""
    # <<< REMOVED DEBUG LOGGING >>>
    # _LOGGER.info(f"!!!!!!!! ENTERING update_config - METHOD: {request.method} !!!!!!!!")
    # <<< END DEBUG LOGGING >>>
    try:
        # _LOGGER.info("--- PATCH CONFIG START (DB Save - Simple Response) ---") # Removed old log
        _LOGGER.info("--- UPDATE CONFIG START --- ") # New simpler log
        data = request.get_json()
        if not data:
            _LOGGER.warning("PATCH /config/update called with no JSON data.")
            return jsonify({"error": "No data provided"}), 400

        _LOGGER.info(f"Received config update data: {data}")

        # --- ACTUAL LOGIC TO SAVE SETTINGS --- #
        success_flags = []
        for key, value in data.items():
            # Only allow updating specific known toggle keys
            if key in ['include_ynab_emoji', 'use_calculated_asset_value']:
                 _LOGGER.info(f"Attempting to save setting: {key} = {value}")
                 try:
                     setting_saved = data_manager.update_setting(key, value)
                     success_flags.append(setting_saved)
                     if setting_saved:
                         _LOGGER.info(f"Successfully saved setting: {key} = {value}")
                     else:
                         _LOGGER.error(f"Failed to save setting via DataManager: {key}")
                 except Exception as e:
                     _LOGGER.error(f"Error saving setting {key}: {e}", exc_info=True)
                     success_flags.append(False)
            else:
                 _LOGGER.warning(f"Ignoring unknown key in update request: {key}")

        overall_success = all(success_flags)
        _LOGGER.info(f"--- UPDATE CONFIG END (Success: {overall_success}) ---")
        if overall_success:
            return jsonify({"success": True, "message": "Settings updated successfully."}), 200
        else:
             return jsonify({"error": "Failed to update one or more settings"}), 500
        # --- END ACTUAL LOGIC --- #

    except Exception as e:
        _LOGGER.error(f"Error in PATCH /config/update endpoint: {e}", exc_info=True)
        _LOGGER.info("--- UPDATE CONFIG ERROR END --- ")
        return jsonify({"error": "Failed to update configuration"}), 500

# Define GET handler SECOND
@api_bp.route('/config', methods=['GET']) # <<< Keep GET on /config
@supervisor_token_required
def get_config():
    # <<< REMOVED DEBUG LOGGING >>>
    # _LOGGER.info(f"!!!!!!!! ENTERING get_config - METHOD: {request.method} !!!!!!!!")
    # <<< END DEBUG LOGGING >>>
    try:
        _LOGGER.info("--- GET CONFIG START ---")
        # 1. Read YNAB keys from options.json (Supervisor config)
        options_path = "/data/options.json"
        options = {}
        if os.path.exists(options_path):
            try:
                with open(options_path, 'r') as f:
                    options = json.load(f)
            except Exception as read_err:
                 _LOGGER.error(f"Error reading {options_path}: {read_err}", exc_info=True)
        else:
            _LOGGER.warning(f"{options_path} does not exist.")

        ynab_api_key = options.get('ynab_api_key', '')
        ynab_budget_id = options.get('ynab_budget_id', '')

        # 2. Read toggle settings from DataManager (DB)
        include_ynab_emoji = data_manager.get_setting('include_ynab_emoji', False)
        use_calculated_asset_value = data_manager.get_setting('use_calculated_asset_value', False)
        _LOGGER.debug(f"Read from DB: include_ynab_emoji={include_ynab_emoji}, use_calculated_asset_value={use_calculated_asset_value}")

        # 3. Combine and return
        config_data = {
            'ynab_api_key': ynab_api_key,
            'ynab_budget_id': ynab_budget_id,
            'include_ynab_emoji': include_ynab_emoji,
            'use_calculated_asset_value': use_calculated_asset_value,
        }
        _LOGGER.info(f"Returning combined config data: {config_data}")
        _LOGGER.info("--- GET CONFIG END ---")
        return jsonify(config_data)
    except Exception as e:
        _LOGGER.error(f"Error in get_config endpoint: {e}", exc_info=True)
        _LOGGER.info("--- GET CONFIG ERROR END ---")
        return jsonify({"error": "Failed to retrieve configuration"}), 500

# --- END Add PATCH method ---

# --- NEW Settings Save Endpoint ---
@api_bp.route('/settings', methods=['PUT'])
@supervisor_token_required
def update_settings():
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON data, expected an object"}), 400

    _LOGGER.info(f"Received settings update request: {data}")
    # --- FIX: Add include_ynab_emoji to allowed settings ---
    allowed_settings = ["use_calculated_asset_value", "include_ynab_emoji"]
    # --- END FIX ---
    update_results = {}
    errors = {}
    success = True

    for key, value in data.items():
        if key in allowed_settings:
            try:
                # Basic validation (specific validation could be added per key)
                if key == "use_calculated_asset_value" and not isinstance(value, bool):
                    errors[key] = "Must be a boolean (true/false)"
                    success = False
                    continue
                # --- FIX: Add validation for include_ynab_emoji ---
                if key == "include_ynab_emoji" and not isinstance(value, bool):
                    errors[key] = "Must be a boolean (true/false)"
                    success = False
                    continue
                # --- END FIX ---

                # Update the setting via DataManager
                if data_manager.update_setting(key, value):
                    update_results[key] = "Updated"
                    _LOGGER.info(f"Updated setting '{key}' to '{value}'")
                else:
                    errors[key] = "Failed to save setting"
                    success = False
                    _LOGGER.error(f"DataManager failed to update setting '{key}'")
            except Exception as e:
                _LOGGER.exception(f"Error updating setting '{key}': {e}")
                errors[key] = f"Internal server error: {e}"
                success = False
        else:
            _LOGGER.warning(f"Attempted to update disallowed setting key: {key}")
            # Optionally include in errors or just ignore
            # errors[key] = "Setting key not allowed"
            # success = False

    if success:
        return jsonify({"success": True, "details": update_results}), 200
    else:
        return jsonify({"error": "Failed to update one or more settings", "details": errors}), 400
# --- END NEW Settings Save Endpoint ---

# Helper function to apply allocation rules
def calculate_allocations(total_balance_milliunits, rules):
    # --- Removed Verbose Logging --- #
    # _LOGGER.debug(f"[calculate_allocations] START - Total Balance: {total_balance_milliunits}")
    # --- END LOGGING --- #
    liquid = 0
    frozen = 0
    deep_freeze = 0
    remaining_balance = total_balance_milliunits

    if not isinstance(rules, list):
        _LOGGER.warning("Invalid allocation rules format, expected list.")
        rules = []

    processed_rule_ids = set()
    # 1. Process Fixed Amount Rules
    for rule in rules:
        rule_id = rule.get('id')
        if rule_id == 'remaining' or rule_id in processed_rule_ids:
            continue
        if rule.get('type') == 'fixed':
            try:
                # --- FIX: Use round() instead of int() --- #
                value_milliunits = round(float(rule.get('value', 0)) * 1000)
                amount_to_allocate = min(value_milliunits, remaining_balance)
                # --- END FIX --- #
                status = rule.get('status')
                if amount_to_allocate > 0:
                    if status == 'Liquid': liquid += amount_to_allocate
                    elif status == 'Frozen': frozen += amount_to_allocate
                    elif status == 'Deep Freeze': deep_freeze += amount_to_allocate
                    else: _LOGGER.warning(f"Unknown status '{status}' in fixed rule {rule_id}")
                    remaining_balance -= amount_to_allocate
                    processed_rule_ids.add(rule_id)
            except (ValueError, TypeError) as e:
                _LOGGER.error(f"Error processing fixed rule {rule_id}: {e}")
    # --- DETAILED LOGGING --- #
    # _LOGGER.debug(f"[calculate_allocations] After Fixed Rules - Remaining: {remaining_balance}, L/F/DF: {liquid}/{frozen}/{deep_freeze}")
    # --- END LOGGING --- #

    # 2. Process Percentage Rules (on remaining balance after fixed)
    balance_after_fixed = remaining_balance
    for rule in rules:
        rule_id = rule.get('id')
        if rule_id == 'remaining' or rule_id in processed_rule_ids:
            continue
        if rule.get('type') == 'percentage':
            try:
                # --- FIX: Use round() instead of int() --- #
                percentage = float(rule.get('value', 0))
                if 0 < percentage <= 100:
                    amount_to_allocate = round(balance_after_fixed * (percentage / 100))
                    # --- END FIX --- #
                    amount_to_allocate = min(amount_to_allocate, remaining_balance) # Cap allocation
                    status = rule.get('status')
                    # --- DETAILED LOGGING --- #
                    # _LOGGER.debug(f"[calculate_allocations] Percent Rule {rule_id}: {percentage}% of {balance_after_fixed} = {amount_to_allocate}, Status: {status}")
                    # --- END LOGGING --- #
                    if amount_to_allocate > 0:
                        if status == 'Liquid': liquid += amount_to_allocate
                        elif status == 'Frozen': frozen += amount_to_allocate
                        elif status == 'Deep Freeze': deep_freeze += amount_to_allocate
                        else: _LOGGER.warning(f"Unknown status '{status}' in percentage rule {rule_id}")
                        remaining_balance -= amount_to_allocate
                        processed_rule_ids.add(rule_id)
                else:
                    _LOGGER.warning(f"Invalid percentage value {percentage} in rule {rule_id}")
            except (ValueError, TypeError) as e:
                _LOGGER.error(f"Error processing percentage rule {rule_id}: {e}")
    # --- DETAILED LOGGING --- #
    # _LOGGER.debug(f"[calculate_allocations] After Percent Rules - Remaining: {remaining_balance}, L/F/DF: {liquid}/{frozen}/{deep_freeze}")
    # --- END LOGGING --- #

    # 3. Apply the final 'remaining' rule
    remaining_rule = next((rule for rule in rules if rule.get('id') == 'remaining'), None)
    if remaining_rule:
        status = remaining_rule.get('status', 'Liquid')
        if remaining_balance > 0:
            if status == 'Liquid': liquid += remaining_balance
            elif status == 'Frozen': frozen += remaining_balance
            elif status == 'Deep Freeze': deep_freeze += remaining_balance
            else: _LOGGER.warning(f"Unknown status '{status}' in remaining rule")
    elif remaining_balance > 0:
        _LOGGER.warning("'Remaining' rule missing, defaulting leftover balance to Liquid.")
        liquid += remaining_balance

    # --- DETAILED LOGGING --- #
    # _LOGGER.debug(f"[calculate_allocations] FINAL - L/F/DF: {liquid}/{frozen}/{deep_freeze}")
    # --- END LOGGING --- #
    return {'liquid_milliunits': liquid, 'frozen_milliunits': frozen, 'deep_freeze_milliunits': deep_freeze}

# --- Consolidated Data Endpoint for HA Integration (on Blueprint) ---
@api_bp.route('/all_data')
@supervisor_token_required
def get_all_data():
    if not ynab_client.is_configured():
        _LOGGER.warning("YNAB client not configured.")
        return jsonify({"error": "YNAB client not configured."}), 500

    ynab_accounts_raw = []
    try:
        _LOGGER.debug("Attempting to fetch accounts from YNAB...")
        ynab_accounts_raw = ynab_client.get_accounts()
        if ynab_accounts_raw is None: ynab_accounts_raw = []
        _LOGGER.debug(f"Successfully fetched {len(ynab_accounts_raw)} raw accounts from YNAB.")
    except ynab_api.exceptions.ApiValueError as val_err:
        _LOGGER.error(f"YNAB API ValueError fetching accounts: {val_err}")
    except Exception as e:
        _LOGGER.error(f"Unexpected error fetching YNAB accounts: {e}", exc_info=True)
        return jsonify({"error": f"Unexpected error fetching YNAB accounts: {e}"}), 500

    combined_accounts = []
    all_assets_combined = []
    combined_liabilities = []
    combined_credit_cards = []
    transactions = []
    scheduled_transactions = []
    categories = []

    try:
        manual_accounts_data = data_manager.get_manual_accounts()
        manual_assets_dict = data_manager.get_manual_assets()
        manual_liabilities_data = data_manager.get_manual_liabilities()
        manual_credit_cards_data = data_manager.get_manual_credit_cards()

        # --- Process Accounts, Assets, Liabilities, Credit Cards ---
        regular_account_types = {'Checking', 'Savings', 'Cash'}
        potential_ynab_asset_types = {'tracking', 'investmentAccount', 'otherAsset'}
        potential_liability_types = {'otherLiability', 'mortgage', 'autoLoan', 'studentLoan', 'personalLoan', 'lineOfCredit'}
        potential_credit_card_types = {'creditCard'}
        processed_manual_asset_ids = set()
        processed_liability_ids = set()

        for acc in ynab_accounts_raw:
            if acc.deleted: continue
            acc_dict = acc.to_dict()
            ynab_id = acc_dict.get('id')
            if not ynab_id: continue
            acc_type = acc_dict.get('type')

            # Process Regular Accounts (case-insensitive)
            if acc_type and acc_type.lower() in {'checking', 'savings', 'cash'}:
                # Pass the YNAB account type to get_manual_account_details
                manual_details = data_manager.get_manual_account_details(ynab_id, account_type=acc_type)
                allocation_rules = manual_details.get('allocation_rules', []) # Rules now have correct default status
                # --- FIX: Use cleared_balance for allocation calculation --- #
                allocations = calculate_allocations(acc_dict.get('cleared_balance', 0), allocation_rules)
                # --- END FIX --- #

                # Determine final account type (prioritize manual, fallback to Title Case YNAB type)
                final_account_type = manual_details.get('account_type', acc_type.title() if acc_type else "Unknown")

                # Build combined account object
                combined = {
                    **acc_dict,
                    'bank': manual_details.get('bank'),
                    'last_4_digits': manual_details.get('last_4_digits'),
                    'include_bank_in_name': manual_details.get('include_bank_in_name', True),
                    'notes': manual_details.get('note', acc_dict.get('note')),
                    'account_type': final_account_type, # Use determined type
                    'type': final_account_type, # Keep type consistent
                    'allocation_rules': allocation_rules,
                    **allocations # Include calculated liquid/frozen/deep_freeze
                }
                combined_accounts.append(combined)

            # Process Assets
            elif acc_type in potential_ynab_asset_types:
                # Fetch manual details individually inside the loop for freshness
                manual_details = data_manager.get_manual_asset_details(ynab_id) or {}
                _LOGGER.debug(f"Asset Processing ({ynab_id}): Fetched manual_details: {manual_details}") # <-- ADD LOGGING

                # --- Explicitly look up type name from ID --- NEW
                final_asset_type_name = None
                asset_type_id = manual_details.get('asset_type_id')
                if asset_type_id:
                    all_asset_types = data_manager.get_asset_types()
                    type_obj = next((t for t in all_asset_types if t.get('id') == asset_type_id), None)
                    if type_obj:
                        final_asset_type_name = type_obj.get('name')
                # Fallback to manual details name or YNAB type if ID lookup fails
                if not final_asset_type_name:
                    final_asset_type_name = manual_details.get('type', acc_type)
                # --- End explicit lookup --- NEW

                combined = {
                    'id': ynab_id,
                    # --- FIX: Prioritize manual name --- #
                    'name': manual_details.get('name') or acc_dict.get('name'),
                    # Use the explicitly looked-up type name
                    'type': final_asset_type_name,
                    'asset_type_id': asset_type_id, # Keep the ID
                    'bank': manual_details.get('bank'),
                    # Keep the original balance field for consistency
                    'balance': acc_dict.get('balance', 0),
                    # --- FIX: Prioritize manual current_value --- #
                    # Use manual current_value if present, otherwise calculate from YNAB balance
                    'value': manual_details.get('current_value') if manual_details.get('current_value') is not None else acc_dict.get('balance', 0) / 1000.0,
                    'value_last_updated': acc_dict.get('last_modified_on'),
                    'ynab_value_last_updated_on': acc_dict.get('last_reconciled_at'),
                    'entity_id': manual_details.get('entity_id'), 'shares': manual_details.get('shares'),
                    'is_ynab': True, 'deleted': False, 'on_budget': acc_dict.get('on_budget'),
                    'ynab_type': acc_type
                }
                all_assets_combined.append(combined)
                processed_manual_asset_ids.add(ynab_id)

            # Process Liabilities
            elif acc_type in potential_liability_types:
                manual_details = manual_liabilities_data.get(ynab_id, {})
                manual_type_name = manual_details.get('liability_type') # Get manually set type name

                final_liability_type_name = manual_type_name # Default to manual type name if set

                if not final_liability_type_name: # If no manual type was set...
                    # Fetch managed types (list of dicts like {'id': '...', 'name': 'Student Loan'})
                    managed_liability_types = data_manager.get_liability_types() # Ensure this returns the list of type objects
                    # --- START DEBUG LOG ---
                    _LOGGER.debug(f"Liability {ynab_id}: Fetched managed_liability_types: {managed_liability_types}")
                    # --- END DEBUG LOG ---
                    # Attempt to find a match based on the YNAB type (case-insensitive compare)
                    matched_managed_type_obj = next((
                        m_type for m_type in managed_liability_types
                        # Compare the managed type's NAME (spaces removed) with the YNAB account type (case-insensitive)
                        if isinstance(m_type, dict) and m_type.get('name', '').replace(' ', '').lower() == acc_type.lower()
                    ), None) # Returns the full managed type object or None
                    # --- START DEBUG LOG ---
                    _LOGGER.debug(f"Liability {ynab_id}: YNAB acc_type='{acc_type}', Matched managed obj (by name, spaces removed): {matched_managed_type_obj}") # Updated log
                    # --- END DEBUG LOG ---

                    if matched_managed_type_obj:
                        final_liability_type_name = matched_managed_type_obj.get('name', acc_type) # Use the 'name' field from the matched object
                        # --- START DEBUG LOG ---
                        _LOGGER.debug(f"Liability {ynab_id}: Using managed type name: '{final_liability_type_name}'")
                        # --- END DEBUG LOG ---
                    else:
                        _LOGGER.warning(f"Could not find managed liability type with NAME matching YNAB type '{acc_type}' for liability {ynab_id}. Defaulting to raw type.")
                        final_liability_type_name = acc_type # Fallback to raw YNAB type if no match
                        # --- START DEBUG LOG ---
                        _LOGGER.debug(f"Liability {ynab_id}: Falling back to raw YNAB type: '{final_liability_type_name}'")
                        # --- END DEBUG LOG ---

                combined = {
                    **acc_dict,
                    'liability_type': final_liability_type_name, # Use the determined final type name
                    'bank': manual_details.get('bank'),
                    'value': acc_dict.get('balance', 0), # Keep raw balance
                    'value_last_updated': acc_dict.get('last_modified_on'),
                    'ynab_value_last_updated_on': acc_dict.get('last_reconciled_at'),
                    'interest_rate': manual_details.get('interest_rate'),
                    'start_date': manual_details.get('start_date'),
                    'notes': manual_details.get('notes', acc_dict.get('note')),
                    'is_ynab': True,
                    'ynab_type': acc_type
                }
                combined_liabilities.append(combined)
                processed_liability_ids.add(ynab_id)

            # Process Credit Cards
            elif acc_type in potential_credit_card_types:
                # Ensure manual_details is always a dictionary
                manual_details = data_manager.get_manual_credit_card_details(ynab_id) or {}
                combined = {
                    **acc_dict, # YNAB data comes first
                    # Manually specified fields override YNAB where applicable
                    'card_name': manual_details.get('card_name', acc_dict.get('name')),
                    'bank': manual_details.get('bank'),
                    'include_bank_in_name': manual_details.get('include_bank_in_name', True),
                    'last_4_digits': manual_details.get('last_4_digits'),
                    'expiration_date': manual_details.get('expiration_date'),
                    'auto_pay_day_1': manual_details.get('auto_pay_day_1'),
                    'auto_pay_day_2': manual_details.get('auto_pay_day_2'),
                    'credit_limit': manual_details.get('credit_limit'),
                    'payment_methods': manual_details.get('payment_methods', []),
                    'notes': manual_details.get('notes', acc_dict.get('note')),
                    'ynab_value_last_updated_on': acc_dict.get('last_reconciled_at'),
                    # --- ADDED REWARD FIELDS ---
                    'base_rate': manual_details.get('base_rate', 0.0),
                    'reward_system': manual_details.get('reward_system', 'Cashback'),
                    'points_program': manual_details.get('points_program'),
                    'reward_structure_type': manual_details.get('reward_structure_type', 'Static'),
                    # Explicitly include the reward rule arrays
                    'static_rewards': manual_details.get('static_rewards', []),
                    'rotating_rules': manual_details.get('rotating_rules', []),
                    'dynamic_tiers': manual_details.get('dynamic_tiers', []),
                    # Include period fields
                    'rotation_period': manual_details.get('rotation_period'),
                    'activation_period': manual_details.get('activation_period'),
                }

                # --- Frontend Data Structure Alignment (Optional but good practice) ---
                # Ensure necessary fields exist even if manual_details was empty
                # (get_manual_credit_card_details should handle defaults, but belt-and-suspenders)
                combined.setdefault('static_rewards', [])
                combined.setdefault('rotating_rules', [])
                combined.setdefault('dynamic_tiers', [])

                _LOGGER.debug(f"Combined credit card for {ynab_id}: {combined}")
                combined_credit_cards.append(combined)

        # Add purely manual assets
        for asset_id, data in manual_assets_dict.items():
            if asset_id not in processed_manual_asset_ids:
                data.setdefault('is_ynab', False)
                data.setdefault('name', f"Manual Asset ({data.get('type', 'Unknown')})")
                all_assets_combined.append(data)

        # Add purely manual liabilities
        # Iterate through all fetched liabilities and filter for manual ones
        for liability_id, data in manual_liabilities_data.items():
            if not data.get('is_ynab'): # Check if it's a manual-only liability
                if liability_id not in processed_liability_ids:
                    # data.setdefault('is_ynab', False) # Already known to be False
                    data.setdefault('name', f"Manual Liability ({data.get('type', 'Unknown')})")
                    data['liability_type'] = data.get('type') # Ensure consistency
                    combined_liabilities.append(data)

        # --- Fetch Transactions (KEEP THIS) ---
        try:
            ninety_days_ago = (date.today() - timedelta(days=90)).isoformat()
            _LOGGER.debug(f"Fetching regular transactions since {ninety_days_ago}...")
            transactions_raw = ynab_client.get_transactions(since_date=ninety_days_ago) or []
            transactions = [t.to_dict() for t in transactions_raw if hasattr(t, 'to_dict')]
            _LOGGER.debug(f"Fetched {len(transactions)} regular transactions.")

            _LOGGER.debug("Fetching scheduled transactions...")
            scheduled_transactions_raw = ynab_client.get_scheduled_transactions() or []
            scheduled_transactions = [st.to_dict() for st in scheduled_transactions_raw if hasattr(st, 'to_dict')]
            _LOGGER.debug(f"Fetched {len(scheduled_transactions)} scheduled transactions.")
            # --- Add Debug Log --- NEW ---
            _LOGGER.debug(f"Scheduled Transactions Data before adding to response: {scheduled_transactions}")
            # --- End Debug Log --- NEW ---
        except Exception as e:
            _LOGGER.error(f"Error fetching transactions: {e}", exc_info=True)
            # Allow continuing even if transactions fail, just log the error

        # --- REMOVED YNAB Category/Payee Fetching ---
        # Categories and Payees will now solely come from data_manager below

        # --- Combine all data ---
        all_data = {
            "accounts": combined_accounts,
            "assets": all_assets_combined,
            "liabilities": combined_liabilities,
            "credit_cards": combined_credit_cards,
            "transactions": transactions,
            "scheduled_transactions": scheduled_transactions,
            # "categories": categories, # REMOVED YNAB categories
            "managed_categories": data_manager.get_managed_categories(), # Use managed ones
            "managed_payees": data_manager.get_managed_payees(),         # Use managed ones
            "imported_ynab_payee_ids": data_manager.get_imported_ynab_payee_ids(), # Keep for now, might be unused later
            "payment_methods": data_manager.get_payment_methods(),
            "points_programs": data_manager.get_points_programs(),
            "rewards_categories": data_manager.get_rewards_categories(), # Added
            "rewards_payees": data_manager.get_rewards_payees(), # Added
            "asset_types": data_manager.get_asset_types(),
            "banks": data_manager.get_banks(),
            "account_types": data_manager.get_account_types(), # Added missing account types
            "liability_types": data_manager.get_liability_types(),
            # --- ADD CONFIG SETTING --- #
            "config": {
                "use_calculated_asset_value": data_manager.get_setting("use_calculated_asset_value", False)
            }
            # --- END ADD CONFIG SETTING --- #
        }
        # Simplified log message
        _LOGGER.debug(
            f"Returning all_data: Accounts={len(combined_accounts)}, Assets={len(all_assets_combined)}, "
            f"Liabilities={len(combined_liabilities)}, CreditCards={len(combined_credit_cards)}, "
            f"Transactions={len(transactions)}, Scheduled={len(scheduled_transactions)}, "
            f"ManagedCategories={len(all_data['managed_categories'])}, ManagedPayees={len(all_data['managed_payees'])}"
        )
        return jsonify(all_data)

    except Exception as main_e:
        _LOGGER.exception(f"Major error during get_all_data processing: {main_e}")
        return jsonify({"error": f"Internal server error: {main_e}"}), 500

@api_bp.route('/accounts')
@supervisor_token_required
def get_accounts():
    """
    Returns just the accounts data, similar to the accounts section of all_data.
    This endpoint is used by the AccountsPage component.
    """
    if not ynab_client.is_configured():
        _LOGGER.warning("YNAB client not configured for /accounts endpoint.")
        return jsonify({"error": "YNAB client not configured."}), 500

    try:
        _LOGGER.debug("Fetching accounts data for /accounts endpoint...")

        ynab_accounts_raw = []
        try:
            ynab_accounts_raw = ynab_client.get_accounts() or []
            _LOGGER.debug(f"Successfully fetched {len(ynab_accounts_raw)} raw accounts from YNAB.")
        except Exception as e:
            _LOGGER.error(f"Error fetching YNAB accounts: {e}", exc_info=True)
            # Continue with empty list if YNAB fetch fails

        combined_accounts = []
        regular_account_types = {'Checking', 'Savings', 'Cash'}

        # Process regular accounts from YNAB
        for acc in ynab_accounts_raw:
            if acc.deleted: continue
            acc_dict = acc.to_dict()
            ynab_id = acc_dict.get('id')
            if not ynab_id: continue
            acc_type = acc_dict.get('type')

            # Only include regular accounts (case-insensitive check)
            if acc_type and acc_type.lower() in {'checking', 'savings', 'cash'}:
                # Get manual details for this account
                manual_details = data_manager.get_manual_account_details(ynab_id, account_type=acc_type)
                allocation_rules = manual_details.get('allocation_rules', [])
                allocations = calculate_allocations(acc_dict.get('cleared_balance', 0), allocation_rules)

                # Determine final account type (prioritize manual, fallback to Title Case YNAB type)
                final_account_type = manual_details.get('account_type', acc_type.title() if acc_type else "Unknown")

                # Build combined account object
                combined = {
                    **acc_dict,
                    'details': {
                        'bank': manual_details.get('bank'),
                        'last_4_digits': manual_details.get('last_4_digits'),
                        'include_bank_in_name': manual_details.get('include_bank_in_name', True),
                        'notes': manual_details.get('notes', acc_dict.get('note')),
                        'account_type': final_account_type, # Use determined type
                        'type': final_account_type, # Keep type consistent
                        'allocation_rules': allocation_rules,
                        **allocations
                    }
                }
                combined_accounts.append(combined)

        # Return response with accounts and required metadata
        response_data = {
            'accounts': combined_accounts,
            'banks': data_manager.get_banks(),
            'account_types': data_manager.get_account_types()
        }

        # Log the data being returned for debugging
        _LOGGER.debug(f"Returning data from /accounts endpoint: {len(combined_accounts)} accounts")
        return jsonify(response_data)

    except Exception as e:
        _LOGGER.exception(f"Error in get_accounts endpoint: {e}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/hassio_ingress/<path:addon_id>/api/accounts')
def direct_get_accounts_ingress(addon_id):
    """Direct endpoint for getting accounts through the ingress path"""
    _LOGGER.info(f"🚨 DIRECT INGRESS HANDLER - accounts GET called with addon_id: {addon_id}")
    return get_accounts()

# --- Add direct ingress handlers for manual account operations ---
@app.route('/api/hassio_ingress/<path:addon_id>/api/manual_account/<ynab_account_id>', methods=['GET'])
def direct_get_manual_account_ingress(addon_id, ynab_account_id):
    """Direct endpoint for getting manual account details through the ingress path"""
    _LOGGER.info(f"🚨 DIRECT INGRESS HANDLER - manual_account GET called with addon_id: {addon_id}, account_id: {ynab_account_id}")

    # Get the manual account details directly
    account_details = data_manager.get_manual_account_details(ynab_account_id)

    # Get YNAB account type if available, for default allocation rules
    account_type = None
    try:
        if ynab_client is not None:
            ynab_account = ynab_client.get_account_by_id(ynab_account_id)
            if ynab_account:
                account_type = ynab_account.type
                _LOGGER.debug(f"Found YNAB account type: {account_type}")
            else:
                _LOGGER.warning(f"YNAB account {ynab_account_id} not found")
    except Exception as e:
        _LOGGER.error(f"Error getting YNAB account: {e}")

    # If we have details, return with calculated allocations
    if account_details:
        # Get YNAB balance if available, for allocation calculations
        balance = 0
        # Re-implemented the try-except block
        try:
            if ynab_client is not None:
                ynab_account = ynab_client.get_account_by_id(ynab_account_id)
                if ynab_account:
                    balance = ynab_account.balance
        except Exception as e:
            _LOGGER.error(f"Error getting YNAB account balance: {e}")

        # Calculate allocations based on rules if any exist
        if 'allocation_rules' in account_details:
            try:
                # Recalculate allocations based on current YNAB balance
                allocations = calculate_allocations(balance, account_details['allocation_rules'])
                account_details.update(allocations)
            except Exception as e:
                _LOGGER.error(f"Error calculating allocations: {e}")

        # Ensure both account_type and type fields are present for frontend consistency
        if 'account_type' in account_details and 'type' not in account_details:
            account_details['type'] = account_details['account_type']
        elif 'type' in account_details and 'account_type' not in account_details:
            account_details['account_type'] = account_details['type']

        return jsonify(details=account_details)
    else:
        # Return an empty object with 200 status if no details found
        return jsonify(details={}), 200

@app.route('/api/hassio_ingress/<path:addon_id>/api/manual_account/<ynab_account_id>', methods=['POST', 'PUT'])
def direct_save_manual_account_ingress(addon_id, ynab_account_id):
    """Simplified direct endpoint for saving manual account details."""
    # <<< ADD LOGGING HERE >>>
    _LOGGER.info(f"--- direct_save_manual_account_ingress START for {ynab_account_id} ---")
    raw_data = request.data
    _LOGGER.info(f"Raw request data (ingress): {raw_data}")
    try:
        _LOGGER.info(f"Attempting to parse JSON (ingress): {request.get_json()}")
    except Exception as json_err:
        _LOGGER.error(f"Error parsing JSON (ingress): {json_err}")
    # <<< END LOGGING >>>
    _LOGGER.info(f"🚨 DIRECT HANDLER - manual_account {request.method} for {ynab_account_id}")

    try:
        data = request.json if request.is_json else {}

        if not isinstance(data, dict):
            _LOGGER.error("Invalid JSON payload - not a dictionary")
            return jsonify(error="Invalid data format"), 400

        # Extract nested details if present
        if 'details' in data and isinstance(data['details'], dict):
            data_to_save = data['details']
        else:
            data_to_save = data

        _LOGGER.info(f"Data to save: {data_to_save}")

        # Just call the data manager directly with minimal processing
        success = data_manager.save_manual_account_details(ynab_account_id, data_to_save)

        if success:
            _LOGGER.info(f"✅ Successfully saved account {ynab_account_id}")
            return jsonify({"success": True}), 200
        else:
            _LOGGER.error(f"❌ Failed to save account {ynab_account_id}")
            return jsonify(error="Failed to save account details"), 500

    except Exception as e:
        import traceback
        _LOGGER.error(f"💥 ERROR: {e}")
        _LOGGER.error(f"💥 Traceback: {traceback.format_exc()}")
        return jsonify(error=str(e)), 500

@app.route('/api/hassio_ingress/<path:addon_id>/api/manual_account/<ynab_account_id>', methods=['DELETE'])
def direct_delete_manual_account_ingress(addon_id, ynab_account_id):
    """Direct endpoint for deleting manual account details through the ingress path"""
    _LOGGER.info(f"🚨 DIRECT INGRESS HANDLER - manual_account DELETE called with addon_id: {addon_id}, account_id: {ynab_account_id}")

    if data_manager.delete_manual_account_details(ynab_account_id):
        _LOGGER.info(f"Successfully deleted manual details for account via ingress: {ynab_account_id}")
        return jsonify({"success": True}), 200
    else:
        # Might not have existed in the first place
        _LOGGER.warning(f"Attempted to delete non-existent manual details for account via ingress: {ynab_account_id}")
        return jsonify({"error": "Manual details not found to delete"}), 404

# --- Payment Methods Management ---
@api_bp.route('/payment_methods', methods=['GET', 'POST', 'DELETE', 'PUT'])
@supervisor_token_required
def manage_payment_methods():
    if request.method == 'GET':
        try:
            methods = data_manager.get_payment_methods()
            return jsonify(methods)
        except Exception as e:
            _LOGGER.error(f"Error getting payment methods: {e}")
            return jsonify({"error": "Failed to retrieve payment methods."}), 500

    if not request.is_json: return jsonify({"error": "Request must be JSON"}), 400
    data = request.get_json()

    if request.method == 'PUT':
        # For update we need both original and new name
        original_name = data.get('originalName')
        new_name = data.get('newName')
        if not original_name or not new_name or not isinstance(original_name, str) or not isinstance(new_name, str):
            return jsonify({"error": "Both originalName and newName are required and must be strings"}), 400
        original_name = original_name.strip()
        new_name = new_name.strip()
        if not new_name:
            return jsonify({"error": "New payment method name cannot be empty"}), 400

        try:
            success, message = data_manager.update_payment_method(original_name, new_name)
            status_code = 200 if success else (404 if "not found" in message.lower() else 409)

            if success:
                updated_methods = data_manager.get_payment_methods()
                return jsonify({"success": True, "message": message, "methods": updated_methods}), status_code
            else:
                return jsonify({"success": False, "error": message}), status_code
        except Exception as e:
            _LOGGER.exception(f"Error updating payment method from '{original_name}' to '{new_name}': {e}")
            return jsonify({"error": f"An internal error occurred while updating '{original_name}'"}), 500

    # For POST and DELETE methods, we need the 'name' field
    name = data.get('name')
    if not name or not isinstance(name, str) or not name.strip():
        return jsonify({"error": "Payment method name is required and must be a non-empty string"}), 400
    name = name.strip()

    try:
        if request.method == 'POST':
            _LOGGER.info("Handling POST request for /payment_methods")
            _LOGGER.debug(f"Received new payment method name: {name}")

            # Use the data_manager function directly
            _LOGGER.debug(f"Calling data_manager.add_payment_method('{name}')")
            success, message, updated_methods_list = data_manager.add_payment_method(name) # Get updated list directly
            _LOGGER.debug(f"data_manager.add_payment_method returned: success={success}, message='{message}'")

            if success:
                # No need to call get_payment_methods again, add_payment_method returns the updated list
                _LOGGER.info(f"Successfully added payment method: {name}")
                _LOGGER.debug(f"Returning updated methods: {updated_methods_list}")
                return jsonify({"success": True, "methods": updated_methods_list}), 201
            else:
                _LOGGER.warning(f"Failed to add payment method '{name}': {message}")
                return jsonify({"error": message}), 409  # Most likely a duplicate

        elif request.method == 'DELETE':
            # Use the data_manager function directly for DELETE
            _LOGGER.debug(f"Calling data_manager.delete_payment_method('{name}')")
            result = data_manager.delete_payment_method(name) # delete_payment_method returns dict
            _LOGGER.debug(f"data_manager.delete_payment_method returned: {result}")
            success = result.get('success', False)
            message = result.get('error') or result.get('message') # Get message or error
            status_code = 200 if success else (404 if message and "not found" in message.lower() else 400)
            if success:
                # Need to get updated list after delete
                updated_methods = data_manager.get_payment_methods()
                return jsonify({"success": True, "methods": updated_methods}), status_code
            else:
                return jsonify({"success": False, "error": message}), status_code
        else:
            return jsonify({"error": "Method Not Allowed"}), 405

        # This part below was incorrect logic for DELETE/PUT, handled above now.
        # # Common return logic for DELETE/PUT
        # if success:
        #     updated_methods = data_manager.get_payment_methods()
        #     return jsonify({"success": True, "message": message, "methods": updated_methods}), status_code
        # else:
        #     return jsonify({"success": False, "error": message}), status_code

    except Exception as e:
        action = request.method # Use actual method for logging
        _LOGGER.exception(f"Error {action} payment method '{name if name else 'N/A'}': {e}") # Handle case where name might not be defined for PUT
        error_name = name if request.method != 'PUT' else data.get('originalName', 'N/A')
        return jsonify({"error": f"An internal error occurred while {action} '{error_name}'"}), 500

# --- Manual Account Data Management ---
@api_bp.route('/manual_account/<ynab_account_id>', methods=['GET'])
@supervisor_token_required
def get_manual_account(ynab_account_id):
    """Get manual account details for a specific YNAB account."""
    _LOGGER.debug(f"GET manual_account/{ynab_account_id} received")

    # Get the manual account details
    account_details = data_manager.get_manual_account_details(ynab_account_id)

    # Get YNAB account type if available, for default allocation rules
    account_type = None
    try:
        if ynab_client is not None:
            ynab_account = ynab_client.get_account_by_id(ynab_account_id)
            if ynab_account:
                account_type = ynab_account.type
                _LOGGER.debug(f"Found YNAB account type: {account_type}")
            else:
                _LOGGER.warning(f"YNAB account {ynab_account_id} not found")
        else:
            _LOGGER.warning("YNAB client not configured")
    except Exception as e:
        _LOGGER.error(f"Error getting YNAB account: {e}")

    # If we have details, return with calculated allocations
    if account_details:
        # Get YNAB balance if available, for allocation calculations
        balance = 0
        # Re-implemented the try-except block
        try:
            if ynab_client is not None:
                ynab_account = ynab_client.get_account_by_id(ynab_account_id)
                if ynab_account:
                    balance = ynab_account.balance
        except Exception as e:
            _LOGGER.error(f"Error getting YNAB account balance: {e}")

        # Calculate allocations based on rules if any exist
        if 'allocation_rules' in account_details:
            try:
                # Recalculate allocations based on current YNAB balance
                allocations = calculate_allocations(balance, account_details['allocation_rules'])
                account_details.update(allocations)
            except Exception as e:
                _LOGGER.error(f"Error calculating allocations: {e}")

        # Ensure both account_type and type fields are present for frontend consistency
        if 'account_type' in account_details and 'type' not in account_details:
            account_details['type'] = account_details['account_type']
        elif 'type' in account_details and 'account_type' not in account_details:
            account_details['account_type'] = account_details['type']

        _LOGGER.debug(f"Returning manual account details with keys: {list(account_details.keys())}")
        _LOGGER.debug(f"Account type fields: account_type={account_details.get('account_type')}, type={account_details.get('type')}")

        return jsonify(details=account_details)
    else:
        # Return an empty object with 200 status if no details found
        # This is better than 404 for frontend consistency
        _LOGGER.debug(f"No manual details found for account {ynab_account_id}")
        return jsonify(details={}), 200

@api_bp.route('/manual_account/<ynab_account_id>', methods=['POST', 'PUT'])
@supervisor_token_required
def save_manual_account(ynab_account_id):
    """Save or update manual details for a YNAB account."""
    # <<< ADD LOGGING HERE >>>
    _LOGGER.info(f"--- save_manual_account START for {ynab_account_id} ---")
    raw_data = request.data
    _LOGGER.info(f"Raw request data: {raw_data}")
    try:
        _LOGGER.info(f"Attempting to parse JSON: {request.get_json()}")
    except Exception as json_err:
        _LOGGER.error(f"Error parsing JSON: {json_err}")
    # <<< END LOGGING >>>
    _LOGGER.debug(f"{request.method} manual_account/{ynab_account_id} received")

    # Validate request format
    if not request.is_json:
        _LOGGER.warning("Invalid request: not JSON")
        return jsonify(error="Request must be JSON"), 400

    try:
        details = request.json
        _LOGGER.debug(f"Received account details: {details}")

        if not isinstance(details, dict):
            _LOGGER.warning("Invalid request data format: not a dictionary")
            return jsonify(error="Invalid data format"), 400

        # Save the details
        success = data_manager.save_manual_account_details(ynab_account_id, details)
        if not success:
            _LOGGER.error("Failed to save account details")
            return jsonify(error="Failed to save account details"), 500

        # Get YNAB account type and balance after saving, for calculations
        account_type = None
        balance = 0
        try:
            if ynab_client is not None:
                ynab_account = ynab_client.get_account_by_id(ynab_account_id)
                if ynab_account:
                    account_type = ynab_account.type
                    balance = ynab_account.balance
        except Exception as e:
            _LOGGER.error(f"Error getting YNAB account after save: {e}")

        # Get the saved details
        saved_details = data_manager.get_manual_account_details(ynab_account_id, account_type)

        # Recalculate allocations based on the saved rules and current YNAB balance
        if 'allocation_rules' in saved_details:
            try:
                allocations = calculate_allocations(balance, saved_details['allocation_rules'])
                saved_details.update(allocations)
            except Exception as e:
                _LOGGER.error(f"Error calculating allocations after save: {e}")

        # Ensure both account_type and type fields are present for frontend consistency
        if 'account_type' in saved_details and 'type' not in saved_details:
            saved_details['type'] = saved_details['account_type']
        elif 'type' in saved_details and 'account_type' not in saved_details:
            saved_details['account_type'] = saved_details['type']

        _LOGGER.debug(f"Saved details with keys: {list(saved_details.keys())}")
        _LOGGER.debug(f"Account type fields after save: account_type={saved_details.get('account_type')}, type={saved_details.get('type')}")

        # <<< ADD EXTRA LOGGING HERE >>>
        _LOGGER.info(f"💾 Returning details after save: {saved_details}")
        # <<< END EXTRA LOGGING >>>

        return jsonify(details=saved_details)
    except Exception as e:
        _LOGGER.error(f"Error saving account details: {e}")
        return jsonify(error=str(e)), 500

@api_bp.route('/manual_account/<ynab_account_id>', methods=['DELETE'])
@supervisor_token_required
def delete_manual_account(ynab_account_id):
    """Deletes manual details associated with a YNAB account."""
    if data_manager.delete_manual_account_details(ynab_account_id):
        _LOGGER.info(f"Successfully deleted manual details for account: {ynab_account_id}")
        return jsonify({"success": True}), 200
    else:
        # Might not have existed in the first place
        _LOGGER.warning(f"Attempted to delete non-existent manual details for account: {ynab_account_id}")
        return jsonify({"error": "Manual details not found to delete"}), 404

# --- Bank Management ---
@api_bp.route('/banks', methods=['GET'])
@supervisor_token_required
def get_banks():
    return jsonify(data_manager.get_banks()) # Returns a list

@api_bp.route('/banks', methods=['POST'])
@supervisor_token_required
def add_bank():
    if not request.is_json or 'name' not in request.json:
        return jsonify({"error": "Request must be JSON with a 'name' field"}), 400
    bank_name = request.json.get('name', '').strip()
    if not bank_name: return jsonify({"error": "'name' cannot be empty"}), 400

    success, message, new_bank = data_manager.add_bank(bank_name)
    if success:
        return jsonify({"success": True, "banks": data_manager.get_banks()}), 201
    else:
        return jsonify({"error": message}), 409 # Conflict

@api_bp.route('/banks', methods=['PUT'])
@supervisor_token_required
def update_bank():
    if not request.is_json or 'originalName' not in request.json or 'newName' not in request.json:
        return jsonify({"error": "Request must be JSON with 'originalName' and 'newName' fields"}), 400
    original_name = request.json.get('originalName')
    new_name = request.json.get('newName', '').strip()
    if not new_name: return jsonify({"error": "'newName' cannot be empty"}), 400

    success, message, updated_bank = data_manager.update_bank(original_name, new_name)
    if success:
        return jsonify({"success": True, "banks": data_manager.get_banks()}), 200
    else:
        status_code = 404 if "not found" in message.lower() else 409 # Not found or conflict
        return jsonify({"error": message}), status_code

@api_bp.route('/banks', methods=['DELETE'])
@supervisor_token_required
def delete_bank():
    if not request.is_json or 'name' not in request.json:
        return jsonify({"error": "Request must be JSON with a 'name' field"}), 400
    bank_name = request.json['name']
    success, message = data_manager.delete_bank(bank_name)
    if success:
        return jsonify({"success": True, "banks": data_manager.get_banks()}), 200
    else:
        status_code = 404 if "not found" in message.lower() else 409 # Not found or in use
        return jsonify({"error": message}), status_code


# --- Account Type Management ---
@api_bp.route('/account_types', methods=['GET'])
@supervisor_token_required
def get_account_types():
    return jsonify(data_manager.get_account_types()) # Returns a list

@api_bp.route('/account_types', methods=['POST'])
@supervisor_token_required
def add_account_type():
    if not request.is_json or 'name' not in request.json:
        return jsonify({"error": "Request must be JSON with a 'name' field"}), 400
    type_name = request.json.get('name', '').strip()
    if not type_name: return jsonify({"error": "'name' cannot be empty"}), 400

    success, message, new_type = data_manager.add_account_type(type_name)
    if success:
        return jsonify({"success": True, "types": data_manager.get_account_types()}), 201
    else:
        return jsonify({"error": message}), 409 # Conflict

@api_bp.route('/account_types', methods=['PUT'])
@supervisor_token_required
def update_account_type():
    if not request.is_json or 'originalName' not in request.json or 'newName' not in request.json:
        return jsonify({"error": "Request must be JSON with 'originalName' and 'newName' fields"}), 400
    original_name = request.json.get('originalName')
    new_name = request.json.get('newName', '').strip()
    if not new_name: return jsonify({"error": "'newName' cannot be empty"}), 400

    success, message, updated_type = data_manager.update_account_type(original_name, new_name)
    if success:
        return jsonify({"success": True, "types": data_manager.get_account_types()}), 200
    else:
        status_code = 404 if "not found" in message.lower() else 409 # Not found or conflict
        return jsonify({"error": message}), status_code

@api_bp.route('/account_types', methods=['DELETE'])
@supervisor_token_required
def delete_account_type():
    if not request.is_json or 'name' not in request.json:
        return jsonify({"error": "Request must be JSON with a 'name' field"}), 400
    type_name = request.json['name']
    success, message = data_manager.delete_account_type(type_name)
    if success:
        return jsonify({"success": True, "types": data_manager.get_account_types()}), 200
    else:
        status_code = 404 if "not found" in message.lower() else 409 # Not found or in use
        return jsonify({"error": message}), status_code

# --- Manual Asset Data Management ---
@api_bp.route('/manual_asset/<ynab_account_id>', methods=['GET'])
@supervisor_token_required
def get_manual_asset(ynab_account_id):
    # Fetch the potentially updated details after saving
    details = data_manager.get_manual_asset_details(ynab_account_id)
    return jsonify(details or {}), 200

@api_bp.route('/manual_asset/<ynab_account_id>', methods=['POST', 'PUT'])
@supervisor_token_required
def save_manual_asset(ynab_account_id):
    if not request.is_json:
        _LOGGER.error(f"Received non-JSON request for save_manual_asset {ynab_account_id}")
        return jsonify({"error": "Request must be JSON"}), 400

    try:
        details = request.get_json()
        _LOGGER.info(f"Successfully parsed details for manual asset {ynab_account_id}: {details}")

        # --- Original logic ---
        if data_manager.save_manual_asset(ynab_account_id, details):
            _LOGGER.info(f"Data manager successfully saved manual asset {ynab_account_id}")
            # Fetch the potentially updated details after saving
            saved_details = data_manager.get_manual_asset_details(ynab_account_id)
            return jsonify({"success": True, "details": saved_details or details}), 200 # Return saved or original as fallback
        else:
            _LOGGER.error(f"Data manager failed saving manual asset {ynab_account_id}")
            return jsonify({"error": "Failed to save"}), 500
        # --- End original logic ---

    except json.JSONDecodeError as json_e:
        _LOGGER.exception(f"JSONDecodeError processing save_manual_asset for {ynab_account_id}")
        return jsonify({"error": f"Invalid JSON received: {json_e}"}), 400 # Return 400 for bad JSON
    except Exception as e:
        _LOGGER.exception(f"Unexpected error processing save_manual_asset for {ynab_account_id}")
        return jsonify({"error": f"Internal server error: {e}"}), 500

@api_bp.route('/manual_asset/<ynab_account_id>', methods=['DELETE'])
@supervisor_token_required
def delete_manual_asset(ynab_account_id):
    if data_manager.delete_manual_asset_details(ynab_account_id):
        return jsonify({"success": True}), 200
    else:
        return jsonify({"error": "Failed to delete or not found"}), 404

# --- Asset Type Management ---
@api_bp.route('/asset_types', methods=['GET'])
@supervisor_token_required
def get_asset_types():
    return jsonify(data_manager.get_asset_types()) # Returns list

@api_bp.route('/asset_types', methods=['POST'])
@supervisor_token_required
def add_asset_type():
    if not request.is_json or 'name' not in request.json:
        return jsonify({"error": "Request must be JSON with a 'name' field"}), 400
    type_name = request.json.get('name', '').strip()
    if not type_name: return jsonify({"error": "'name' cannot be empty"}), 400

    success, message, new_type = data_manager.add_asset_type(type_name)
    if success:
        return jsonify({"success": True, "types": data_manager.get_asset_types()}), 201
    else:
        return jsonify({"error": message}), 409 # Conflict

@api_bp.route('/asset_types', methods=['PUT'])
@supervisor_token_required
def update_asset_type():
    if not request.is_json or 'originalName' not in request.json or 'newName' not in request.json:
        return jsonify({"error": "Request must be JSON with 'originalName' and 'newName' fields"}), 400
    original_name = request.json.get('originalName')
    new_name = request.json.get('newName', '').strip()
    if not new_name: return jsonify({"error": "'newName' cannot be empty"}), 400

    success, message, updated_type = data_manager.update_asset_type(original_name, new_name)
    if success:
        return jsonify({"success": True, "types": data_manager.get_asset_types()}), 200
    else:
        status_code = 404 if "not found" in message.lower() else 409 # Not found or conflict
        return jsonify({"error": message}), status_code

@api_bp.route('/asset_types', methods=['DELETE'])
@supervisor_token_required
def delete_asset_type():
    if not request.is_json or 'name' not in request.json:
        return jsonify({"error": "Request must be JSON with a 'name' field"}), 400
    type_name = request.json['name']
    success, message = data_manager.delete_asset_type(type_name)
    if success:
        return jsonify({"success": True, "types": data_manager.get_asset_types()}), 200
    else:
        status_code = 404 if "not found" in message.lower() else 409 # Not found or in use
        return jsonify({"error": message}), status_code

# --- Asset Management (Unified) ---
@api_bp.route('/assets/<asset_id>', methods=['DELETE'])
@supervisor_token_required
def delete_asset(asset_id):
    try:
        success, message = data_manager.delete_manual_asset(asset_id)
        if success:
            _LOGGER.info(f"Successfully deleted asset with ID: {asset_id}")
            return jsonify({"success": True}), 200
        else:
            status_code = 404 if "not found" in message.lower() else 400
            _LOGGER.warning(f"Failed to delete asset {asset_id}: {message}")
            return jsonify({"error": message}), status_code
    except Exception as e:
        _LOGGER.exception(f"Error deleting asset {asset_id}: {e}")
        return jsonify({"error": "An internal error occurred."}), 500

@api_bp.route('/assets/<asset_id>', methods=['PUT'])
@supervisor_token_required
def update_asset(asset_id):
    if not request.is_json: return jsonify({"error": "Request must be JSON"}), 400
    details = request.get_json()
    _LOGGER.debug(f"Received data for update_asset {asset_id}: {details}")

    # Validation
    errors = {}
    if not details.get('type'): errors['type'] = "Asset Type is required."
    if details.get('value') is None or details.get('value') == '': errors['value'] = "Current Value is required."
    else:
        try: float(details['value'])
        except (ValueError, TypeError): errors['value'] = "Current Value must be a number."

    if details.get('type') == 'Stocks':
        if not details.get('entity_id'): errors['entity_id'] = "Entity ID is required for Stocks."
        if details.get('shares') is not None and details.get('shares') != '':
            try: float(details['shares'])
            except (ValueError, TypeError): errors['shares'] = "Shares must be a number."

    if errors:
        _LOGGER.error(f"Validation errors for update_asset {asset_id}: {errors}")
        return jsonify({"error": "Validation failed", "details": errors}), 400

    try:
        result_id = data_manager.save_manual_asset(asset_id, details)
        if result_id:
            updated_asset = data_manager.get_manual_asset_details(asset_id)
            if updated_asset:
                _LOGGER.info(f"Successfully updated asset with ID: {asset_id}")
                return jsonify(updated_asset), 200
            else:
                 _LOGGER.error(f"Could not retrieve updated asset {asset_id} after successful save.")
                 return jsonify({"error": "Update succeeded but failed to retrieve updated data."}), 500
        else:
            # Check if the asset ID was valid initially
            if not data_manager.get_manual_asset_details(asset_id):
                 _LOGGER.warning(f"Attempted to update non-existent asset via PUT: {asset_id}")
                 return jsonify({"error": "Asset not found"}), 404
            else:
                 _LOGGER.error(f"Data manager failed to save updated asset {asset_id}.")
                 return jsonify({"error": "Failed to save updated asset data."}), 500
    except Exception as e:
        _LOGGER.exception(f"Error processing update asset request for ID {asset_id}: {e}")
        return jsonify({"error": "An internal error occurred."}), 500

# --- Manual Liability Data Management ---
@api_bp.route('/manual_liability/<ynab_account_id>', methods=['GET'])
@supervisor_token_required
def get_manual_liability(ynab_account_id):
    details = data_manager.get_manual_liability_details(ynab_account_id)
    return jsonify(details) if details is not None else (jsonify({}), 200) # Empty if not found

@api_bp.route('/manual_liability/<ynab_account_id>', methods=['POST', 'PUT'])
@supervisor_token_required
def save_manual_liability(ynab_account_id):
    if not request.is_json: return jsonify({"error": "Request must be JSON"}), 400
    details = request.get_json()
    if data_manager.save_manual_liability_details(ynab_account_id, details):
        return jsonify({"success": True, "details": details}), 200
    else:
        return jsonify({"error": "Failed to save"}), 500

@api_bp.route('/manual_liability/<ynab_account_id>', methods=['DELETE'])
@supervisor_token_required
def delete_manual_liability(ynab_account_id):
    if data_manager.delete_manual_liability_details(ynab_account_id):
        return jsonify({"success": True}), 200
    else:
        return jsonify({"error": "Failed to delete or not found"}), 404

# --- Liability Type Management ---
@api_bp.route('/liability_types', methods=['GET'])
@supervisor_token_required
def get_liability_types():
    return jsonify(data_manager.get_liability_types()) # Returns a list

@api_bp.route('/liability_types', methods=['POST'])
@supervisor_token_required
def add_liability_type():
    if not request.is_json or 'name' not in request.json:
        return jsonify({"error": "Request must be JSON with a 'name' field"}), 400
    type_name = request.json.get('name', '').strip()
    if not type_name: return jsonify({"error": "'name' cannot be empty"}), 400

    success, message, new_type = data_manager.add_liability_type(type_name)
    if success:
        return jsonify({"success": True, "message": message, "liability_type": new_type, "types": data_manager.get_liability_types()}), 201
    else:
        return jsonify({"error": message}), 409 # Conflict

@api_bp.route('/liability_types', methods=['PUT'])
@supervisor_token_required
def update_liability_type():
    if not request.is_json or 'originalName' not in request.json or 'newName' not in request.json:
        return jsonify({"error": "Request must be JSON with 'originalName' and 'newName' fields"}), 400
    original_name = request.json.get('originalName')
    new_name = request.json.get('newName', '').strip()
    if not new_name: return jsonify({"error": "'newName' cannot be empty"}), 400

    success, message, updated_type = data_manager.update_liability_type(original_name, new_name)
    if success:
        return jsonify({"success": True, "message": message, "liability_type": updated_type, "types": data_manager.get_liability_types()})
    else:
        status_code = 404 if "not found" in message.lower() else 409 # Not found or conflict
        return jsonify({"error": message}), status_code

@api_bp.route('/liability_types', methods=['DELETE'])
@supervisor_token_required
def delete_liability_type():
    if not request.is_json or 'name' not in request.json:
        return jsonify({"error": "Request must be JSON with a 'name' field"}), 400
    type_name = request.json['name']
    success, message = data_manager.delete_liability_type(type_name)
    if success:
        return jsonify({"success": True, "message": message})
    else:
        status_code = 404 if "not found" in message.lower() else 409 # Not found or in use
        return jsonify({"error": message}), status_code

# --- Manual Credit Card Data Management ---
@api_bp.route('/manual_credit_card/<ynab_card_id>', methods=['GET'])
@supervisor_token_required
def get_manual_credit_card(ynab_card_id):
    details = data_manager.get_manual_credit_card_details(ynab_card_id)
    return jsonify(details), 200

@api_bp.route('/manual_credit_card/<ynab_card_id>', methods=['POST', 'PUT'])
@supervisor_token_required
def save_manual_credit_card(ynab_card_id):
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    if not data or not isinstance(data, dict):
        _LOGGER.error(f"Invalid JSON data received for card {ynab_card_id}: {data}")
        return jsonify({"error": "Invalid JSON data"}), 400

    _LOGGER.debug(f"Received data for card {ynab_card_id}: {data}")

    # --- Basic Validation for New Fields ---
    base_rate = data.get('base_rate')
    if base_rate is not None:
        try:
            # Ensure it can be converted to float, DataManager handles final type
            float(base_rate)
        except (ValueError, TypeError):
            return jsonify({"error": f"Invalid base_rate value: {base_rate}"}), 400

    reward_system = data.get('reward_system')
    if reward_system not in ['Cashback', 'Points']:
        # DataManager defaults to Cashback, but good to catch invalid input early
        return jsonify({"error": f"Invalid reward_system: {reward_system}. Must be 'Cashback' or 'Points'."}), 400

    points_program = data.get('points_program')
    if reward_system == 'Points' and not points_program:
        return jsonify({"error": "Points Program is required when Reward System is Points"}), 400
    if reward_system == 'Cashback' and points_program:
         _LOGGER.warning(f"Points program '{points_program}' provided for Cashback system on card {ynab_card_id}. It will be ignored/set to null by DataManager.")
        # Allow this, DataManager will nullify it

    # --- End Basic Validation ---

    # Removed explicit field extraction, pass the whole validated dict to DataManager
    # DataManager.save_manual_credit_card_details now handles defaults and sanitization

    try:
        # Pass the entire validated data dictionary
        success = data_manager.save_manual_credit_card_details(ynab_card_id, data)

        if success:
            _LOGGER.info(f"Successfully saved manual details for credit card {ynab_card_id}. Now retrieving full object.")
            # --- Retrieve and combine data for the response ---
            ynab_account = None
            acc_dict = {}
            try:
                if ynab_client and ynab_client.is_configured():
                     ynab_account = ynab_client.get_account_by_id(ynab_card_id)
                     if ynab_account and ynab_account.type == 'creditCard':
                         acc_dict = ynab_account.to_dict()
                     else:
                         _LOGGER.warning(f"YNAB account {ynab_card_id} not found or not a credit card after save.")
                else:
                     _LOGGER.warning("YNAB client not configured, cannot fetch base YNAB data for response.")
            except Exception as fetch_err:
                _LOGGER.error(f"Error fetching YNAB account {ynab_card_id} after save: {fetch_err}")

            # Get the latest manual details that were just saved
            # DataManager now ensures these fields exist with defaults
            manual_details = data_manager.get_manual_credit_card_details(ynab_card_id)
            if not manual_details:
                 _LOGGER.error(f"Failed to retrieve manual details for {ynab_card_id} immediately after saving!")
                 # Fallback to returning just the saved data? Or error?
                 # Let's return the input data for now as a fallback response
                 return jsonify(data), 200

            # Combine YNAB data (if available) with manual details
            combined_card = {
                **acc_dict, # Spread YNAB data first (id, balance, closed, deleted etc.)
                **manual_details # Spread LATEST manual details over YNAB data
                # Ensure YNAB ID is preserved if it wasn't in manual details somehow
                # 'id': ynab_card_id,
                # The spread of manual_details should now include the new fields:
                # base_rate, reward_system, points_program
            }
            # Ensure the ID from the URL parameter is definitely used
            combined_card['id'] = ynab_card_id

            # Log the keys being returned for verification
            _LOGGER.debug(f"Returning combined card object with keys: {list(combined_card.keys())}")
            return jsonify(combined_card), 200
        else:
             _LOGGER.error(f"DataManager returned False for save_manual_credit_card_details {ynab_card_id}")
             return jsonify({"error": "Failed to save credit card details"}), 500
    except Exception as e:
        _LOGGER.exception(f"Exception saving credit card details for {ynab_card_id}: {e}")
        return jsonify({"error": "An internal server error occurred"}), 500

# --- Liability Management (Manual Only) ---
@api_bp.route('/liabilities/<liability_id>', methods=['PUT'])
@supervisor_token_required
def update_manual_liability_route(liability_id):
    if not request.is_json: return jsonify({"error": "Request must be JSON"}), 400
    data = request.get_json()
    _LOGGER.debug(f"Received data for update_manual_liability {liability_id}: {data}")

    errors = {}
    required_fields = ['type', 'value']
    for field in required_fields:
        if not data.get(field): errors[field] = f"{field.replace('_', ' ').capitalize()} is required."
    if 'value' in data and data.get('value') is not None:
        try:
            if float(data['value']) < 0: errors['value'] = "Value should typically be non-negative."
        except (ValueError, TypeError): errors['value'] = "must be a valid number."
    liability_types = data_manager.get_liability_types()
    banks_dict = data_manager.get_banks()
    if data.get('type') and data['type'] not in liability_types: errors['type'] = "Invalid liability type."
    if data.get('bank') and data['bank'] not in banks_dict: errors['bank'] = "Invalid bank name."
    if 'interest_rate' in data and data.get('interest_rate') is not None:
        try:
            if float(data['interest_rate']) < 0: errors['interest_rate'] = "cannot be negative."
        except (ValueError, TypeError): errors['interest_rate'] = "must be a valid number."
    # TODO: Validate start_date format

    if errors:
        _LOGGER.error(f"Validation errors for update_manual_liability {liability_id}: {errors}")
        return jsonify({"error": "Validation failed", "details": errors}), 400

    try:
        update_data = {
            "type": data['type'], "value": float(data['value']),
            "bank": data.get('bank'),
            "interest_rate": float(data['interest_rate']) if data.get('interest_rate') is not None else None,
            "start_date": data.get('start_date'), "notes": data.get('notes')
        }
        success, message = data_manager.update_manual_liability(liability_id, update_data)
        if success:
            updated_liability = data_manager.get_manual_only_liabilities().get(liability_id)
            if updated_liability:
                 _LOGGER.info(f"Successfully updated manual liability with ID: {liability_id}")
                 return jsonify(updated_liability), 200
            else:
                 _LOGGER.error(f"Could not retrieve updated manual liability {liability_id} after successful update.")
                 return jsonify({"error": "Update succeeded but failed to retrieve updated data."}), 500
        else:
            status_code = 404 if "not found" in message.lower() else 400
            _LOGGER.error(f"Data manager failed to update manual liability {liability_id}: {message}")
            return jsonify({"error": message}), status_code
    except Exception as e:
        _LOGGER.exception(f"Error processing update_manual_liability request for ID {liability_id}: {e}")
        return jsonify({"error": "An internal error occurred."}), 500

@api_bp.route('/liabilities/<liability_id>', methods=['DELETE'])
@supervisor_token_required
def delete_manual_liability_route(liability_id):
    try:
        success, message = data_manager.delete_manual_liability(liability_id)
        if success:
            _LOGGER.info(f"Successfully deleted manual liability with ID: {liability_id}")
            return jsonify({"success": True}), 200
        else:
            status_code = 404 if "not found" in message.lower() else 400
            _LOGGER.warning(f"Failed to delete manual liability {liability_id}: {message}")
            return jsonify({"error": message}), status_code
    except Exception as e:
        _LOGGER.exception(f"Error processing delete_manual_liability request for ID {liability_id}: {e}")
        return jsonify({"error": "An internal error occurred."}), 500

@api_bp.route('/liabilities', methods=['POST'])
@supervisor_token_required
def add_manual_liability_route():
    if not request.is_json: return jsonify({"error": "Request must be JSON"}), 400
    data = request.get_json()
    _LOGGER.debug(f"Received data for add_manual_liability: {data}")

    errors = {}
    required_fields = ['type', 'value']
    for field in required_fields:
        if not data.get(field): errors[field] = f"{field.replace('_', ' ').capitalize()} is required."
    if 'value' in data and data.get('value') is not None:
        try:
            if float(data['value']) < 0: errors['value'] = "Value should be entered as a positive number."
        except (ValueError, TypeError): errors['value'] = "must be a valid number."
    liability_types = data_manager.get_liability_types()
    banks_dict = data_manager.get_banks()
    if data.get('type') and data['type'] not in liability_types: errors['type'] = "Invalid liability type."
    if data.get('bank') and data['bank'] not in banks_dict: errors['bank'] = "Invalid bank name."
    if 'interest_rate' in data and data.get('interest_rate') is not None:
        try:
            if float(data['interest_rate']) < 0: errors['interest_rate'] = "cannot be negative."
        except (ValueError, TypeError): errors['interest_rate'] = "must be a valid number."
    # TODO: Validate start_date format

    if errors:
        _LOGGER.error(f"Validation errors for add_manual_liability: {errors}")
        return jsonify({"error": "Validation failed", "details": errors}), 400

    try:
        add_data = {
            "name": data.get('name'), "type": data['type'], "value": float(data['value']),
            "bank": data.get('bank'),
            "interest_rate": float(data['interest_rate']) if data.get('interest_rate') is not None else None,
            "start_date": data.get('start_date'), "notes": data.get('notes')
        }
        success, message, new_liability = data_manager.add_manual_liability(add_data)
        if success:
            _LOGGER.info(f"Successfully added manual liability with ID: {new_liability['id']}")
            return jsonify(new_liability), 201
        else:
            _LOGGER.error(f"Data manager failed to add manual liability: {message}. Data: {add_data}")
            return jsonify({"error": message}), 500
    except Exception as e:
        _LOGGER.exception(f"Error processing add_manual_liability request: {e}")
        return jsonify({"error": "An internal error occurred."}), 500

# --- CRUD Endpoints for Managed Categories ---

@api_bp.route('/managed_categories', methods=['GET'])
@supervisor_token_required
def get_managed_categories_api():
    """Get all manually managed categories."""
    try:
        categories = data_manager.get_managed_categories()
        # Optional: Sort or structure data if needed before returning
        return jsonify(categories), 200
    except Exception as e:
        _LOGGER.error(f"Error fetching managed categories: {e}", exc_info=True)
        return jsonify({"error": f"Error fetching managed categories: {e}"}), 500

@api_bp.route('/managed_categories', methods=['POST'])
@supervisor_token_required
def add_managed_category():
    """Add a new managed category."""
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400
    data = request.get_json()
    name = data.get('name')
    group_name = data.get('group_name') # Optional group name

    if not name:
        return jsonify({"error": "Category name is required"}), 400

    try:
        categories = data_manager.get_managed_categories()
        # Check for duplicates (case-insensitive within the same group?)
        if any(c.get('name', '').lower() == name.lower() and c.get('group_name') == group_name for c in categories):
            return jsonify({"error": f"Category '{name}' already exists" + (f" in group '{group_name}'" if group_name else "")}), 409 # Conflict

        new_category = {
            "id": str(uuid.uuid4()), # Generate unique ID
            "name": name,
            "group_name": group_name or "Uncategorized" # Default group if none provided
            # Add other fields if needed in the future
        }
        categories.append(new_category)

        if data_manager.save_managed_categories(categories):
            return jsonify({"success": True, "categories": categories}), 201 # Return the full updated list in the expected format
        else:
            return jsonify({"error": "Failed to save category"}), 500
    except Exception as e:
        _LOGGER.error(f"Error adding managed category: {e}", exc_info=True)
        return jsonify({"error": f"Error adding managed category: {e}"}), 500

@api_bp.route('/managed_categories/<category_id>', methods=['PUT'])
@supervisor_token_required
def update_managed_category(category_id):
    """Update an existing managed category."""
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400
    data = request.get_json()
    new_name = data.get('name')
    new_group_name = data.get('group_name')

    if not new_name: # Allow updating group name without changing name? Yes.
        return jsonify({"error": "Category name is required for update"}), 400

    try:
        categories = data_manager.get_managed_categories()
        category_found = False
        updated_categories = []
        updated_category = None

        for category in categories:
            if category.get('id') == category_id:
                # Check for potential duplicates with the new name/group
                if any(c.get('id') != category_id and c.get('name', '').lower() == new_name.lower() and c.get('group_name') == new_group_name for c in categories):
                     return jsonify({"error": f"Another category with name '{new_name}' already exists" + (f" in group '{new_group_name}'" if new_group_name else "")}), 409

                category['name'] = new_name
                if 'group_name' in data: # Allow setting group name, even to None/empty
                    category['group_name'] = new_group_name
                updated_category = category # Store the updated one
                updated_categories.append(category)
                category_found = True
            else:
                updated_categories.append(category)

        if not category_found:
            return jsonify({"error": "Category not found"}), 404

        if data_manager.save_managed_categories(updated_categories):
            return jsonify(updated_category), 200 # OK
        else:
            return jsonify({"error": "Failed to save updated category"}), 500
    except Exception as e:
        _LOGGER.error(f"Error updating managed category {category_id}: {e}", exc_info=True)
        return jsonify({"error": f"Error updating managed category: {e}"}), 500

@api_bp.route('/managed_categories/<category_id>', methods=['DELETE'])
@supervisor_token_required
def delete_managed_category(category_id):
    """Delete a managed category."""
    try:
        categories = data_manager.get_managed_categories()
        original_length = len(categories)
        # TODO: Check if category is used in any credit card reward rules before deleting?
        # This would require loading card details, which might be slow. Add later if needed.
        categories = [c for c in categories if c.get('id') != category_id]

        if len(categories) == original_length:
            return jsonify({"error": "Category not found"}), 404

        if data_manager.save_managed_categories(categories):
            return jsonify({"message": "Category deleted successfully"}), 200 # OK
        else:
            return jsonify({"error": "Failed to save categories after deletion"}), 500
    except Exception as e:
        _LOGGER.error(f"Error deleting managed category {category_id}: {e}", exc_info=True)
        return jsonify({"error": f"Error deleting managed category: {e}"}), 500


# --- CRUD Endpoints for Managed Payees ---

@api_bp.route('/managed_payees', methods=['GET'])
@supervisor_token_required
def get_managed_payees_api():
    """Get all manually managed payees."""
    try:
        payees = data_manager.get_managed_payees()
        # Optional: Sort payees alphabetically by name
        payees.sort(key=lambda p: p.get('name', '').lower())
        return jsonify(payees), 200
    except Exception as e:
        _LOGGER.error(f"Error fetching managed payees: {e}", exc_info=True)
        return jsonify({"error": f"Error fetching managed payees: {e}"}), 500

@api_bp.route('/managed_payees', methods=['POST'])
@supervisor_token_required
def add_managed_payee():
    """Add a new managed payee."""
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400
    data = request.get_json()
    name = data.get('name')

    if not name:
        return jsonify({"error": "Payee name is required"}), 400

    try:
        payees = data_manager.get_managed_payees()
        # Check for duplicates (case-insensitive?)
        if any(p.get('name', '').lower() == name.lower() for p in payees):
            return jsonify({"error": f"Payee '{name}' already exists"}), 409 # Conflict

        new_payee = {
            "id": str(uuid.uuid4()), # Generate unique ID
            "name": name
            # Add other fields if needed in the future (e.g., default category?)
        }
        payees.append(new_payee)

        if data_manager.save_managed_payees(payees):
            return jsonify({"success": True, "payees": payees}), 201 # Return the full updated list in the expected format
        else:
            return jsonify({"error": "Failed to save payee"}), 500
    except Exception as e:
        _LOGGER.error(f"Error adding managed payee: {e}", exc_info=True)
        return jsonify({"error": f"Error adding managed payee: {e}"}), 500

@api_bp.route('/managed_payees/<payee_id>', methods=['PUT'])
@supervisor_token_required
def update_managed_payee(payee_id):
    """Update an existing managed payee."""
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400
    data = request.get_json()
    new_name = data.get('name')

    if not new_name:
        return jsonify({"error": "Payee name is required for update"}), 400

    try:
        payees = data_manager.get_managed_payees()
        payee_found = False
        updated_payees = []
        updated_payee = None

        for payee in payees:
            if payee.get('id') == payee_id:
                 # Check for potential duplicates with the new name
                 if any(p.get('id') != payee_id and p.get('name', '').lower() == new_name.lower() for p in payees):
                     return jsonify({"error": f"Another payee with name '{new_name}' already exists"}), 409

                 payee['name'] = new_name
                 updated_payee = payee
                 updated_payees.append(payee)
                 payee_found = True
            else:
                updated_payees.append(payee)

        if not payee_found:
            return jsonify({"error": "Payee not found"}), 404

        if data_manager.save_managed_payees(updated_payees):
            return jsonify(updated_payee), 200 # OK
        else:
            return jsonify({"error": "Failed to save updated payee"}), 500
    except Exception as e:
        _LOGGER.error(f"Error updating managed payee {payee_id}: {e}", exc_info=True)
        return jsonify({"error": f"Error updating managed payee: {e}"}), 500

@api_bp.route('/managed_payees/<payee_id>', methods=['DELETE'])
@supervisor_token_required
def delete_managed_payee(payee_id):
    """Delete a managed payee."""
    try:
        payees = data_manager.get_managed_payees()
        original_length = len(payees)
        # TODO: Check if payee is used in any credit card reward rules before deleting?
        payees = [p for p in payees if p.get('id') != payee_id]

        if len(payees) == original_length:
            return jsonify({"error": "Payee not found"}), 404

        if data_manager.save_managed_payees(payees):
            return jsonify({"message": "Payee deleted successfully"}), 200 # OK
        else:
            return jsonify({"error": "Failed to save payees after deletion"}), 500
    except Exception as e:
        _LOGGER.error(f"Error deleting managed payee {payee_id}: {e}", exc_info=True)
        return jsonify({"error": f"Error deleting managed payee: {e}"}), 500

# --- Points Programs Management ---
@api_bp.route('/points_programs', methods=['GET'])
@supervisor_token_required
def get_points_programs():
    try:
        programs = data_manager.get_points_programs()
        return jsonify(programs), 200
    except Exception as e:
        _LOGGER.error(f"Error fetching points programs: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@api_bp.route('/points_programs', methods=['POST'])
@supervisor_token_required
def add_points_program():
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    name = data.get('name')

    if not name or not isinstance(name, str) or not name.strip():
        return jsonify({"error": "Name is required and must be a non-empty string"}), 400

    try:
        name = name.strip()
        result = data_manager.add_points_program(name)
        if result.get('error'):
            return jsonify({"error": result['error']}), 409

        programs = data_manager.get_points_programs()
        return jsonify({"success": True, "programs": programs}), 201
    except Exception as e:
        _LOGGER.error(f"Error adding points program: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@api_bp.route('/points_programs', methods=['PUT'])
@supervisor_token_required
def update_points_program():
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    original_name = data.get('originalName')
    new_name = data.get('newName')

    if not original_name or not new_name or not isinstance(original_name, str) or not isinstance(new_name, str):
        return jsonify({"error": "Original name and new name are required and must be strings"}), 400

    if not original_name.strip() or not new_name.strip():
        return jsonify({"error": "Names cannot be empty"}), 400

    try:
        original_name = original_name.strip()
        new_name = new_name.strip()

        result = data_manager.update_points_program(original_name, new_name)
        if result.get('error'):
            return jsonify({"error": result['error']}), 409

        programs = data_manager.get_points_programs()
        return jsonify({"success": True, "programs": programs}), 200
    except Exception as e:
        _LOGGER.error(f"Error updating points program: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@api_bp.route('/points_programs', methods=['DELETE'])
@supervisor_token_required
def delete_points_program():
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    program_id = data.get('id') # Get ID from request

    if not program_id or not isinstance(program_id, str) or not program_id.strip(): # Validate ID
        return jsonify({"error": "Points Program ID is required and must be a non-empty string"}), 400

    try:
        program_id = program_id.strip()
        result = data_manager.delete_points_program(program_id) # Pass ID to data_manager
        # Check if DataManager returned an error (e.g., not found, in use)
        if result.get('error'):
            error_message = result['error']
            _LOGGER.warning(f"Delete points program with ID {program_id} failed: {error_message}") # Log with ID
            status_code = 404 if 'not found' in error_message.lower() else 409 # 409 Conflict if in use
            return jsonify({"error": error_message, "success": False}), status_code

        # Success case
        programs = data_manager.get_points_programs()
        return jsonify({"success": True, "programs": programs}), 200
    except Exception as e:
        _LOGGER.error(f"Error deleting points program with ID {program_id}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

# --- Rewards Category Management ---
@api_bp.route('/rewards_categories', methods=['GET'])
@supervisor_token_required
def get_rewards_categories():
    try:
        categories = data_manager.get_rewards_categories()
        return jsonify(categories), 200
    except Exception as e:
        _LOGGER.error(f"Error fetching rewards categories: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@api_bp.route('/rewards_categories', methods=['POST'])
@supervisor_token_required
def add_rewards_category():
    data = request.json
    if not data or 'name' not in data:
        return jsonify({"error": "Missing 'name' in request data"}), 400
    name = data.get('name')
    parent_id = data.get('parent_id') # Optional

    result = data_manager.add_rewards_category(name, parent_id)
    if result.get("success"):
        return jsonify(result.get("categories", [])), 201 # Return updated list on success
    else:
        return jsonify({"error": result.get("error", "Failed to add rewards category")}), 400

@api_bp.route('/rewards_categories/<category_id>', methods=['PUT']) # Use category_id from path
@supervisor_token_required
def update_rewards_category(category_id): # Get category_id from path
    data = request.json
    if not data:
        return jsonify({"error": "Missing request data"}), 400

    # New name and parent_id are optional in the body
    new_name = data.get('name') # Can be None if only changing parent
    new_parent_id = data.get('parent_id') # Can be None (no change) or a string UUID or null?
    # We need to differentiate between not providing parent_id (no change) and providing parent_id=null (set to root)
    # Let's assume if 'parent_id' key exists in payload, it's an intentional change request.
    parent_id_change_requested = 'parent_id' in data

    # Pass None for new_parent_id if key wasn't present, otherwise pass the value (could be null)
    parent_id_to_pass = new_parent_id if parent_id_change_requested else None

    # Validation in DataManager now handles None name if only parent changes
    # if not new_name and not parent_id_change_requested:
    #     return jsonify({"error": "Must provide 'name' and/or 'parent_id' to update"}), 400

    result = data_manager.update_rewards_category(category_id, new_name, parent_id_to_pass)
    if result.get("success"):
        return jsonify(result.get("categories", [])), 200 # Return updated list
    else:
        # Check for specific errors like 'not found'
        error_msg = result.get("error", "Failed to update rewards category")
        status_code = 404 if "not found" in error_msg.lower() else 400
        return jsonify({"error": error_msg}), status_code

@api_bp.route('/rewards_categories/<category_id>', methods=['DELETE']) # Use category_id from path
@supervisor_token_required
def delete_rewards_category(category_id): # Get category_id from path
    result = data_manager.delete_rewards_category(category_id)
    if result.get("success"):
        return jsonify(result.get("categories", [])), 200 # Return updated list
    else:
        # Check for specific errors like 'not found' or 'has children'
        error_msg = result.get("error", "Failed to delete rewards category")
        status_code = 400
        if "not found" in error_msg.lower():
            status_code = 404
        elif "has child" in error_msg.lower():
             status_code = 409 # Conflict - cannot delete parent
        return jsonify({"error": error_msg}), status_code

# --- Rewards Payee Management ---
@api_bp.route('/rewards_payees', methods=['GET'])
@supervisor_token_required
def get_rewards_payees():
    try:
        payees = data_manager.get_rewards_payees()
        return jsonify(payees), 200
    except Exception as e:
        _LOGGER.error(f"Error fetching rewards payees: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@api_bp.route('/rewards_payees', methods=['POST'])
@supervisor_token_required
def add_rewards_payee():
    data = request.json
    if not data or 'name' not in data:
        return jsonify({"error": "Missing 'name' in request data"}), 400
    name = data.get('name')
    parent_id = data.get('parent_id') # Optional

    result = data_manager.add_rewards_payee(name, parent_id)
    if result.get("success"):
        return jsonify(result.get("payees", [])), 201 # Return updated list on success
    else:
        return jsonify({"error": result.get("error", "Failed to add rewards payee")}), 400

@api_bp.route('/rewards_payees/<payee_id>', methods=['PUT']) # Use payee_id from path
@supervisor_token_required
def update_rewards_payee(payee_id): # Get payee_id from path
    data = request.json
    if not data:
        return jsonify({"error": "Missing request data"}), 400

    new_name = data.get('name')
    new_parent_id = data.get('parent_id')
    parent_id_change_requested = 'parent_id' in data
    parent_id_to_pass = new_parent_id if parent_id_change_requested else None

    # if not new_name and not parent_id_change_requested:
    #     return jsonify({"error": "Must provide 'name' and/or 'parent_id' to update"}), 400

    result = data_manager.update_rewards_payee(payee_id, new_name, parent_id_to_pass)
    if result.get("success"):
        return jsonify(result.get("payees", [])), 200 # Return updated list
    else:
        error_msg = result.get("error", "Failed to update rewards payee")
        status_code = 404 if "not found" in error_msg.lower() else 400
        return jsonify({"error": error_msg}), status_code

@api_bp.route('/rewards_payees/<payee_id>', methods=['DELETE']) # Use payee_id from path
@supervisor_token_required
def delete_rewards_payee(payee_id): # Get payee_id from path
    result = data_manager.delete_rewards_payee(payee_id)
    if result.get("success"):
        return jsonify(result.get("payees", [])), 200 # Return updated list
    else:
        error_msg = result.get("error", "Failed to delete rewards payee")
        status_code = 400
        if "not found" in error_msg.lower():
            status_code = 404
        elif "has child" in error_msg.lower():
             status_code = 409 # Conflict
        return jsonify({"error": error_msg}), status_code

# --- Rewards Optimization ---
@api_bp.route('/optimize_rewards', methods=['POST'])
@supervisor_token_required # Apply authentication decorator
def optimize_rewards_api(): # Remove async keyword
    """API endpoint to find the best credit card for a given transaction context."""
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    _LOGGER.info(f"[/optimize_rewards] Received payload: {data}") # Log received payload

    category_id = data.get('category_id')
    payee_id = data.get('payee_id')
    payment_method_id = data.get('payment_method_id') # Get payment method ID
    amount_milliunits = data.get('amount_milliunits', 0)

    # Optional: Basic validation for amount?
    try:
        amount_milliunits = int(amount_milliunits)
        if amount_milliunits < 0:
             raise ValueError("Amount cannot be negative")
    except (TypeError, ValueError):
         return jsonify({"error": "Invalid amount_milliunits"}), 400

    try:
        # Call the DataManager method (no await)
        results = data_manager.find_best_card_for_transaction(
            category_id=category_id,
            payee_id=payee_id,
            payment_method_id=payment_method_id, # Pass it here
            amount_milliunits=amount_milliunits
        )
        return jsonify(results), 200
    except Exception as e:
        _LOGGER.error(f"Error during reward optimization: {e}", exc_info=True)
        return jsonify({"error": f"Internal server error during optimization: {str(e)}"}), 500

# New endpoint for best overall scenarios
@api_bp.route('/rewards/best_scenarios', methods=['GET'])
@supervisor_token_required
def get_best_scenarios_api():
    """API endpoint to get the best possible reward scenarios across all cards."""
    try:
        scenarios = data_manager.get_best_overall_reward_scenarios()
        return jsonify(scenarios), 200
    except Exception as e:
        _LOGGER.error(f"Error fetching best reward scenarios: {e}", exc_info=True)
        return jsonify({"error": f"Internal server error getting scenarios: {str(e)}"}), 500

# --- New Endpoint for Adjustment Transactions ---
@api_bp.route('/create_adjustment_transaction', methods=['POST'])
@supervisor_token_required
def create_adjustment_transaction():
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    account_id = data.get('account_id')
    amount = data.get('amount') # Expected in milliunits

    if not account_id or amount is None: # Allow amount to be 0
        return jsonify({"error": "Missing required fields: account_id, amount"}), 400

    try:
        amount_int = int(amount)
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid amount format. Must be an integer (milliunits)."}), 400

    # Construct transaction payload for YNAB API
    # transaction_data = { ... } # REMOVED - We will build the object directly

    try:
        _LOGGER.info(f"Attempting to create YNAB adjustment transaction for account {account_id} with amount {amount_int}") # Log amount too
        if not ynab_client or not ynab_client.is_configured():
             _LOGGER.error("YNAB client not available or configured for adjustment.")
             return jsonify({"error": "YNAB client not configured"}), 500

        # Use the ynab_client instance from the app context
        # REMOVED manual object creation
        # from ynab_api.model.save_transaction_wrapper import SaveTransactionWrapper
        # from ynab_api.model.save_transaction import SaveTransaction # Import SaveTransaction

        # # 1. Create the SaveTransaction object directly
        # save_transaction = SaveTransaction(
        #     account_id=account_id,
        #     date=datetime.now().date(), # Use date object
        #     amount=amount_int,
        #     payee_name="Market Adjustment", # Consistent payee name
        #     cleared="cleared",
        #     approved=True,
        #     memo=f"Automatic adjustment from HA reconciliation {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        #     # Optional fields like payee_id, category_id can be added if needed
        # )
        # _LOGGER.debug(f"Prepared SaveTransaction object: {save_transaction}")

        # # 2. Create the wrapper using the SaveTransaction object
        # save_transaction_wrapper = SaveTransactionWrapper(transaction=save_transaction)
        # _LOGGER.debug(f"Prepared SaveTransactionWrapper: {save_transaction_wrapper}")

        try:
            # 3. Call ynab_client.create_transaction with individual arguments
            response_data = ynab_client.create_transaction(
                account_id=account_id,
                date=datetime.now().date(),
                amount=amount_int,
                payee_name="Market Adjustment",
                memo=f"Automatic adjustment from HA reconciliation {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                cleared="cleared",
                approved=True
            )
            _LOGGER.info(f"YNAB API Response Data: {response_data}") # Log the response data directly
            # Check response structure and content (response_data is the 'data' part of the API response)
            if response_data and hasattr(response_data, 'transaction'):
                 _LOGGER.info(f"Successfully created transaction ID: {response_data.transaction.id}")
                 return jsonify({"message": "Adjustment transaction created successfully", "transaction_id": response_data.transaction.id}), 201
            elif response_data and hasattr(response_data, 'transactions'): # Handle bulk response just in case
                 _LOGGER.info(f"Successfully created transactions (bulk?): {[t.id for t in response_data.transactions]}")
                 return jsonify({"message": "Adjustment transactions created successfully", "transaction_ids": [t.id for t in response_data.transactions]}), 201
            else:
                _LOGGER.warning(f"YNAB API response structure unknown or missing transaction data: {response_data}")
                return jsonify({"message": "Adjustment transaction possibly created, but response format unexpected."}), 200 # Or 202 Accepted

        except ApiException as e:
            _LOGGER.error(f"YNAB API Exception when creating transaction: {e}")
            _LOGGER.error(f"Exception Body: {e.body}")
            _LOGGER.error(f"Exception Headers: {e.headers}")
            return jsonify({"error": f"YNAB API error: {e.reason}", "details": str(e.body)}), e.status
        except Exception as e:
            _LOGGER.exception("Unexpected error creating YNAB transaction")
            return jsonify({"error": f"Internal server error: {str(e)}"}), 500

    except Exception as e:
        _LOGGER.exception("Error processing adjustment transaction request")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500
# --- End New Endpoint ---

# Register the API blueprint WITHOUT the /api prefix
# This seems necessary for ingress routing to work correctly with blueprints
# after removing all explicit @app.route ingress handlers.
app.register_blueprint(api_bp, url_prefix='/api') # RESTORED url_prefix='/api'

# --- Monkey Patch YNAB Account Type --- BEGIN
# (Restored from previous version)
try:
    original_allowed_values = getattr(YnabAccount, 'allowed_values', None)
    if original_allowed_values and ('type',) in original_allowed_values:
        type_values_dict = original_allowed_values[('type',)]
        new_type_values = dict(type_values_dict)
        added_types = []
        loan_types = {'STUDENTLOAN': 'studentLoan', 'AUTOLOAN': 'autoLoan', 'PERSONALLOAN': 'personalLoan'}
        for key, value in loan_types.items():
            if key not in new_type_values:
                new_type_values[key] = value
                added_types.append(value)
        if added_types:
            new_allowed_values = dict(original_allowed_values)
            new_allowed_values[('type',)] = new_type_values
            setattr(YnabAccount, 'allowed_values', new_allowed_values)
            _LOGGER.info(f"Successfully monkey-patched YnabAccount types: {added_types}.")
        else:
            _LOGGER.debug("YNAB Account types already include custom loan types.")
    else:
        _LOGGER.warning("Could not patch YnabAccount: ('type',) key not found in allowed_values.")
except Exception as patch_exc:
    _LOGGER.error(f"Error during YnabAccount monkey-patching: {patch_exc}", exc_info=True)
# --- Monkey Patch YNAB Account Type --- END

# --- Catch-all route for serving the frontend static files ---
@app.route('/', defaults={'path': ''}, methods=['GET']) # Add methods=['GET']
@app.route('/<path:path>', methods=['GET']) # Add methods=['GET']
def catch_all(path):
    """Serve the static files or the main index.html for client-side routing.

    Handles only GET requests.
    """
    # Log entry into catch_all specifically
    _LOGGER.debug(f"Catch-all route accessed with path: '{path}'")
    _LOGGER.debug(f"Request URL: {request.url}")
    _LOGGER.debug(f"Request path: {request.path}")
    _LOGGER.debug(f"Request base URL: {request.base_url}")
    _LOGGER.debug(f"Request endpoint: {request.endpoint}")
    _LOGGER.debug(f"Request method: {request.method}")
    _LOGGER.debug(f"Request args: {dict(request.args)}")
    _LOGGER.debug(f"Request is_xhr (AJAX): {request.is_xhr if hasattr(request, 'is_xhr') else 'Not available'}")
    _LOGGER.debug(f"Request headers: {dict(request.headers)}")

    # --- Simplified Static File Serving ---
    # Let Flask handle API routes first. If no API route matches,
    # this catch-all will serve static files or index.html.
    if not path or not os.path.exists(os.path.join(app.static_folder, path)) or os.path.isdir(os.path.join(app.static_folder, path)):
        # Serve index.html for client-side routing
        try:
            index_path = os.path.join(app.static_folder, 'index.html')
            if not os.path.exists(index_path):
                _LOGGER.error(f"index.html not found at {index_path}")
                return "index.html not found in static folder", 500

            # Get ingress path from headers
            ingress_path = request.headers.get('X-Ingress-Path', '')

            # If X-Ingress-Path is present, inject a script setting window.ingressPath
            if ingress_path:
                _LOGGER.debug(f"Found X-Ingress-Path in headers: {ingress_path}. Injecting script into index.html.")
                try:
                    with open(index_path, 'r') as f:
                        content = f.read()
                    # Inject script tag at the VERY beginning of <head> with a log statement
                    script_tag = f'<script>window.ingressPath = "{ingress_path}"; console.log("🚨 INGRESS PATH SET:", window.ingressPath);</script>\n'
                    content = content.replace('<head>', f'<head>\n{script_tag}')
                    return content
                except Exception as e:
                    _LOGGER.exception(f"Error injecting ingress path script: {e}")
                    # Fall through to serving unmodified index.html on error
                    return send_from_directory(app.static_folder, 'index.html')
            else:
                # If no ingress path, serve index.html normally
                _LOGGER.debug("Serving index.html (no ingress path found)")
                return send_from_directory(app.static_folder, 'index.html')
        except Exception as e:
            _LOGGER.exception(f"Error serving index.html: {e}")
            return f"Error serving frontend: {str(e)}", 500
    else:
        # Otherwise, serve the requested static file directly
        _LOGGER.debug(f"Serving static file: {path}")
        return send_from_directory(app.static_folder, path)

# --- Emergency recovery routes ---
@app.route("/api/reset_credit_cards", methods=["POST"])
def direct_reset_credit_cards():
    """Emergency direct route to reset the credit cards file if it becomes corrupted."""
    _LOGGER.warning("Direct reset credit cards endpoint called - performing emergency reset")
    try:
        success = data_manager.reset_credit_cards()
        if success:
            return jsonify({"status": "success", "message": "Credit cards file has been reset to an empty array"}), 200
        else:
            return jsonify({"status": "error", "message": "Failed to reset credit cards file"}), 500
    except Exception as e:
        _LOGGER.exception(f"Error during direct credit cards reset: {e}")
        return jsonify({"status": "error", "message": f"Exception during reset: {str(e)}"}), 500


# --- Ingress redirect route for reset credit cards ---
@app.route('/api/hassio_ingress/<path:addon_id>/api/reset_credit_cards', methods=['POST'])
def direct_reset_credit_cards_ingress(addon_id):
    """Ingress route for emergency reset"""
    _LOGGER.warning(f"Ingress reset credit cards endpoint called - addon_id: {addon_id}")
    return direct_reset_credit_cards()

# --- Removed ASGI adapter logic ---

if __name__ == "__main__":
    # This block is for local development only (python backend/app.py)
    _LOGGER.info("Running Flask app in development mode...")
    app.run(host='0.0.0.0', port=5001, debug=True)
