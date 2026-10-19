import { useEffect, useState } from "react";
import {
    createInspectionTask,
    fetchPlanningLocations,
} from "../api/planningApi";

const INITIAL_FORM = {
    task_type: "Dengue Case Inspection",
    location_id: "",
    planning_date: "2026-04-01",
    urgency: "Medium",
    complaint_type: "",
};

const FIELD_CLASS =
    "w-full rounded-lg border border-borderLight bg-background px-3 py-2 text-sm text-darkBase focus:outline-none focus:ring-2 focus:ring-primary/40";

const LABEL_CLASS =
    "mb-1.5 block text-xs font-bold uppercase text-textMuted";

export default function NewInspectionTaskForm({ onTaskCreated }) {
    const [form, setForm] = useState(INITIAL_FORM);
    const [locations, setLocations] = useState([]);
    const [loadingLocations, setLoadingLocations] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(null);

    useEffect(() => {
        let active = true;

        async function loadLocations() {
            setLoadingLocations(true);
            setError("");

            try {
                const result = await fetchPlanningLocations();

                if (active) {
                    setLocations(result);
                }
            } catch (err) {
                if (active) {
                    setError(err.message || "Could not load locations.");
                }
            } finally {
                if (active) {
                    setLoadingLocations(false);
                }
            }
        }

        loadLocations();

        return () => {
            active = false;
        };
    }, []);

    const isCase = form.task_type === "Dengue Case Inspection";
    const selectedLocation = locations.find(
        (location) => location.location_id === form.location_id
    );
    const selectedRisk = selectedLocation?.risk_indicator;
    const hasSelectedRisk = Number.isFinite(selectedRisk);
    const selectedRiskLevel = hasSelectedRisk
        ? selectedRisk >= 0.7
            ? "High risk"
            : selectedRisk >= 0.4
              ? "Medium risk"
              : "Low risk"
        : "Not available";

    function handleChange(event) {
        const { name, value } = event.target;

        setForm((previous) => ({
            ...previous,
            [name]: value,
        }));

        setError("");
        setSuccess(null);
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setError("");
        setSuccess(null);

        if (!form.location_id) {
            setError("Please select a location.");
            return;
        }

        if (
            !form.planning_date ||
            form.planning_date < "2026-04-01" ||
            form.planning_date > "2026-09-30"
        ) {
            setError("Choose a date between 1 April and 30 September 2026.");
            return;
        }

        const task = {
            task_type: form.task_type,
            location_id: form.location_id,
            planning_date: form.planning_date,
        };

        if (isCase && !hasSelectedRisk) {
            setError("No valid synthetic risk data is available for this location.");
            return;
        }

        if (!isCase) {
            if (!form.urgency) {
                setError("Please select complaint urgency.");
                return;
            }

            if (!form.complaint_type.trim()) {
                setError("Please enter the complaint type.");
                return;
            }

            task.urgency = form.urgency;
            task.complaint_type = form.complaint_type.trim();
        }

        setSubmitting(true);

        try {
            const response = await createInspectionTask(task);

            setSuccess(response.task);
            setForm({
                ...INITIAL_FORM,
                location_id: "",
                planning_date: form.planning_date,
            });

            if (onTaskCreated) {
                onTaskCreated(response.task);
            }
        } catch (err) {
            setError(err.message || "Could not create the inspection task.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <section className="space-y-5 rounded-xl border border-borderLight bg-surface p-5 shadow-sm">
            <div>
                <h3 className="text-lg font-bold text-darkBase">
                    Create New Inspection Task
                </h3>
                <p className="mt-1 text-sm text-textMuted">
                    Synthetic research prototype
                </p>
            </div>

            {error && (
                <div
                    role="alert"
                    className="rounded-lg border border-riskHigh bg-red-50 px-4 py-3 text-sm text-riskHigh"
                >
                    {error}
                </div>
            )}

            {success && (
                <div
                    role="status"
                    className="space-y-1 rounded-lg border border-riskCleared bg-mintSurface px-4 py-3 text-sm text-darkBase"
                >
                    <p className="font-bold">Inspection task created successfully.</p>
                    <p>Task ID: {success.scenario_task_id}</p>
                    <p>
                        Priority: {success.priority_level} (
                        {success.priority_score})
                    </p>
                    <p className="text-xs text-textMuted">
                        The task is saved as Pending. Generate a schedule for{" "}
                        {success.planning_date} to include it in the planning run.
                    </p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                        <label htmlFor="new-task-type" className={LABEL_CLASS}>
                            Inspection Task Type
                        </label>
                        <select
                            id="new-task-type"
                            name="task_type"
                            value={form.task_type}
                            onChange={handleChange}
                            className={FIELD_CLASS}
                        >
                            <option value="Dengue Case Inspection">
                                Dengue Case Inspection
                            </option>
                            <option value="Citizen Complaint">
                                Citizen Complaint
                            </option>
                        </select>
                    </div>

                    <div>
                        <label htmlFor="new-task-date" className={LABEL_CLASS}>
                            Planning Date
                        </label>
                        <input
                            id="new-task-date"
                            name="planning_date"
                            type="date"
                            min="2026-04-01"
                            max="2026-09-30"
                            value={form.planning_date}
                            onChange={handleChange}
                            required
                            className={FIELD_CLASS}
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label htmlFor="new-task-location" className={LABEL_CLASS}>
                            Location
                        </label>
                        <select
                            id="new-task-location"
                            name="location_id"
                            value={form.location_id}
                            onChange={handleChange}
                            required
                            disabled={loadingLocations || locations.length === 0}
                            className={FIELD_CLASS}
                        >
                            <option value="">
                                {loadingLocations
                                    ? "Loading locations..."
                                    : locations.length === 0
                                      ? "No locations available"
                                      : "Select a location"}
                            </option>

                            {locations.map((location) => (
                                <option
                                    key={location.location_id}
                                    value={location.location_id}
                                >
                                    {location.village_area} —{" "}
                                    {location.location_id}
                                    {location.phi_range
                                        ? ` (${location.phi_range})`
                                        : ""}
                                </option>
                            ))}
                        </select>
                    </div>

                    {isCase ? (
                        <div className="md:col-span-2">
                            <label
                                htmlFor="new-task-risk"
                                className={LABEL_CLASS}
                            >
                                Automatically Retrieved Risk Indicator
                            </label>
                            <input
                                id="new-task-risk"
                                type="text"
                                value={
                                    hasSelectedRisk
                                        ? selectedRisk.toFixed(2)
                                        : form.location_id
                                          ? "Not available"
                                          : "Select a location"
                                }
                                readOnly
                                className={FIELD_CLASS}
                            />
                            <p
                                className={`mt-1 text-sm font-semibold ${
                                    selectedRiskLevel === "High risk"
                                        ? "text-riskHigh"
                                        : selectedRiskLevel === "Medium risk"
                                          ? "text-riskMedium"
                                          : selectedRiskLevel === "Low risk"
                                            ? "text-riskCleared"
                                            : "text-textMuted"
                                }`}
                                aria-live="polite"
                            >
                                {selectedRiskLevel}
                            </p>
                            <p className="mt-1 text-xs text-textMuted">
                                Illustrative value only, retrieved from synthetic
                                location data. The risk indicator is read-only;
                                the system calculates the priority score.
                            </p>
                            {form.location_id && !hasSelectedRisk && (
                                <p className="mt-1 text-xs text-riskHigh" role="alert">
                                    No valid synthetic risk data is available for
                                    this location. Select another location.
                                </p>
                            )}
                        </div>
                    ) : (
                        <>
                            <div>
                                <label
                                    htmlFor="new-task-urgency"
                                    className={LABEL_CLASS}
                                >
                                    Complaint Urgency
                                </label>
                                <select
                                    id="new-task-urgency"
                                    name="urgency"
                                    value={form.urgency}
                                    onChange={handleChange}
                                    required
                                    className={FIELD_CLASS}
                                >
                                    <option value="High">High</option>
                                    <option value="Medium">Medium</option>
                                    <option value="Low">Low</option>
                                </select>
                            </div>

                            <div>
                                <label
                                    htmlFor="new-task-complaint"
                                    className={LABEL_CLASS}
                                >
                                    Complaint Type
                                </label>
                                <input
                                    id="new-task-complaint"
                                    name="complaint_type"
                                    type="text"
                                    maxLength={100}
                                    value={form.complaint_type}
                                    onChange={handleChange}
                                    placeholder="e.g. Potential mosquito breeding site"
                                    required
                                    className={FIELD_CLASS}
                                />
                            </div>
                        </>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={
                        submitting ||
                        loadingLocations ||
                        locations.length === 0 ||
                        (isCase && !!form.location_id && !hasSelectedRisk)
                    }
                    className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-surface transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {submitting ? "Creating Task..." : "Create Inspection Task"}
                </button>

                <p className="text-xs text-textMuted">
                    Synthetic research prototype only. Priority scores and
                    schedules are provisional and are not operational PHI
                    recommendations.
                </p>
            </form>
        </section>
    );
}
