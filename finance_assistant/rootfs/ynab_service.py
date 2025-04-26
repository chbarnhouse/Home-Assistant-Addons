import os
import requests
from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)

class YNABService:
    """Service for interacting with the YNAB API."""

    BASE_URL = "https://api.youneedabudget.com/v1"

    def __init__(self, api_key: Optional[str] = None, budget_id: Optional[str] = None):
        """Initialize the YNAB service with API key and budget ID."""
        self.api_key = api_key or os.getenv("YNAB_API_KEY", "")
        self.budget_id = budget_id or os.getenv("YNAB_BUDGET_ID", "")

        if not self.api_key:
            logger.warning("YNAB API key not provided or found in environment")
        if not self.budget_id:
            logger.warning("YNAB budget ID not provided or found in environment")

    def _headers(self) -> Dict[str, str]:
        """Return headers for API requests."""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    def get_budgets(self) -> Dict[str, Any]:
        """Get a list of budgets for the user."""
        try:
            response = requests.get(
                f"{self.BASE_URL}/budgets",
                headers=self._headers()
            )
            response.raise_for_status()
            return response.json()["data"]
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to get budgets: {str(e)}")
            return {"error": str(e)}

    def get_budget_details(self) -> Dict[str, Any]:
        """Get details for the configured budget."""
        if not self.budget_id:
            return {"error": "Budget ID not configured"}

        try:
            response = requests.get(
                f"{self.BASE_URL}/budgets/{self.budget_id}",
                headers=self._headers()
            )
            response.raise_for_status()
            return response.json()["data"]
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to get budget details: {str(e)}")
            return {"error": str(e)}

    def get_accounts(self) -> Dict[str, Any]:
        """Get a list of open accounts for the budget."""
        if not self.budget_id:
            return {"error": "Budget ID not configured"}

        try:
            response = requests.get(
                f"{self.BASE_URL}/budgets/{self.budget_id}/accounts",
                headers=self._headers()
            )
            response.raise_for_status()
            all_accounts_data = response.json()["data"]

            # Filter out closed accounts
            open_accounts = [acc for acc in all_accounts_data.get("accounts", []) if not acc.get("closed", False)]

            # Return the filtered list within the original structure
            all_accounts_data["accounts"] = open_accounts
            return all_accounts_data

        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to get accounts: {str(e)}")
            return {"error": str(e)}

# Create an instance to use throughout the application
ynab_service = YNABService()