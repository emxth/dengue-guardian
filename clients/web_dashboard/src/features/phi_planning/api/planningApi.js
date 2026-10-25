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
        const error = new Error(detail);
        error.status = response.status;
        throw error;
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
export async function fetchPriorities(
    limit = 50,
    planningDate,
    dateFrom,
    dateTo,
    offset = 0,
    filters = {},
) {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(Number(limit))));
    const safeOffset = Math.max(0, Math.floor(Number(offset)));
    const query = new URLSearchParams({
        limit: String(safeLimit),
        offset: String(safeOffset),
    });
    for (const [name, value] of [
        ["planning_date", planningDate],
        ["date_from", dateFrom],
        ["date_to", dateTo],
    ]) {
        if (value) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                throw new Error(`${name} must be in YYYY-MM-DD format.`);
            }
            query.set(name, value);
        }
    }
    if (dateFrom && dateTo && dateFrom > dateTo) {
        throw new Error("Start date must be on or before end date.");
    }
    for (const key of ["task_type", "priority_level", "location_id", "search"]) {
        if (filters[key]) query.set(key, filters[key]);
    }
    return apiFetch(`/api/v1/planning/priorities?${query.toString()}`);
}

/**
 * GET /api/v1/planning/analytics/monthly
 * Fetch actual monthly record counts and coverage metadata for one location.
 */
export async function fetchMonthlyDengueAnalytics(locationId, year, metric = "cases") {
    if (!locationId || typeof locationId !== "string") {
        throw new Error("Select a location for monthly analytics.");
    }
    if (!["cases", "complaints"].includes(metric)) {
        throw new Error("Select Cases or Citizen Complaints.");
    }
    const query = new URLSearchParams({ location_id: locationId, metric });
    if (year !== undefined && year !== null && year !== "") {
        const numericYear = Number(year);
        if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2100) {
            throw new Error("Select a valid year.");
        }
        query.set("year", String(numericYear));
    }
    return apiFetch(`/api/v1/planning/analytics/monthly?${query.toString()}`);
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

/** GET the saved plan for a planning date without regenerating it. */
export async function fetchSchedule(planningDate) {
    if (!planningDate || !/^\d{4}-\d{2}-\d{2}$/.test(planningDate)) {
        throw new Error("Planning date must be in YYYY-MM-DD format.");
    }
    const query = new URLSearchParams({ planning_date: planningDate });
    return apiFetch(`/api/v1/planning/schedule?${query.toString()}`);
}

/** Fetch submitted mobile inspection reports for one inspection date. */
export async function fetchCompletedInspections(inspectionDate) {
    if (!inspectionDate || !/^\d{4}-\d{2}-\d{2}$/.test(inspectionDate)) {
        throw new Error("Inspection date must be in YYYY-MM-DD format.");
    }
    const query = new URLSearchParams({ inspection_date: inspectionDate });
    return apiFetch(`/api/v1/planning/completed-inspections?${query.toString()}`);
}

/** Persist MOH review confirmation. This does not deliver the plan to PHIs. */
export async function confirmSchedule(planningDate) {
    if (!planningDate || !/^\d{4}-\d{2}-\d{2}$/.test(planningDate)) {
        throw new Error("Planning date must be in YYYY-MM-DD format.");
    }
    return apiFetch("/api/v1/planning/schedule/confirm", {
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

/**
 * GET /api/v1/planning/locations
 * Fetch valid locations for the new inspection task form.
 */
export async function fetchPlanningLocations() {
    const response = await apiFetch("/api/v1/planning/locations");
    return response.locations ?? [];
}

/**
 * POST /api/v1/planning/tasks
 * Submit a new inspection task.
 *
 * @param {Object} task - Validated inspection task details.
 */
export async function createInspectionTask(task) {
    if (!task || typeof task !== "object") {
        throw new Error("Inspection task details are required.");
    }

    if (
        !["Dengue Case Inspection", "Citizen Complaint"].includes(
            task.task_type
        )
    ) {
        throw new Error("Select a valid inspection task type.");
    }

    if (!task.location_id) {
        throw new Error("Please select a location.");
    }

    if (!task.planning_date || !/^\d{4}-\d{2}-\d{2}$/.test(task.planning_date)) {
        throw new Error("Enter a valid planning date in YYYY-MM-DD format.");
    }

    return apiFetch("/api/v1/planning/tasks", {
        method: "POST",
        body: JSON.stringify(task),
    });
}

/**
 * PATCH /api/v1/planning/tasks/{taskId}/status
 * Persist field execution status separately from appointment status.
 */
export async function updatePlanningTaskStatus(taskId, taskStatus) {
    if (!taskId || typeof taskId !== "string") {
        throw new Error("A planning task ID is required.");
    }
    if (!["Pending", "In Progress", "Completed", "Cancelled"].includes(taskStatus)) {
        throw new Error("Select a valid task execution status.");
    }
    return apiFetch(`/api/v1/planning/tasks/${encodeURIComponent(taskId)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ task_status: taskStatus }),
    });
}

/**
 * GET /api/v1/planning/phis/availability
 * Read authoritative PHI availability for one planning date.
 */
export async function fetchPhiAvailability(planningDate) {
    if (!planningDate || !/^\d{4}-\d{2}-\d{2}$/.test(planningDate)) {
        throw new Error("Planning date must be in YYYY-MM-DD format.");
    }
    const query = new URLSearchParams({ planning_date: planningDate });
    return apiFetch(`/api/v1/planning/phis/availability?${query.toString()}`);
}

/**
 * PUT /api/v1/planning/phis/{phiId}/availability
 * Persist availability for the selected date only.
 */
export async function setPhiAvailability(planningDate, phiId, availability) {
    if (!planningDate || !/^\d{4}-\d{2}-\d{2}$/.test(planningDate)) {
        throw new Error("Planning date must be in YYYY-MM-DD format.");
    }
    if (!phiId || typeof phiId !== "string") {
        throw new Error("A PHI identifier is required.");
    }
    if (!["Available", "Unavailable"].includes(availability)) {
        throw new Error("Availability must be Available or Unavailable.");
    }
    return apiFetch(`/api/v1/planning/phis/${encodeURIComponent(phiId)}/availability`, {
        method: "PUT",
        body: JSON.stringify({ planning_date: planningDate, availability }),
    });
}
