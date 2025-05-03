export const callApi = async (endpoint, options = {}, isIngress = true) => {
  const ingressPath = window.ingressPath || "";
  // Use a regex to extract the base addon ID if needed, default otherwise
  const matches = ingressPath.match(/\/api\/hassio_ingress\/([\w-]+)/);
  const addonId = matches ? matches[1] : "local_finance_assistant"; // Fallback ID

  const baseUrl = isIngress ? `/api/hassio_ingress/${addonId}` : `/api`; // Base API path
  const url = `${baseUrl}${endpoint}`; // Construct the full URL

  _LOGGER.info(
    `Making API call via ${isIngress ? "INGRESS" : "DIRECT"} to: ${url}`
  );
  _LOGGER.debug("Options:", options);

  const defaultOptions = {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      // Authorization header might be needed depending on auth method
    },
  };

  const config = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...(options.headers || {}),
    },
  };

  // Automatically stringify body if it's an object and method is not GET/HEAD
  if (
    config.body &&
    typeof config.body === "object" &&
    config.method !== "GET" &&
    config.method !== "HEAD"
  ) {
    try {
      config.body = JSON.stringify(config.body);
      _LOGGER.debug("Successfully stringified request body.");
    } catch (e) {
      _LOGGER.error("Failed to stringify request body:", e);
      throw new Error("Failed to stringify request body."); // Prevent sending invalid data
    }
  }

  _LOGGER.debug("Final fetch config:", config);

  // Attempting the fetch call
  try {
    const response = await fetch(url, config);
    if (!response.ok) {
      throw new Error(`API call failed with status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (e) {
    _LOGGER.error("API call failed:", e);
    throw e;
  }
};
