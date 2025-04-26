import React, { useEffect } from "react";
import useMediaQuery from "@mui/material/useMediaQuery";

function SystemThemeDetector({ onDetect }) {
  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");

  useEffect(() => {
    onDetect(prefersDarkMode);
  }, [prefersDarkMode, onDetect]);

  // This component doesn't render anything itself
  return null;
}

export default SystemThemeDetector;
