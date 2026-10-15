// clients/phi_mobile_app/src/shared/api/edgeApiClient.js

// API_BASE_URL targets the local VS Code port forward for the Pi's FastAPI server.
// Update to the Pi's Wi-Fi IP (e.g., 'http://192.168.1.100:8000') for physical field testing.
const API_BASE_URL = 'http://192.168.1.137:8000';

/**
 * Fetches the latest localized environmental breeding risk record from the Edge AI node.
 * @returns {Promise<Object|null>} The TelemetryRecord JSON or null if fetch fails.
 */
export const fetchLatestRiskAssessment = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/telemetry/latest`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!response.ok) {
      throw new Error(`Edge API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.warn("[EdgeAPI] Fetch failed. Ensure FastAPI is running and port 8000 is forwarded:", error.message);
    return null;
  }
};