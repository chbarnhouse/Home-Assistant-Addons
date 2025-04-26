import React, {
  createContext,
  useState,
  useMemo,
  useContext,
  useEffect,
  Suspense,
  lazy,
} from "react";
import {
  ThemeProvider as MuiThemeProvider,
  createTheme,
  // useMediaQuery, // Removed
} from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

// Lazy load the detector component
const SystemThemeDetector = lazy(() =>
  import("../components/SystemThemeDetector")
);

// Helper function to check if running in browser
const isBrowser = typeof window !== "undefined";

// Create the context
export const ThemeContext = createContext({
  setMode: () => {},
  mode: "system", // Default preference to system
});

// Create the provider component
export const ThemeContextProvider = ({ children }) => {
  // State for user's preference ('light', 'dark', or 'system')
  const [themePreference, setThemePreference] = useState("system");
  // State for the detected system preference (null initially)
  const [systemPrefersDark, setSystemPrefersDark] = useState(null);
  // State for the actual mode applied ('light' or 'dark')
  const [actualMode, setActualMode] = useState("light"); // Start with light
  const [isMounted, setIsMounted] = useState(false);

  // Effect to mark as mounted and load preference from localStorage
  useEffect(() => {
    setIsMounted(true);
    const storedPreference =
      localStorage.getItem("themePreference") || "system";
    // Validate stored preference
    if (["light", "dark", "system"].includes(storedPreference)) {
      setThemePreference(storedPreference);
    } else {
      setThemePreference("system"); // Default to system if invalid
      if (isBrowser) {
        localStorage.setItem("themePreference", "system");
      }
    }
  }, []);

  // Callback for the detector component
  const handleSystemPrefDetection = (prefersDark) => {
    setSystemPrefersDark(prefersDark);
  };

  // Effect to calculate the actual theme mode
  useEffect(() => {
    // Need isMounted and systemPrefersDark !== null before calculating
    if (!isMounted || systemPrefersDark === null) return;

    let currentActualMode = "light"; // Default
    if (themePreference === "system") {
      currentActualMode = systemPrefersDark ? "dark" : "light";
    } else {
      currentActualMode = themePreference;
    }
    setActualMode(currentActualMode);

    // Clean up body attribute from previous attempt
    document.body.removeAttribute("data-theme-preference");
  }, [themePreference, systemPrefersDark, isMounted]);

  // Function to update the user's preference
  const setMode = (newPreference) => {
    if (["light", "dark", "system"].includes(newPreference)) {
      setThemePreference(newPreference);
      // Save preference only if localStorage is available (client-side)
      if (isBrowser) {
        localStorage.setItem("themePreference", newPreference);
      }
    } else {
      console.warn(
        `Invalid theme preference: ${newPreference}. Using 'system'.`
      );
      setThemePreference("system");
      if (isBrowser) {
        localStorage.setItem("themePreference", "system");
      }
    }
  };

  // Create the MUI theme based on the *actual* calculated mode
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: actualMode, // Use the calculated actual mode
        },
      }),
    [actualMode] // Recreate theme only when actualMode changes
  );

  // Provide the user's preference setting ('light', 'dark', 'system') and the setter
  const contextValue = useMemo(
    () => ({
      mode: themePreference, // The user's selected preference
      setMode,
    }),
    [themePreference, setMode]
  );

  // Render detector only when mounted to ensure localStorage/window are available
  const detector = isMounted ? (
    <Suspense fallback={null}>
      {" "}
      {/* Suspense needed for lazy component */}
      <SystemThemeDetector onDetect={handleSystemPrefDetection} />
    </Suspense>
  ) : null;

  return (
    <ThemeContext.Provider value={contextValue}>
      {/* MuiThemeProvider provides baseline light/dark styles */}
      <MuiThemeProvider theme={theme}>
        {/* CssBaseline applies theme bg/text color. We override it via CSS when needed. */}
        <CssBaseline />
        {detector} {/* Render the detector (conditionally) */}
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};

// Export an alias to match the import in App.jsx
export const ThemeProviderWrapper = ThemeContextProvider;

// Custom hook to use the theme context
export const useThemeContext = () => useContext(ThemeContext);
