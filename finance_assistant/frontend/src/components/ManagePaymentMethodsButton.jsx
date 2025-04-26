import React from "react";
import PropTypes from "prop-types";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import SettingsIcon from "@mui/icons-material/Settings";

/**
 * Button component to open the payment methods management modal
 */
function ManagePaymentMethodsButton({
  onClick,
  disabled = false,
  size = "medium",
}) {
  return (
    <Tooltip title="Manage Payment Methods">
      <span>
        <IconButton
          onClick={onClick}
          disabled={disabled}
          size={size}
          color="primary"
          aria-label="manage payment methods"
        >
          <SettingsIcon fontSize={size === "small" ? "small" : "medium"} />
        </IconButton>
      </span>
    </Tooltip>
  );
}

ManagePaymentMethodsButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  size: PropTypes.oneOf(["small", "medium", "large"]),
};

export default ManagePaymentMethodsButton;
