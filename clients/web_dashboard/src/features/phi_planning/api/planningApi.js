/**
 * C3 PHI Planning API service.
 *
 * All requests target the FastAPI backend at VITE_C3_API_BASE_URL
 * (defaults to http://127.0.0.1:8000 for local development).
 *
 * Do not hardcode the API URL in individual components.
 * Do not access the SQLite database directly from the browser.
 */

const BASE_URL =
    import.meta.env.VITE_C3_API_BASE_URL?.replace(/\/$/, "") ??
    "http://127.0.0.1:8000";

/**
 * Internal helper: perform a fetch and normalize errors.
 * Throws an Error with a human-readable message on any failure.
 */
async function apiFetch(path, options = {}) {
    const url = `${BASE_URL}${path}`;

    let response;
    try {
        response = await fetch(url, {
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            ...options,
        });
    } catch (networkError) {
        throw new Error(
            `Cannot reach the C3 API at ${BASE_URL}. ` +
            `Make sure the backend is running (uvicorn). ` +
            `(${networkError.message})`,
            { cause: networkError }
        );
    }

    if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
            const body = await response.json();
            if (body?.detail) {
                detail =
                    typeof body.detail === "string"
                        ? body.detail
                        : JSON.stringify(body.detail);
            }
        } catch {
            // Non-JSON error body; keep the status code message.
        }
        throw new Error(detail);
    }

    try {
        return await response.json();
    } catch {
        throw new Error("The API returned an unexpected non-JSON response.");
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API functions
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /health
 * Check whether the C3 API backend is reachable and healthy.
 */
export async function checkHealth() {
    return apiFetch("/health");
}

/**
 * GET /api/v1/planning/priorities?limit=N
 * Return provisional case and complaint priority scores.
 *
 * @param {number} [limit=100] - Number of records to retrieve (1-1000).
 */
export async function fetchPriorities(limit = 100) {
    const safeLimit = Math.max(1, Math.min(1000, Math.floor(Number(limit))));
    return apiFetch(`/api/v1/planning/priorities?limit=${safeLimit}`);
}

/**
 * POST /api/v1/planning/schedule
 * Generate a synthetic PHI inspection schedule for the given date.
 *
 * @param {string} planningDate - Date string in YYYY-MM-DD format.
 */
export async function createSchedule(planningDate) {
    if (!planningDate || !/^\d{4}-\d{2}-\d{2}$/.test(planningDate)) {
        throw new Error(
            "Planning date must be in YYYY-MM-DD format (e.g. 2026-04-01)."
        );
    }
    return apiFetch("/api/v1/planning/schedule", {
        method: "POST",
        body: JSON.stringify({ planning_date: planningDate }),
    });
}

/**
 * POST /api/v1/planning/reschedule
 * Simulate rescheduling when a PHI becomes unavailable.
 *
 * The schedule for the given date must already exist (call createSchedule first).
 *
 * @param {string}  planningDate     - Date string in YYYY-MM-DD format.
 * @param {string}  unavailablePhi   - PHI identifier who becomes unavailable.
 * @param {boolean} assumeAllPending - Treat all tasks as Pending (synthetic scenario).
 */
export async function reschedule(planningDate, unavailablePhi, assumeAllPending = false) {
    if (!planningDate || !/^\d{4}-\d{2}-\d{2}$/.test(planningDate)) {
        throw new Error(
            "Planning date must be in YYYY-MM-DD format (e.g. 2026-04-01)."
        );
    }
    if (!unavailablePhi || unavailablePhi.trim() === "") {
        throw new Error("A PHI identifier is required for rescheduling.");
    }
    return apiFetch("/api/v1/planning/reschedule", {
        method: "POST",
        body: JSON.stringify({
            planning_date: planningDate,
            unavailable_phi: unavailablePhi.trim(),
            assume_all_pending: Boolean(assumeAllPending),
        }),
    });
}
