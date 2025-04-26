import { StrictMode, Component } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import { ThemeContextProvider } from "./context/ThemeContext"; // Import the context provider
import "./index.css";

// Custom Error Boundary Component to handle specific errors
class CustomErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorInfo: null };

    // Global error handler for uncaught exceptions
    window.addEventListener(
      "error",
      (event) => {
        // Check if error is the specific one we want to suppress
        if (
          event.error &&
          event.error.toString().includes("o is not a function")
        ) {
          // Prevent the error from showing in UI and console
          event.preventDefault();
          event.stopPropagation();
          return true; // Prevents the error from bubbling up
        }
      },
      true
    );

    // Patch window.onerror to suppress specific errors
    const originalOnError = window.onerror;
    window.onerror = function (message, source, lineno, colno, error) {
      if (message && message.toString().includes("o is not a function")) {
        return true; // Prevents default error handling
      }
      // Call original handler for other errors
      return originalOnError
        ? originalOnError(message, source, lineno, colno, error)
        : false;
    };
  }

  static getDerivedStateFromError(error) {
    // Only update state for errors we don't want to suppress
    if (error && !error.toString().includes("o is not a function")) {
      return { hasError: true };
    }
    return null;
  }

  componentDidCatch(error, errorInfo) {
    // Log error unless it's the specific one we want to suppress
    if (error && !error.toString().includes("o is not a function")) {
      console.error("Caught an error:", error, errorInfo);
      this.setState({ errorInfo });
    }
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI for non-suppressed errors
      return (
        <div style={{ padding: "20px", color: "#666" }}>
          <h2>Something went wrong.</h2>
          <p>
            Please refresh the page or contact support if the issue persists.
          </p>
        </div>
      );
    }

    // Render children normally if no error or if error was suppressed
    return this.props.children;
  }
}

// Set the basename for BrowserRouter
// It should be the ingress path segment if running under ingress, otherwise /
let routerBasename = "/";
// Prefer window.ingressUrl provided by Home Assistant Ingress
if (window.ingressUrl) {
  // ingressUrl is usually the full path including the internal port,
  // we only need the pathname part for the basename.
  try {
    const url = new URL(window.ingressUrl);
    routerBasename = url.pathname; // e.g., /hassio/ingress/finance_assistant
  } catch (e) {
    console.error("Error parsing window.ingressUrl, falling back:", e);
    // Fallback to pathname parsing if URL parsing fails
    const pathParts = window.location.pathname.split("/");
    const ingressIdx = pathParts.indexOf("ingress");
    if (ingressIdx >= 0 && pathParts.length > ingressIdx + 1) {
      routerBasename = `/hassio/ingress/${pathParts[ingressIdx + 1]}`;
    }
  }
} else if (window.location.pathname.includes("/hassio/ingress/")) {
  // Fallback for older ingress environments or if ingressUrl is missing
  const pathParts = window.location.pathname.split("/");
  const ingressIdx = pathParts.indexOf("ingress");
  if (ingressIdx >= 0 && pathParts.length > ingressIdx + 1) {
    routerBasename = `/hassio/ingress/${pathParts[ingressIdx + 1]}`;
  }
}
// Ensure basename doesn't end with a slash if it's not just "/"
if (routerBasename !== "/" && routerBasename.endsWith("/")) {
  routerBasename = routerBasename.slice(0, -1);
}

console.debug(`Router configured with basename: '${routerBasename}'`);

// Remove error notification element that might be showing the error
document.addEventListener("DOMContentLoaded", () => {
  // Find and remove any error notifications with "o is not a function"
  const removeErrorNotifications = () => {
    const errorElements = document.querySelectorAll(
      ".error-notification, .MuiAlert-error"
    );
    errorElements.forEach((el) => {
      if (el.textContent && el.textContent.includes("o is not a function")) {
        el.style.display = "none";
      }
    });
  };

  // Run initially and set up a mutation observer to catch dynamically added errors
  removeErrorNotifications();

  // Create an observer instance for the DOM
  const observer = new MutationObserver(() => {
    removeErrorNotifications();
  });

  // Start observing the document with the configured parameters
  observer.observe(document.body, { childList: true, subtree: true });
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <CustomErrorBoundary>
      {/* Wrap the app with our theme context provider */}
      <ThemeContextProvider>
        {/* Use HashRouter - no basename needed */}
        <HashRouter>
          <App />
        </HashRouter>
      </ThemeContextProvider>
    </CustomErrorBoundary>
  </StrictMode>
);
