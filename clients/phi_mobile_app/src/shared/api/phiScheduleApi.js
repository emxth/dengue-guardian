const API_BASE_URL = (
  process.env.EXPO_PUBLIC_C3_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

async function request(path, token, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    throw new Error(`Cannot reach planning service at ${API_BASE_URL}: ${error.message}`);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.detail || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export function loginPhi(phiId, password) {
  return request("/api/v1/phi/login", null, {
    method: "POST",
    body: JSON.stringify({ phi_id: phiId.trim(), password }),
  });
}

export function fetchMyScheduleDates(token) {
  return request("/api/v1/phi/schedules/dates", token);
}

export function fetchMySchedule(token, planningDate) {
  return request(`/api/v1/phi/schedules/${planningDate}`, token);
}

export function fetchInspectionReport(token, taskId) {
  return request(`/api/v1/phi/tasks/${encodeURIComponent(taskId)}/inspection`, token);
}

export function startInspection(token, taskId) {
  return request(`/api/v1/phi/tasks/${encodeURIComponent(taskId)}/inspection/start`, token, {
    method: "POST",
  });
}

export function saveInspectionDraft(token, taskId, form) {
  return request(`/api/v1/phi/tasks/${encodeURIComponent(taskId)}/inspection/draft`, token, {
    method: "PUT",
    body: JSON.stringify(form),
  });
}

export function submitInspection(token, taskId, form) {
  return request(`/api/v1/phi/tasks/${encodeURIComponent(taskId)}/inspection/submit`, token, {
    method: "POST",
    body: JSON.stringify(form),
  });
}

export async function notifyPreventionTeam(token, phi, task, report) {
  const configuredUrl = process.env.EXPO_PUBLIC_PREVENTION_NOTIFY_URL?.trim();
  const notificationUrl = configuredUrl || (__DEV__
    ? `${API_BASE_URL}/api/v1/dev/prevention-notifications`
    : "");
  if (!notificationUrl) {
    throw new Error("Prevention notification service is not configured. Ask the Prevention team for its existing endpoint URL.");
  }
  if (!report?.report_id) {
    throw new Error("Save the inspection report before notifying the Prevention team.");
  }

  const form = report.form || {};
  const siteIssues = (form.breeding_sites || []).map((site) => {
    const observations = [
      site.site_type,
      site.standing_water === "Yes" ? "standing water" : "",
      site.larvae_pupae === "Yes" ? "larvae/pupae observed" : "",
      site.severity && site.severity !== "Not assessed" ? `${site.severity.toLowerCase()} severity` : "",
      site.count != null ? `${site.count} site(s)` : "",
    ].filter(Boolean);
    return observations.join(": ");
  }).filter(Boolean);
  const issueDescription = [
    ...siteIssues,
    form.breeding_sources_corrected === true ? "Breeding source corrected" : "",
    form.follow_up_required ? "Follow-up inspection requested" : "",
    form.environmental_assessment_complete ? "Environmental checklist completed" : "Environmental checklist incomplete",
  ].filter(Boolean).join("; ").slice(0, 600) || "Inspection report submitted; no specific environmental issue recorded.";

  let response;
  try {
    response = await fetch(notificationUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Idempotency-Key": report.report_id,
      },
      body: JSON.stringify({
        inspection_id: report.report_id,
        task_id: task.scenario_task_id || task.source_id,
        location: task.location_label || task.village_area || task.moh_area || task.location_id || "Location not recorded",
        inspection_date: form.inspection_date,
        phi_reference: phi.phi_id,
        issue_description: issueDescription,
        notification_timestamp: new Date().toISOString(),
      }),
    });
  } catch (error) {
    throw new Error(`Could not reach the Prevention notification service: ${error.message}`, { cause: error });
  }

  if (!response.ok) {
    const responseBody = await response.json().catch(() => ({}));
    throw new Error(responseBody.detail || `Prevention notification request failed (${response.status}).`);
  }
  return response.json().catch(() => ({}));
}