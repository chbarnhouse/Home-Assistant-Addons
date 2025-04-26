from fastapi import FastAPI, Request, APIRouter, HTTPException
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import os
from pathlib import Path
import logging
import uvicorn
import threading
from fastapi.middleware.cors import CORSMiddleware
from ynab_service import ynab_service

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- App Setup ---
app = FastAPI()

# --- Add CORS middleware for direct access ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)

api_router = APIRouter(prefix="/api")

# --- Environment Variables ---
ynab_api_key = os.getenv('YNAB_API_KEY')
ynab_budget_id = os.getenv('YNAB_BUDGET_ID')

# --- Static Files Setup ---
STATIC_DIR = Path("static")

# --- API Endpoints ---
# Define API endpoints using the router
@api_router.get("/health", include_in_schema=False)
async def health_check():
    return {"status": "ok"}

@api_router.get("/config_check")
async def config_check():
    key_present = bool(ynab_api_key and len(ynab_api_key) > 5)
    key_display = f"{ynab_api_key[:5]}..." if key_present else "Not Set"
    return {
        "ynab_api_key_set": key_present,
        "ynab_api_key_start": key_display,
        "ynab_budget_id": ynab_budget_id or "Not Set"
    }

@api_router.get("/ynab/budgets")
async def get_budgets():
    return ynab_service.get_budgets()

@api_router.get("/ynab/budget")
async def get_budget_details():
    return ynab_service.get_budget_details()

@api_router.get("/ynab/accounts")
async def get_accounts():
    logger.info("API endpoint /api/ynab/accounts hit!")
    try:
        accounts_data = ynab_service.get_accounts()
        logger.info(f"Returning accounts data: {accounts_data}")
        return JSONResponse(content=accounts_data)
    except Exception as e:
        logger.exception("Error getting accounts from YNAB service")
        raise HTTPException(status_code=500, detail=str(e))

# Include the API router *before* static files and catch-all
app.include_router(api_router)

# --- Frontend Serving ---
# Mount the nested static directory ('static/static') for assets
app.mount("/static", StaticFiles(directory=STATIC_DIR / "static"), name="static_assets")

# Serve the main index.html for the root path
@app.get("/", response_class=FileResponse, include_in_schema=False)
async def serve_index():
    index_path = STATIC_DIR / "index.html"
    if index_path.is_file():
        return FileResponse(index_path)
    return HTMLResponse(content="index.html not found", status_code=404)

# Catch-all for client-side routing (must be last)
@app.get("/{full_path:path}", response_class=FileResponse, include_in_schema=False)
async def serve_react_app(full_path: str):
    index_path = STATIC_DIR / "index.html"
    if index_path.is_file():
        return FileResponse(index_path)
    return HTMLResponse(content="Not Found", status_code=404)

# Function to run the uvicorn server on a specific host and port
def run_server(host, port):
    uvicorn.run(app, host=host, port=port)

# Main entry point (will be run by run.sh)
if __name__ == "__main__":
    # Start a thread for the internal ingress port (8000)
    ingress_thread = threading.Thread(
        target=run_server,
        args=("0.0.0.0", 8000),
        daemon=True
    )
    ingress_thread.start()

    # Run the external API port (8001) in the main thread
    run_server("0.0.0.0", 8001)