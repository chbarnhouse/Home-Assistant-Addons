import React, { createContext, useState, useMemo, useContext } from "react";
import {
  ThemeProvider as MuiThemeProvider,
  createTheme,
} from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

// Create the context
export const ThemeContext = createContext({
  toggleColorMode: () => {},
  mode: "light", // Default mode
});

// Create the provider component
export const ThemeContextProvider = ({ children }) => {
  const [mode, setMode] = useState("light"); // Default to light mode

  const colorMode = useMemo(
    () => ({
      toggleColorMode: () => {
        setMode((prevMode) => (prevMode === "light" ? "dark" : "light"));
      },
      mode,
    }),
    [mode]
  );

  // Create the theme based on the current mode
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
        },
      }),
    [mode]
  );

  return (
    <ThemeContext.Provider value={colorMode}>
      {/* Pass the dynamic theme to MUI ThemeProvider */}
      <MuiThemeProvider theme={theme}>
        <CssBaseline /> {/* Include CssBaseline here for consistency */}
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};

// Export an alias to match the import in App.jsx
export const ThemeProviderWrapper = ThemeContextProvider;

// Custom hook to use the theme context
export const useThemeContext = () => useContext(ThemeContext);
