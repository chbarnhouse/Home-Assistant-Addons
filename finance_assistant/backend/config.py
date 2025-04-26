import json
import os

CONFIG_PATH = "/data/options.json"

class Config:
    def __init__(self):
        self._config = self._load_config()

    def _load_config(self):
        # First try to load from file
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, 'r') as f:
                try:
                    return json.load(f)
                except json.JSONDecodeError:
                    print(f"Error decoding JSON from {CONFIG_PATH}")
                    return {}
        else:
            # If file not found, check environment variables
            print(f"Configuration file not found at {CONFIG_PATH}, checking environment variables")
            config_from_env = {}

            # Check for YNAB API key in environment
            ynab_api_key = os.environ.get('YNAB_API_KEY')
            if ynab_api_key:
                config_from_env['ynab_api_key'] = ynab_api_key
                print("Found YNAB API key in environment variables")

            # Check for YNAB budget ID in environment
            ynab_budget_id = os.environ.get('YNAB_BUDGET_ID')
            if ynab_budget_id:
                config_from_env['ynab_budget_id'] = ynab_budget_id
                print("Found YNAB budget ID in environment variables")

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