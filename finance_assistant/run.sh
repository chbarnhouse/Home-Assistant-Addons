#!/usr/bin/with-contenv bashio

# Set up environment variables from addon options
export YNAB_API_KEY=$(bashio::config 'ynab_api_key')
export YNAB_BUDGET_ID=$(bashio::config 'ynab_budget_id')

bashio::log.info "Starting Finance Assistant..."

# Check if variables are set (optional debug)
if bashio::config.has_value 'ynab_api_key' && bashio::config.has_value 'ynab_budget_id'; then
    bashio::log.info "YNAB API Key and Budget ID found in config."
else
    bashio::log.warning "YNAB API Key or Budget ID not found in config! Please configure the addon."
fi

# Start the Flask application using Gunicorn (sync worker)
bashio::log.info "Starting Gunicorn for Flask app (sync worker)..."
cd /app
exec gunicorn --bind 0.0.0.0:8000 "backend.app:app" # Use default sync worker
