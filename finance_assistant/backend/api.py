# Add new API endpoints for dynamic rewards

@app.route("/api/credit_cards/<credit_card_id>/optimize_dynamic_rewards", methods=["POST"])
async def optimize_dynamic_rewards(credit_card_id):
    """
    Optimize the active rules for a credit card with dynamic rewards structure.
    This analyzes the eligible rules and activates the optimal ones.
    """
    try:
        # Call the data manager method
        result = await data_manager.optimize_dynamic_rewards(credit_card_id)
        if result:
            return jsonify({"success": True})
        return jsonify({"success": False, "error": "Failed to optimize rewards"}), 400
    except Exception as e:
        _LOGGER.error(f"Error optimizing dynamic rewards: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/credit_cards/<credit_card_id>/update_active_rules", methods=["POST"])
async def update_active_rules(credit_card_id):
    """
    Manually update the active rules for a credit card with dynamic rewards structure.
    """
    try:
        data = request.get_json()
        if not data or not isinstance(data, dict) or "active_rules" not in data:
            return jsonify({"success": False, "error": "Missing active_rules in request"}), 400

        active_rules = data["active_rules"]
        if not isinstance(active_rules, list):
            return jsonify({"success": False, "error": "active_rules must be a list"}), 400

        # Call the data manager method
        result = await data_manager.update_active_rules(credit_card_id, active_rules)
        if result:
            return jsonify({"success": True})
        return jsonify({"success": False, "error": "Failed to update active rules"}), 400
    except Exception as e:
        _LOGGER.error(f"Error updating active rules: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/credit_cards/<credit_card_id>/add_reward_tier", methods=["POST"])
async def add_reward_tier(credit_card_id):
    """
    Add a new reward tier to a credit card with dynamic rewards structure.
    """
    try:
        data = request.get_json()
        if not data or not isinstance(data, dict):
            return jsonify({"success": False, "error": "Invalid request payload"}), 400

        # Call the data manager method
        result = await data_manager.add_credit_card_reward_tier(credit_card_id, data)
        if result:
            return jsonify({"success": True})
        return jsonify({"success": False, "error": "Failed to add reward tier"}), 400
    except Exception as e:
        _LOGGER.error(f"Error adding reward tier: {e}")
        return jsonify({"success": False, "error": str(e)}), 500