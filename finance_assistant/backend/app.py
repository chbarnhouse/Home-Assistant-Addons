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

from .config import config
from .ynab_client import YNABClient # Correct import: class YNABClient
from .data_manager import (
    DataManager,
    PAYMENT_METHODS_FILE # Re-add this import
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

# Fetch default types once at startup for mapping
try:
    DEFAULT_ASSET_TYPE_MAP = {t['name']: t['id'] for t in data_manager.get_asset_types()}
    DEFAULT_LIABILITY_TYPE_MAP = {t['name']: t['id'] for t in data_manager.get_liability_types()}
    _LOGGER.info(f"Loaded default asset type map: {DEFAULT_ASSET_TYPE_MAP}")
    _LOGGER.info(f"Loaded default liability type map: {DEFAULT_LIABILITY_TYPE_MAP}")
except Exception as e:
    _LOGGER.error(f"Failed to load default types for mapping: {e}")
    DEFAULT_ASSET_TYPE_MAP = {}
    DEFAULT_LIABILITY_TYPE_MAP = {}

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
# REMOVED url_prefix='/api' to simplify routing with ingress
api_bp = Blueprint('api', __name__) # No url_prefix

# --- Simple Ping Test Route (OUTSIDE Blueprint, for direct Supervisor check) ---
@app.route('/ping')
def ping_direct():
    _LOGGER.info("--- PING ENDPOINT HIT --- (via /ping - direct app route)")
    return jsonify({"message": "pong"})

# --- Simple Ping Test Route (on Blueprint, for general API use if needed) ---
@api_bp.route('/ping')
# @supervisor_token_required # REMOVED - Ping should not require auth
def ping():
    _LOGGER.info("--- PING ENDPOINT HIT --- (via /api/ping - blueprint route)") # Added specific logging
    # _LOGGER.info("Received request for /ping (no prefix)") # Updated log message
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

# Example route to test configuration loading (on Blueprint)
@api_bp.route('/config')
@supervisor_token_required
def get_config():
    return jsonify({
        "ynab_api_key_loaded": bool(config.ynab_api_key),
        "ynab_budget_id_loaded": bool(config.ynab_budget_id),
        "all_options": config.get_all_options() # Return all options for debugging
    })

# Helper function to apply allocation rules
def calculate_allocations(total_balance_milliunits, rules):
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
                value_milliunits = int(float(rule.get('value', 0)) * 1000)
                amount_to_allocate = min(value_milliunits, remaining_balance)
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

    # 2. Process Percentage Rules (on remaining balance after fixed)
    balance_after_fixed = remaining_balance
    for rule in rules:
        rule_id = rule.get('id')
        if rule_id == 'remaining' or rule_id in processed_rule_ids:
            continue
        if rule.get('type') == 'percentage':
            try:
                percentage = float(rule.get('value', 0))
                if 0 < percentage <= 100:
                    amount_to_allocate = int(balance_after_fixed * (percentage / 100))
                    amount_to_allocate = min(amount_to_allocate, remaining_balance)
                    status = rule.get('status')
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
        _LOGGER.error(f"YNAB API Value Error (likely invalid key/budget ID): {val_err}")
        return jsonify({"error": "YNAB API Configuration Error.", "details": str(val_err)}), 500
    except ynab_api.exceptions.ApiException as api_err:
        _LOGGER.error(f"YNAB API Exception: {api_err}")
        return jsonify({"error": "YNAB API communication error.", "details": str(api_err)}), 500
    except Exception as e:
        _LOGGER.exception("Unexpected error fetching accounts from YNAB")
        return jsonify({"error": "Unexpected error fetching YNAB accounts."}), 500

    # Fetch all manual data types
    manual_accounts = data_manager.get_manual_accounts()
    manual_assets = data_manager.get_manual_assets()
    manual_liabilities = data_manager.get_manual_liabilities()
    manual_only_liabilities = data_manager.get_manual_only_liabilities()
    manual_cards = data_manager.get_manual_credit_cards()

    # Fetch types for mapping (use the global maps loaded at startup for efficiency)
    asset_type_map = DEFAULT_ASSET_TYPE_MAP
    liability_type_map = DEFAULT_LIABILITY_TYPE_MAP
    _LOGGER.debug(f"Using startup asset type map: {asset_type_map}")
    _LOGGER.debug(f"Using startup liability type map: {liability_type_map}")


    # Define YNAB type to our default type name mappings
    # Ensure these names EXACTLY match the 'name' field in the default type objects
    YNAB_TO_ASSET_TYPE_NAME = {
        'investmentAccount': 'Stocks', # Assuming 'Stocks' is a default type name
        'otherAsset': 'Other Asset' # Add a generic default if needed
        # Add other YNAB asset types here (e.g., 'brokerageAccount')
    }
    YNAB_TO_LIABILITY_TYPE_NAME = {
        'mortgage': 'Mortgage',
        'studentLoan': 'Student Loan',
        'autoLoan': 'Auto Loan',
        'personalLoan': 'Personal Loan',
        'creditCard': 'Credit Card', # Even if handled separately later, map for potential use
        'otherLiability': 'Other Liability' # Add a generic default if needed
        # Add other YNAB liability types here (e.g., 'medicalDebt')
    }

    # --- Process YNAB Accounts (including assets/liabilities) ---
    processed_accounts = []
    processed_assets = []
    processed_liabilities = []
    processed_cards_from_ynab = {} # Store card details from YNAB here

    for ynab_account in ynab_accounts_raw:
        if not ynab_account.deleted and not ynab_account.closed:
            # --- Base YNAB Data ---
            ynab_data = ynab_account.to_dict()
            # Ensure balance is treated as an integer (milliunits)
            ynab_data['balance'] = int(ynab_account.balance) if ynab_account.balance is not None else 0
            ynab_data['cleared_balance'] = int(ynab_account.cleared_balance) if ynab_account.cleared_balance is not None else 0
            ynab_data['uncleared_balance'] = int(ynab_account.uncleared_balance) if ynab_account.uncleared_balance is not None else 0


            # --- Augment with Manual Data ---
            ynab_account_id = ynab_account.id
            manual_details = {}
            account_type = ynab_account.type

            if account_type in ['checking', 'savings', 'cash', 'lineOfCredit', 'otherCredit', 'payPal', 'merchantAccount']:
                manual_details = manual_accounts.get(ynab_account_id, {})
                final_data = {**ynab_data, **manual_details} # Merge manual data
                final_data.setdefault('id', ynab_account_id)
                final_data.setdefault('name', ynab_account.name)
                final_data['is_ynab'] = True
                final_data['ynab_type'] = account_type

                # Apply allocation rules if they exist
                allocation_rules = manual_details.get('allocation_rules', [])
                allocations = calculate_allocations(ynab_account.balance, allocation_rules)
                final_data['liquid_balance_milliunits'] = allocations['liquid_milliunits']
                final_data['frozen_balance_milliunits'] = allocations['frozen_milliunits']
                final_data['deep_freeze_balance_milliunits'] = allocations['deep_freeze_milliunits']
                processed_accounts.append(final_data)

            elif account_type in ['investmentAccount', 'otherAsset']:
                manual_details = manual_assets.get(ynab_account_id, {})
                final_data = {**ynab_data, **manual_details}
                final_data.setdefault('id', ynab_account_id)
                final_data.setdefault('name', ynab_account.name)
                final_data['is_ynab'] = True
                final_data['ynab_type'] = account_type

                # --- Assign default type if not manually set ---
                # Check if 'type' (old string format) or 'type_id' (new dict format) is missing
                if not final_data.get('type') and not final_data.get('type_id'):
                    default_type_name = YNAB_TO_ASSET_TYPE_NAME.get(account_type)
                    if default_type_name:
                        default_type_id = asset_type_map.get(default_type_name)
                        if default_type_id:
                            final_data['type_id'] = default_type_id # Set the type_id
                            _LOGGER.debug(f"Assigned default asset type '{default_type_name}' (ID: {default_type_id}) to YNAB asset '{final_data['name']}'")
                        else:
                            _LOGGER.warning(f"Default asset type name '{default_type_name}' found in map but corresponding ID not found in current types map: {asset_type_map}")
                    else:
                        _LOGGER.debug(f"No default asset type mapping for YNAB type '{account_type}'")
                # --- End Assign default type ---

                processed_assets.append(final_data)

            elif account_type in ['mortgage', 'studentLoan', 'autoLoan', 'personalLoan', 'otherLiability']:
                manual_details = manual_liabilities.get(ynab_account_id, {})
                final_data = {**ynab_data, **manual_details}
                final_data.setdefault('id', ynab_account_id)
                final_data.setdefault('name', ynab_account.name)
                final_data['is_ynab'] = True
                final_data['ynab_type'] = account_type

                # --- Assign default type if not manually set ---
                if not final_data.get('type') and not final_data.get('type_id'):
                    default_type_name = YNAB_TO_LIABILITY_TYPE_NAME.get(account_type)
                    if default_type_name:
                        default_type_id = liability_type_map.get(default_type_name)
                        if default_type_id:
                            final_data['type_id'] = default_type_id # Set the type_id
                            _LOGGER.debug(f"Assigned default liability type '{default_type_name}' (ID: {default_type_id}) to YNAB liability '{final_data['name']}'")
                        else:
                             _LOGGER.warning(f"Default liability type name '{default_type_name}' found in map but corresponding ID not found in current types map: {liability_type_map}")
                    else:
                         _LOGGER.debug(f"No default liability type mapping for YNAB type '{account_type}'")
                # --- End Assign default type ---


                processed_liabilities.append(final_data)

            elif account_type == 'creditCard':
                 # Store YNAB data for cards to merge later
                 processed_cards_from_ynab[ynab_account_id] = ynab_data

    # --- Process Manual-Only Liabilities ---
    manual_only_liabs_processed = []
    for liab_id, details in manual_only_liabilities.items():
        # Ensure basic structure and ID
        processed_detail = details.copy()
        processed_detail['id'] = liab_id
        processed_detail['is_ynab'] = False # Mark as not from YNAB
        processed_detail.setdefault('name', 'Unnamed Manual Liability')
        # Ensure balance fields exist
        processed_detail.setdefault('balance', 0)
        processed_detail.setdefault('cleared_balance', 0)
        processed_detail.setdefault('uncleared_balance', 0)
        manual_only_liabs_processed.append(processed_detail)

    # Combine YNAB-linked liabilities with manual-only liabilities
    all_liabilities = processed_liabilities + manual_only_liabs_processed


    # --- Process Credit Cards (Merge YNAB and Manual) ---
    final_cards = []
    processed_manual_card_ids = set()

    # Start with manually defined cards
    for manual_card in manual_cards:
        card_id = manual_card.get('id')
        if not card_id:
            _LOGGER.warning(f"Manual card missing ID, skipping: {manual_card.get('name', 'Unnamed')}")
            continue

        processed_manual_card_ids.add(card_id)
        ynab_card_data = processed_cards_from_ynab.get(card_id, {})

        # Merge: manual details take precedence over YNAB, except for balance fields maybe?
        # Decide on merge strategy: manual usually overrides, but YNAB has live balance.
        merged_card = {
            **ynab_card_data, # Start with YNAB data (includes balance)
            **manual_card,    # Override with manual details (name, bank, etc.)
            'id': card_id,    # Ensure ID is correct
            'is_ynab': card_id in processed_cards_from_ynab # Mark if it has a YNAB counterpart
        }
        # Ensure required fields exist
        merged_card.setdefault('name', 'Unnamed Card')
        merged_card.setdefault('balance', ynab_card_data.get('balance', 0)) # Default to YNAB balance
        merged_card.setdefault('cleared_balance', ynab_card_data.get('cleared_balance', 0))
        merged_card.setdefault('uncleared_balance', ynab_card_data.get('uncleared_balance', 0))

        final_cards.append(merged_card)

    # Add any YNAB cards that weren't in the manual list (should ideally be added manually)
    for ynab_card_id, ynab_card_data in processed_cards_from_ynab.items():
        if ynab_card_id not in processed_manual_card_ids:
            _LOGGER.warning(f"YNAB Credit Card '{ynab_card_data.get('name')}' (ID: {ynab_card_id}) exists but has no manual entry. Adding with YNAB data only.")
            card_data = {
                **ynab_card_data,
                'id': ynab_card_id,
                'is_ynab': True,
                # Add placeholders for required manual fields if necessary
                'bank': None,
                'last_4_digits': None,
                # etc.
            }
            final_cards.append(card_data)


    # --- Fetch other required data ---
    banks = data_manager.get_banks()
    account_types = data_manager.get_account_types()
    asset_types = data_manager.get_asset_types()
    liability_types = data_manager.get_liability_types()
    payment_methods = data_manager.get_payment_methods()
    points_programs = data_manager.get_points_programs()
    rewards_categories = data_manager.get_rewards_categories()
    rewards_payees = data_manager.get_rewards_payees()

    # --- Return combined data ---
    return jsonify({
        "accounts": processed_accounts,
        "assets": processed_assets,
        "liabilities": all_liabilities, # Use the combined list
        "credit_cards": final_cards, # Use the merged list
        "banks": banks,
        "account_types": account_types,
        "asset_types": asset_types,
        "liability_types": liability_types,
        "payment_methods": payment_methods,
        "points_programs": points_programs,
        "rewards_categories": rewards_categories,
        "rewards_payees": rewards_payees,
        "last_updated": datetime.now().isoformat()
    })

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
                allocations = calculate_allocations(acc_dict.get('balance', 0), allocation_rules)

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
    details = data_manager.get_manual_asset_details(ynab_account_id)
    return jsonify(details) if details is not None else jsonify({}) # Return empty if not found

@api_bp.route('/manual_asset/<ynab_account_id>', methods=['POST', 'PUT'])
@supervisor_token_required
def save_manual_asset(ynab_account_id):
    if not request.is_json: return jsonify({"error": "Request must be JSON"}), 400
    details = request.get_json()
    if data_manager.save_manual_asset_details(ynab_account_id, details):
        # TODO: If asset type is Stock and entity_id/shares provided, trigger YNAB update?
        return jsonify({"success": True, "details": details}), 200
    else:
        return jsonify({"error": "Failed to save"}), 500

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

# Register the API blueprint with the standard /api prefix
app.register_blueprint(api_bp, url_prefix='/api')


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
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    """
    Catch-all route handler for serving the frontend static files and handling ingress requests.
    """
    # Add detailed debugging for all requests
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

# --- Explicit Ingress Route for /all_data ---
@app.route('/api/hassio_ingress/<path:addon_id>/api/all_data')
@supervisor_token_required # Apply decorator here as well
def direct_ingress_all_data(addon_id):
    """Direct endpoint for accessing all_data through the ingress path"""
    _LOGGER.info(f"✅ DIRECT INGRESS HANDLER - /api/all_data called via ingress with addon_id: {addon_id}")
    # Call the original blueprint function
    # Find the view function associated with the blueprint endpoint 'api.get_all_data'
    view_func = app.view_functions.get('api.get_all_data')
    if view_func:
        return view_func()
    else:
        _LOGGER.error("Could not find view function for 'api.get_all_data' to handle ingress request")
        return jsonify({"error": "Internal routing error"}), 500

# --- Register direct endpoints for liabilities API ---
@app.route('/api/hassio_ingress/<path:addon_id>/api/liabilities', methods=['GET'])
def direct_get_liabilities(addon_id):
    """Direct endpoint for getting liabilities through the ingress path"""
    _LOGGER.info(f"🚨 DIRECT INGRESS HANDLER - liabilities GET called with addon_id: {addon_id}")
    response = get_all_data()
    try:
        data = response.get_json()
        return jsonify(data.get('liabilities', []))
    except:
        return response

@app.route('/api/hassio_ingress/<path:addon_id>/api/liabilities/<liability_id>', methods=['DELETE'])
def direct_delete_liability(addon_id, liability_id):
    """Direct endpoint for deleting a liability through the ingress path"""
    _LOGGER.info(f"🚨 DIRECT INGRESS HANDLER - liabilities DELETE called with addon_id: {addon_id}, liability_id: {liability_id}")
    return delete_manual_liability_route(liability_id)

# --- Register direct endpoints for assets API ---
@app.route('/api/hassio_ingress/<path:addon_id>/api/assets', methods=['GET'])
def direct_get_assets(addon_id):
    """Direct endpoint for getting assets through the ingress path"""
    _LOGGER.info(f"🚨 DIRECT INGRESS HANDLER - assets GET called with addon_id: {addon_id}")
    response = get_all_data()
    try:
        data = response.get_json()
        return jsonify(data.get('assets', []))
    except:
        return response

@app.route('/api/hassio_ingress/<path:addon_id>/api/assets/<asset_id>', methods=['DELETE'])
def direct_delete_asset(addon_id, asset_id):
    """Direct endpoint for deleting an asset through the ingress path"""
    _LOGGER.info(f"🚨 DIRECT INGRESS HANDLER - assets DELETE called with addon_id: {addon_id}, asset_id: {asset_id}")
    return delete_asset(asset_id)

# --- New credit card specific endpoints ---
@app.route('/api/cards/list')
def get_credit_cards():
    """Direct endpoint for getting all credit cards"""
    _LOGGER.info("Credit cards list endpoint called")
    try:
        if not ynab_client.is_configured():
            return jsonify({"error": "YNAB client not configured"}), 500

        # Get credit cards through the same process used in get_all_data
        ynab_accounts_raw = ynab_client.get_accounts() or []
        combined_credit_cards = []

        # Process only credit card accounts
        for acc in ynab_accounts_raw:
            if acc.deleted:
                continue
            acc_dict = acc.to_dict()
            ynab_id = acc_dict.get('id')
            if not ynab_id:
                continue

            acc_type = acc_dict.get('type')
            if acc_type == 'creditCard':
                manual_details = data_manager.get_manual_credit_card_details(ynab_id)
                combined = {
                    **acc_dict,
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
                    'rewards_rules': manual_details.get('rewards_rules', []),
                    'reward_program_details': manual_details.get('reward_program_details', {})
                }
                combined_credit_cards.append(combined)

        _LOGGER.debug(f"Returning {len(combined_credit_cards)} credit cards")
        return jsonify(combined_credit_cards)
    except Exception as e:
        _LOGGER.exception(f"Error fetching credit cards: {e}")
        return jsonify({"error": f"Error fetching credit cards: {str(e)}"}), 500

@app.route('/api/cards/<card_id>')
def get_credit_card(card_id):
    """Direct endpoint for getting a specific credit card"""
    _LOGGER.info(f"Credit card detail endpoint called for card {card_id}")
    try:
        if not ynab_client.is_configured():
            return jsonify({"error": "YNAB client not configured"}), 500

        # Get the specific credit card from YNAB
        ynab_accounts_raw = ynab_client.get_accounts() or []
        card_account = None

        # Find the specific credit card
        for acc in ynab_accounts_raw:
            if acc.deleted:
                continue

            acc_dict = acc.to_dict()
            ynab_id = acc_dict.get('id')

            if ynab_id == card_id and acc_dict.get('type') == 'creditCard':
                manual_details = data_manager.get_manual_credit_card_details(ynab_id)
                card_account = {
                    **acc_dict,
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
                    'rewards_rules': manual_details.get('rewards_rules', []),
                    'reward_program_details': manual_details.get('reward_program_details', {})
                }
                break

        if card_account:
            return jsonify(card_account)
        else:
            return jsonify({"error": f"Credit card with ID {card_id} not found"}), 404
    except Exception as e:
        _LOGGER.exception(f"Error fetching credit card {card_id}: {e}")
        return jsonify({"error": f"Error fetching credit card: {str(e)}"}), 500

# Special handler for direct API access from any path
@app.route('/all_data')
def api_all_data_direct():
    """Direct endpoint for all_data, accessible from any URL path"""
    _LOGGER.info("🚨 DIRECT ROOT HANDLER - all_data called")
    return get_all_data()

# Add these after imports but before any routes

# Add debug logging for all requests
@app.before_request
def log_request_info():
    """Log detailed information about every request for debugging."""
    _LOGGER.info(f"🔍 DEBUG REQUEST: Method={request.method} URL={request.url}")
    _LOGGER.info(f"🔍 DEBUG HEADERS: {dict(request.headers)}")
    _LOGGER.info(f"🔍 DEBUG PATH: {request.path}")
    _LOGGER.info(f"🔍 DEBUG ARGS: {request.args}")
    try:
        if request.is_json:
            _LOGGER.info(f"🔍 DEBUG JSON: {request.json}")
        elif request.form:
            _LOGGER.info(f"🔍 DEBUG FORM: {request.form}")
        elif request.data:
            _LOGGER.info(f"🔍 DEBUG DATA: {request.data[:200]}")  # First 200 bytes only
    except Exception as e:
        _LOGGER.info(f"🔍 Could not read request body: {e}")
    return None  # Continue with request

# Add this after the existing direct_save_manual_account_ingress handler

# Emergency catchall handler with direct file access approach
@app.route('/api/hassio_ingress/<path:addon_id>/api/manual_account/<path:account_path>', methods=['POST', 'PUT'])
def debug_save_account_ingress(addon_id, account_path):
    """Emergency catchall for debugging account save issues"""
    _LOGGER.info(f"🚨 EMERGENCY DEBUG - Hit catchall route for account path: {account_path}")
    _LOGGER.info(f"🚨 Addon ID: {addon_id}")
    _LOGGER.info(f"🚨 Request method: {request.method}")
    _LOGGER.info(f"🚨 Headers: {dict(request.headers)}")

    try:
        data = request.json if request.is_json else {}
        _LOGGER.info(f"🚨 Received payload: {data}")

        # SIMPLEST APPROACH: Just save directly without any validation or processing
        account_id = account_path
        _LOGGER.info(f"Using account_id: {account_id}")

        # Direct data save approach - avoid any complex data_manager calls
        import json
        accounts_file = os.path.join("/data", "manual_accounts.json")

        # Read existing accounts
        try:
            with open(accounts_file, 'r') as f:
                accounts = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            accounts = {}

        # If details are nested in a 'details' key, extract them
        if isinstance(data, dict) and 'details' in data and isinstance(data['details'], dict):
            details_to_save = data['details']
        else:
            details_to_save = data

        _LOGGER.info(f"Attempting to save: {details_to_save}")

        # Store the details directly
        accounts[account_id] = details_to_save

        # Direct write to file
        with open(accounts_file, 'w') as f:
            json.dump(accounts, f, indent=4)

        _LOGGER.info(f"✅ Successfully wrote data to file for account {account_id}")

        # Return a simple success
        return jsonify({"success": True}), 200

    except Exception as e:
        import traceback
        _LOGGER.error(f"💥 CRITICAL ERROR: {e}")
        _LOGGER.error(f"💥 Traceback: {traceback.format_exc()}")
        return jsonify(error=str(e)), 500

# Add this new emergency endpoint with a completely different URL pattern
@app.route('/api/hassio_ingress/<path:addon_id>/emergency_save_account', methods=['POST', 'PUT'])
def emergency_save_account(addon_id):
    """Last resort endpoint for saving account details"""
    _LOGGER.info(f"🆘 EMERGENCY SAVE ACCOUNT ENDPOINT HIT - addon_id: {addon_id}")
    _LOGGER.info(f"🆘 Request method: {request.method}")
    _LOGGER.info(f"🆘 Request URL: {request.url}")
    _LOGGER.info(f"🆘 Request headers: {dict(request.headers)}")

    try:
        # Get the data from the request
        if request.is_json:
            data = request.json
            _LOGGER.info(f"🆘 Request JSON data: {data}")
        else:
            _LOGGER.error("❌ Request is not JSON")
            return jsonify(error="Request must be JSON"), 400

        # Extract account_id and details from request body
        if not isinstance(data, dict):
            _LOGGER.error("❌ Invalid data format (not a dict)")
            return jsonify(error="Invalid data format"), 400

        if 'account_id' not in data:
            _LOGGER.error("❌ Missing account_id in request")
            return jsonify(error="Missing account_id"), 400

        account_id = data['account_id']
        _LOGGER.info(f"🆘 Account ID from request: {account_id}")

        # Direct file access with extremely simple approach
        import json
        accounts_file = "/data/manual_accounts.json"

        # Read the existing accounts file with error handling for common issues
        try:
            with open(accounts_file, 'r') as f:
                accounts = json.load(f)
                _LOGGER.info(f"🆘 Successfully read accounts file with {len(accounts)} accounts")
        except FileNotFoundError:
            _LOGGER.warning("⚠️ Accounts file not found, creating new one")
            accounts = {}
        except json.JSONDecodeError:
            _LOGGER.warning("⚠️ Accounts file exists but is not valid JSON, creating empty dict")
            accounts = {}

        # Extract the account details to save
        if 'details' in data and isinstance(data['details'], dict):
            details = data['details']
        else:
            # Just use the whole data object except account_id
            details = {k: v for k, v in data.items() if k != 'account_id'}

        _LOGGER.info(f"🆘 Details to save: {details}")

        # Update the account in the accounts dict
        accounts[account_id] = details
        _LOGGER.info(f"🆘 Updated accounts dict, now has {len(accounts)} accounts")

        # Save the updated accounts file
        try:
            with open(accounts_file, 'w') as f:
                json.dump(accounts, f, indent=2)
            _LOGGER.info(f"🆘 Successfully wrote accounts file")
        except Exception as e:
            _LOGGER.error(f"❌ Error writing accounts file: {e}")
            return jsonify(error=f"Error writing accounts file: {e}"), 500

        # Return a simple success response
        return jsonify(success=True, message=f"Account {account_id} saved successfully"), 200

    except Exception as e:
        import traceback
        _LOGGER.error(f"💥 Error in emergency save: {e}")
        _LOGGER.error(f"💥 Traceback: {traceback.format_exc()}")
        return jsonify(error=str(e)), 500

# Add this additional emergency endpoint with an even simpler URL pattern
@app.route('/api/hassio_ingress/<path:addon_id>/simple_save/<account_id>', methods=['POST', 'PUT', 'GET'])
def simple_save_account(addon_id, account_id):
    """Ultra simple endpoint for saving account details with account ID in the URL path"""
    _LOGGER.info(f"💾 SIMPLE SAVE ENDPOINT HIT - addon_id: {addon_id}, account_id: {account_id}")
    _LOGGER.info(f"💾 Request method: {request.method}")

    # Just save the request body directly with minimal processing
    try:
        import json
        accounts_file = "/data/manual_accounts.json"

        # Get data from request
        data = {}
        if request.is_json:
            data = request.json
            _LOGGER.info(f"💾 Got JSON data: {data}")
        elif request.form:
            data = {k: v for k, v in request.form.items()}
            _LOGGER.info(f"💾 Got form data: {data}")
        else:
            # If this is a GET request, just return success without saving
            if request.method == 'GET':
                _LOGGER.info("💾 GET request received, returning success without saving")
                return jsonify(success=True, message="GET request successful"), 200
            _LOGGER.warning("💾 No JSON or form data in request")

        # Read existing accounts file
        try:
            with open(accounts_file, 'r') as f:
                accounts = json.load(f)
                _LOGGER.info(f"💾 Read accounts file with {len(accounts)} accounts")
        except (FileNotFoundError, json.JSONDecodeError):
            accounts = {}
            _LOGGER.info("💾 Created new accounts dictionary")

        # Extract details if nested
        if isinstance(data, dict) and 'details' in data and isinstance(data['details'], dict):
            details = data['details']
            _LOGGER.info("💾 Extracted nested details")
        else:
            details = data
            _LOGGER.info("💾 Using full data object as details")

        # Update the account
        accounts[account_id] = details
        _LOGGER.info(f"💾 Updated account {account_id}")

        # Save to file
        with open(accounts_file, 'w') as f:
            json.dump(accounts, f, indent=2)
            _LOGGER.info("💾 Saved accounts file")

        return jsonify(success=True, message=f"Account {account_id} saved with simple_save"), 200

    except Exception as e:
        import traceback
        _LOGGER.error(f"💾 Error in simple save: {e}")
        _LOGGER.error(f"💾 Traceback: {traceback.format_exc()}")
        return jsonify(error=str(e)), 500

@app.route('/api/direct_form_submit', methods=['POST'])
def direct_form_submit():
    """A direct form submission endpoint that doesn't rely on complex routing"""
    _LOGGER.info("📝 DIRECT FORM SUBMIT ENDPOINT HIT")
    _LOGGER.info(f"📝 Request method: {request.method}")
    _LOGGER.info(f"📝 Request form data: {request.form}")

    try:
        # Extract account_id and payload from form data
        account_id = request.form.get('account_id')
        payload_str = request.form.get('payload')

        if not account_id:
            _LOGGER.error("📝 Missing account_id in form data")
            return "Missing account_id", 400

        if not payload_str:
            _LOGGER.error("📝 Missing payload in form data")
            return "Missing payload", 400

        _LOGGER.info(f"📝 Account ID: {account_id}")
        _LOGGER.info(f"📝 Payload JSON: {payload_str}")

        # Parse the payload JSON
        import json
        try:
            payload = json.loads(payload_str)
            _LOGGER.info(f"📝 Parsed payload: {payload}")
        except json.JSONDecodeError as e:
            _LOGGER.error(f"📝 Failed to parse payload JSON: {e}")
            return "Invalid payload JSON", 400

        # Save the account details
        accounts_file = "/data/manual_accounts.json"

        # Read existing accounts
        try:
            with open(accounts_file, 'r') as f:
                accounts = json.load(f)
                _LOGGER.info(f"📝 Read accounts file with {len(accounts)} accounts")
        except (FileNotFoundError, json.JSONDecodeError):
            accounts = {}
            _LOGGER.info("📝 Created new accounts dictionary")

        # Save the account details
        accounts[account_id] = payload
        _LOGGER.info(f"📝 Updated account {account_id}")

        # Write back to file
        with open(accounts_file, 'w') as f:
            json.dump(accounts, f, indent=2)
            _LOGGER.info("📝 Saved accounts file")

        # Return success with plain text to avoid any JSON parsing issues
        return "OK", 200

    except Exception as e:
        import traceback
        _LOGGER.error(f"📝 Error processing form submission: {e}")
        _LOGGER.error(traceback.format_exc())
        return f"Error: {str(e)}", 500

# Make sure to also register this route at the ingress path
@app.route('/api/hassio_ingress/<path:addon_id>/api/direct_form_submit', methods=['POST'])
def direct_form_submit_ingress(addon_id):
    """Ingress version of the direct form submission endpoint"""
    _LOGGER.info(f"📝 DIRECT FORM SUBMIT INGRESS ENDPOINT HIT - addon_id: {addon_id}")
    return direct_form_submit()

# Add the new route with exact pattern
@app.route("/api/hassio_ingress/<path:addon_id>/api/simple_save/<account_id>", methods=["POST", "PUT", "GET"])
def api_simple_save_account(addon_id, account_id):
    """API version of the ultra simple endpoint for saving account details with account ID in the URL path"""
    _LOGGER.info(f"🔄 API SIMPLE SAVE ENDPOINT HIT - addon_id: {addon_id}, account_id: {account_id}")
    _LOGGER.info(f"🔄 Request method: {request.method}")

    # Just save the request body directly with minimal processing
    try:
        import json
        accounts_file = "/data/manual_accounts.json"

        # Get data from request
        data = {}
        if request.is_json:
            data = request.json
            _LOGGER.info(f"🔄 Got JSON data: {data}")
        elif request.form:
            data = {k: v for k, v in request.form.items()}
            _LOGGER.info(f"🔄 Got form data: {data}")
        else:
            # If this is a GET request, let's check if the account exists and return it
            if request.method == 'GET':
                _LOGGER.info("🔄 GET request received, checking for account")
                try:
                    with open(accounts_file, 'r') as f:
                        accounts = json.load(f)
                        if account_id in accounts:
                            _LOGGER.info(f"🔄 Found account {account_id}, returning data")
                            return jsonify(accounts[account_id]), 200
                        else:
                            _LOGGER.info(f"🔄 Account {account_id} not found")
                            return jsonify({"error": "Account not found"}), 404
                except (FileNotFoundError, json.JSONDecodeError):
                    _LOGGER.info("🔄 No accounts file found for GET request")
                    return jsonify({"error": "No accounts file found"}), 404

            _LOGGER.warning("🔄 No JSON or form data in request")

        # Read existing accounts file
        try:
            with open(accounts_file, 'r') as f:
                accounts = json.load(f)
                _LOGGER.info(f"🔄 Read accounts file with {len(accounts)} accounts")
        except (FileNotFoundError, json.JSONDecodeError):
            accounts = {}
            _LOGGER.info("🔄 Created new accounts dictionary")

        # Extract details if nested
        if isinstance(data, dict) and 'details' in data and isinstance(data['details'], dict):
            details = data['details']
            _LOGGER.info("🔄 Extracted nested details")
        else:
            details = data
            _LOGGER.info("🔄 Using full data object as details")

        # Update the account
        accounts[account_id] = details
        _LOGGER.info(f"🔄 Updated account {account_id}")

        # Save to file
        with open(accounts_file, 'w') as f:
            json.dump(accounts, f, indent=2)
            _LOGGER.info("🔄 Saved accounts file")

        return jsonify(success=True, message=f"Account {account_id} saved with API simple_save"), 200

    except Exception as e:
        import traceback
        _LOGGER.error(f"🔄 Error in API simple save: {e}")
        _LOGGER.error(f"🔄 Traceback: {traceback.format_exc()}")
        return jsonify(error=str(e)), 500

@app.route('/api/hassio_ingress/<path:addon_id>/api/banks', methods=['GET'])
def direct_get_banks(addon_id):
    """Ingress endpoint for getting banks"""
    _LOGGER.info(f"Ingress GET /banks request received - addon_id: {addon_id}")
    return get_banks()

@app.route('/api/hassio_ingress/<path:addon_id>/api/banks', methods=['POST'])
def direct_add_bank(addon_id):
    """Ingress endpoint for adding a bank"""
    _LOGGER.info(f"Ingress POST /banks request received - addon_id: {addon_id}")
    return add_bank()

@app.route('/api/hassio_ingress/<path:addon_id>/api/banks', methods=['PUT'])
def direct_update_bank(addon_id):
    """Ingress endpoint for updating a bank"""
    _LOGGER.info(f"Ingress PUT /banks request received - addon_id: {addon_id}")
    return update_bank()

@app.route('/api/hassio_ingress/<path:addon_id>/api/banks', methods=['DELETE'])
def direct_delete_bank(addon_id):
    """Ingress endpoint for deleting a bank"""
    _LOGGER.info(f"Ingress DELETE /banks request received - addon_id: {addon_id}")
    return delete_bank()

@app.route('/api/hassio_ingress/<path:addon_id>/api/account_types', methods=['GET'])
def direct_get_account_types(addon_id):
    """Ingress endpoint for getting account types"""
    _LOGGER.info(f"Ingress GET /account_types request received - addon_id: {addon_id}")
    return get_account_types()

@app.route('/api/hassio_ingress/<path:addon_id>/api/account_types', methods=['POST'])
def direct_add_account_type(addon_id):
    """Ingress endpoint for adding an account type"""
    _LOGGER.info(f"Ingress POST /account_types request received - addon_id: {addon_id}")
    return add_account_type()

@app.route('/api/hassio_ingress/<path:addon_id>/api/account_types', methods=['PUT'])
def direct_update_account_type(addon_id):
    """Ingress endpoint for updating an account type"""
    _LOGGER.info(f"Ingress PUT /account_types request received - addon_id: {addon_id}")
    return update_account_type()

@app.route('/api/hassio_ingress/<path:addon_id>/api/account_types', methods=['DELETE'])
def direct_delete_account_type(addon_id):
    """Ingress endpoint for deleting an account type"""
    _LOGGER.info(f"Ingress DELETE /account_types request received - addon_id: {addon_id}")
    return delete_account_type()

# Add ingress routes for managed categories
@app.route('/api/hassio_ingress/<path:addon_id>/api/managed_categories', methods=['GET'])
def direct_get_managed_categories(addon_id):
    """Ingress endpoint for getting managed categories"""
    _LOGGER.info(f"Ingress GET /managed_categories request received - addon_id: {addon_id}")
    return get_managed_categories_api()

@app.route('/api/hassio_ingress/<path:addon_id>/api/managed_categories', methods=['POST'])
def direct_add_managed_category(addon_id):
    """Ingress endpoint for adding a managed category"""
    _LOGGER.info(f"Ingress POST /managed_categories request received - addon_id: {addon_id}")
    return add_managed_category()

@app.route('/api/hassio_ingress/<path:addon_id>/api/managed_categories/<category_id>', methods=['PUT'])
def direct_update_managed_category(addon_id, category_id):
    """Ingress endpoint for updating a managed category"""
    _LOGGER.info(f"Ingress PUT /managed_categories/{category_id} request received - addon_id: {addon_id}")
    return update_managed_category(category_id)

@app.route('/api/hassio_ingress/<path:addon_id>/api/managed_categories/<category_id>', methods=['DELETE'])
def direct_delete_managed_category(addon_id, category_id):
    """Ingress endpoint for deleting a managed category"""
    _LOGGER.info(f"Ingress DELETE /managed_categories/{category_id} request received - addon_id: {addon_id}")
    return delete_managed_category(category_id)

# Add ingress routes for managed payees
@app.route('/api/hassio_ingress/<path:addon_id>/api/managed_payees', methods=['GET'])
def direct_get_managed_payees(addon_id):
    """Ingress endpoint for getting managed payees"""
    _LOGGER.info(f"Ingress GET /managed_payees request received - addon_id: {addon_id}")
    return get_managed_payees_api()

@app.route('/api/hassio_ingress/<path:addon_id>/api/managed_payees', methods=['POST'])
def direct_add_managed_payee(addon_id):
    """Ingress endpoint for adding a managed payee"""
    _LOGGER.info(f"Ingress POST /managed_payees request received - addon_id: {addon_id}")
    return add_managed_payee()

@app.route('/api/hassio_ingress/<path:addon_id>/api/managed_payees/<payee_id>', methods=['PUT'])
def direct_update_managed_payee(addon_id, payee_id):
    """Ingress endpoint for updating a managed payee"""
    _LOGGER.info(f"Ingress PUT /managed_payees/{payee_id} request received - addon_id: {addon_id}")
    return update_managed_payee(payee_id)

@app.route('/api/hassio_ingress/<path:addon_id>/api/managed_payees/<payee_id>', methods=['DELETE'])
def direct_delete_managed_payee(addon_id, payee_id):
    """Ingress endpoint for deleting a managed payee"""
    _LOGGER.info(f"Ingress DELETE /managed_payees/{payee_id} request received - addon_id: {addon_id}")
    return delete_managed_payee(payee_id)

# Add ingress routes for payment methods
@app.route('/api/hassio_ingress/<path:addon_id>/api/payment_methods', methods=['GET', 'POST', 'DELETE', 'PUT'])
def direct_manage_payment_methods(addon_id):
    """Ingress endpoint for managing payment methods"""
    _LOGGER.info(f"Ingress {request.method} /payment_methods request received - addon_id: {addon_id}")
    try:
        return manage_payment_methods()
    except Exception as e:
        _LOGGER.exception(f"Error in payment methods ingress route: {e}")
        return jsonify({"error": str(e)}), 500

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
