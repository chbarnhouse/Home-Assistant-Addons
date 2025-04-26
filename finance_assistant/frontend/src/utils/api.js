/**
 * Utility functions for API calls
 */

// CRITICAL FIX: Use the actual ingress path injected by Home Assistant
function getApiBaseUrl() {
  // Try 3 different methods to get the API base URL:

  // 1. Check for injected ingressPath by Home Assistant
  if (typeof window !== "undefined" && window.ingressPath) {
    console.log(
      "✅ Using ingress path from window.ingressPath:",
      window.ingressPath
    );
    return window.ingressPath;
  }

  // 2. Extract from current URL pathname if we're in ingress
  if (
    typeof window !== "undefined" &&
    window.location.pathname.includes("/hassio_ingress/")
  ) {
    const match = window.location.pathname.match(
      /\/(?:api\/)?hassio_ingress\/[^/]+/
    );
    if (match) {
      console.log("✅ Extracted ingress path from URL:", match[0]);
      return match[0];
    }
  }

  // 3. Fallback to direct API (development mode)
  console.log("⚠️ No ingress path found, using direct API path");
  return "/api";
}

// Export the getApiBaseUrl function
export { getApiBaseUrl };

// Get the API base URL
const API_BASE_URL = getApiBaseUrl();

/**
 * Make an API call with proper error handling
 * @param {string} endpoint - The API endpoint (starting with /api/)
 * @param {Object} options - The fetch options
 * @returns {Promise<Object>} - The JSON response
 */
export async function callApi(endpoint, options = {}) {
  // Remove leading slash if endpoint has one and API_BASE_URL ends with one
  const cleanEndpoint = endpoint.startsWith("/")
    ? endpoint.substring(1)
    : endpoint;

  // Make sure API_BASE_URL has a trailing slash
  const baseUrl = API_BASE_URL.endsWith("/")
    ? API_BASE_URL
    : `${API_BASE_URL}/`;

  // Construct the full URL
  // Conditionally add 'api/' prefix ONLY if not using ingress path
  let url;
  if (API_BASE_URL.includes("/hassio_ingress/")) {
    // Ingress path needs /api/ appended before the specific endpoint
    url = `${baseUrl}api/${cleanEndpoint}`; // Add /api/ prefix here
    console.log(`📡 Making API call via INGRESS to: ${url}`);
  } else {
    // Development mode or other setup, assume we need /api/ prefix
    const apiEndpoint = cleanEndpoint.startsWith("api/")
      ? cleanEndpoint
      : `api/${cleanEndpoint}`;
    url = `${baseUrl}${apiEndpoint}`;
    console.log(`📡 Making API call (non-ingress) to: ${url}`);
  }

  console.log(`📡 Options:`, {
    method: options.method,
    body: options.body,
  });

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    // First check if response is ok
    if (!response.ok) {
      console.error(`❌ API call failed: ${url}`, {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries([...response.headers.entries()]),
      });

      let errorData = {};
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        // Attempt to parse the JSON body of the error response
        errorData = await response.json();
        // Use the specific error message from the backend if available
        if (errorData && errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (jsonError) {
        // JSON parsing failed, use the generic HTTP error message
        console.warn(
          `Could not parse JSON error response from ${url}:`,
          jsonError
        );
      }

      // Create a new error object with the determined message
      const error = new Error(errorMessage);
      // Attach the parsed data (even if empty) to the error object for inspection
      error.data = errorData;
      error.status = response.status;
      throw error; // Throw the enhanced error object
    }

    // Check if the response is likely to have a JSON body
    const contentType = response.headers.get("content-type");
    const contentLength = response.headers.get("content-length");

    // Handle potential empty responses (200 OK or 204 No Content with no body)
    if (response.status === 204 || contentLength === "0") {
      console.log(
        `✅ API call successful (Status: ${response.status}, No Content): ${url}`
      );
      return {}; // Return an empty object for successful calls with no body
    }

    // Check content type before parsing JSON
    if (contentType && contentType.includes("application/json")) {
      // Then try to parse the JSON
      const data = await response.json();
      console.log(`✅ API call successful (JSON): ${url}`, { data });
      return data;
    } else {
      // Handle non-JSON successful responses if necessary
      console.log(
        `✅ API call successful (Non-JSON, Status: ${response.status}): ${url}`
      );
      // If you need the text content, you could use response.text() here
      // For now, return an empty object as we primarily expect JSON or nothing
      return {};
    }
  } catch (error) {
    // Restore the original error logging and re-throw
    console.error(`🔥 API call failed to ${url}:`, error);
    throw error; // Re-throw for component handling
  }
}

/**
 * Fetch all data from the /api/all_data endpoint
 */
export async function fetchAllData() {
  // Implement the logic to fetch all data from the /api/all_data endpoint
  // This is a placeholder and should be replaced with the actual implementation
  console.log("Fetching all data from the /api/all_data endpoint");
  return callApi("/all_data");
}
