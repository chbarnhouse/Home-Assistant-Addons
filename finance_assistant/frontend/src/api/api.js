/**
 * API utility functions for the Finance Assistant
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

// Get the API base URL
const API_BASE_URL = getApiBaseUrl();

async function callApi(endpoint, options = {}) {
  // Remove leading slash if endpoint has one and API_BASE_URL ends with one
  const cleanEndpoint = endpoint.startsWith("/")
    ? endpoint.substring(1)
    : endpoint;

  // Make sure API_BASE_URL has a trailing slash
  const baseUrl = API_BASE_URL.endsWith("/")
    ? API_BASE_URL
    : `${API_BASE_URL}/`;

  // Construct the full URL
  const url = `${baseUrl}${cleanEndpoint}`;
  console.log(`📡 Making API request to: ${url}`);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      console.error(`❌ HTTP error ${response.status} for ${url}`);
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: await response.text() };
      }

      throw new Error(
        errorData.error ||
          errorData.message ||
          `HTTP error! status: ${response.status}`
      );
    }

    console.log(`✅ API call successful: ${url}`);
    return await response.json();
  } catch (error) {
    console.error(`🔥 API error (${endpoint}):`, error);
    throw error;
  }
}

/**
 * Fetch data from the specified API endpoint
 * @param {string} endpoint - The API endpoint to call
 * @param {Object} options - Optional fetch options
 * @returns {Promise<Object>} - The parsed JSON response
 */
export const fetchData = async (endpoint, options = {}) => {
  return callApi(endpoint, options);
};

/**
 * Fetch all financial data in one call
 * @returns {Promise<Object>} All finance data
 */
export const getAllData = async () => {
  // Make sure we're using the correct path format for API requests
  return fetchData("all_data");
};

/**
 * Post data to the specified API endpoint
 * @param {string} endpoint - The API endpoint to post data to
 * @param {Object} data - The data to post
 * @returns {Promise<Object>} - The parsed JSON response
 */
export const postData = async (endpoint, data) => {
  return fetchData(endpoint, {
    method: "POST",
    body: JSON.stringify(data),
  });
};

/**
 * Put data to the specified API endpoint
 * @param {string} endpoint - The API endpoint to put data to
 * @param {Object} data - The data to put
 * @returns {Promise<Object>} - The parsed JSON response
 */
export const putData = async (endpoint, data) => {
  return fetchData(endpoint, {
    method: "PUT",
    body: JSON.stringify(data),
  });
};

/**
 * Delete data from the specified API endpoint
 * @param {string} endpoint - The API endpoint to delete data from
 * @param {Object} data - Optional data to send with the delete request
 * @returns {Promise<Object>} - The parsed JSON response
 */
export const deleteData = async (endpoint, data = null) => {
  const options = {
    method: "DELETE",
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  return fetchData(endpoint, options);
};
