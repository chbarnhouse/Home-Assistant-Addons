import React from "react";
import PropTypes from "prop-types";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import SettingsIcon from "@mui/icons-material/Settings";

/**
 * Button component that opens the manage asset types modal
 */
function ManageAssetTypesButton({
  onClick,
  disabled = false,
  size = "medium",
}) {
  return (
    <Tooltip title="Manage Asset Types">
      <span>
        <IconButton
          onClick={onClick}
          disabled={disabled}
          size={size}
          color="primary"
          aria-label="manage asset types"
        >
          <SettingsIcon fontSize={size === "small" ? "small" : "medium"} />
        </IconButton>
      </span>
    </Tooltip>
  );
}

ManageAssetTypesButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  size: PropTypes.oneOf(["small", "medium", "large"]),
};

export default ManageAssetTypesButton;
