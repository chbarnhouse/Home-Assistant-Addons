import json
import os
import logging

CONFIG_PATH = "/data/options.json"
_LOGGER = logging.getLogger(__name__)

class Config:
    def __init__(self):
        self._config = self._load_config()

    def _load_config(self):
        # First try to load from file
        if os.path.exists(CONFIG_PATH):
            _LOGGER.info(f"Attempting to load configuration from {CONFIG_PATH}")
            try:
                with open(CONFIG_PATH, 'r') as f:
                    loaded_config = json.load(f)
                    _LOGGER.info(f"Successfully loaded config file. Content (keys only): {list(loaded_config.keys())}")
                    # Log if expected keys are missing
                    if 'ynab_api_key' not in loaded_config:
                         _LOGGER.warning(f"Key 'ynab_api_key' NOT found in {CONFIG_PATH}")
                    if 'ynab_budget_id' not in loaded_config:
                         _LOGGER.warning(f"Key 'ynab_budget_id' NOT found in {CONFIG_PATH}")
                    return loaded_config
            except json.JSONDecodeError as e:
                _LOGGER.error(f"Error decoding JSON from {CONFIG_PATH}: {e}")
                return {}
            except Exception as e:
                 _LOGGER.error(f"Error reading config file {CONFIG_PATH}: {e}")
                 return {}
        else:
            # If file not found, check environment variables
            _LOGGER.warning(f"Configuration file not found at {CONFIG_PATH}, checking environment variables")
            config_from_env = {}

            # Check for YNAB API key in environment
            ynab_api_key = os.environ.get('YNAB_API_KEY')
            if ynab_api_key:
                config_from_env['ynab_api_key'] = ynab_api_key
                _LOGGER.info("Found YNAB API key in environment variables")

            # Check for YNAB budget ID in environment
            ynab_budget_id = os.environ.get('YNAB_BUDGET_ID')
            if ynab_budget_id:
                config_from_env['ynab_budget_id'] = ynab_budget_id
                _LOGGER.info("Found YNAB budget ID in environment variables")

            # Log if keys were not found in env vars either
            if 'ynab_api_key' not in config_from_env:
                 _LOGGER.warning("Key 'YNAB_API_KEY' not found in environment variables")
            if 'ynab_budget_id' not in config_from_env:
                 _LOGGER.warning("Key 'YNAB_BUDGET_ID' not found in environment variables")

            return config_from_env

    @property
    def ynab_api_key(self):
        return self._config.get("ynab_api_key")

    @property
    def ynab_budget_id(self):
        return self._config.get("ynab_budget_id")

    def get_all_options(self):
        return self._config

# Global config instance
config = Config()