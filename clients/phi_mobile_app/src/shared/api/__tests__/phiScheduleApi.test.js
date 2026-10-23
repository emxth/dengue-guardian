import { notifyPreventionTeam } from "../phiScheduleApi";

describe("notifyPreventionTeam", () => {
  const originalUrl = process.env.EXPO_PUBLIC_PREVENTION_NOTIFY_URL;
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_PREVENTION_NOTIFY_URL;
    else process.env.EXPO_PUBLIC_PREVENTION_NOTIFY_URL = originalUrl;
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  const report = {
    report_id: "saved-report-123",
    form: {
      inspection_date: "2026-10-23",
      environmental_assessment_complete: true,
      patient_case_reference: "PATIENT-SECRET",
      additional_notes: "SENSITIVE-FREE-TEXT",
      contacts: [{ contact_reference: "CONTACT-SECRET" }],
      breeding_sites: [{
        site_type: "Tire",
        location_description: "Back garden",
        standing_water: "Yes",
        larvae_pupae: "Yes",
        severity: "High",
        count: 2,
      }],
    },
  };
  const task = {
    scenario_task_id: "TASK-01",
    source_id: "CASE-SECRET",
    location_label: "Area 4",
    village_area: "Village A",
  };
  const phi = { phi_id: "PHI01" };

  test("posts only minimal inspection metadata and uses report ID for idempotency", async () => {
    process.env.EXPO_PUBLIC_PREVENTION_NOTIFY_URL = "https://prevention.example/receiver";
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 202, json: async () => ({ accepted: true }) });

    const response = await notifyPreventionTeam("token-value", phi, task, report);
    const [url, options] = global.fetch.mock.calls[0];
    const payload = JSON.parse(options.body);

    expect(response).toEqual({ accepted: true });
    expect(url).toBe("https://prevention.example/receiver");
    expect(options.headers["Idempotency-Key"]).toBe("saved-report-123");
    expect(options.headers.Authorization).toBe("Bearer token-value");
    expect(payload).toEqual(expect.objectContaining({
      inspection_id: "saved-report-123",
      task_id: "TASK-01",
      location: "Area 4",
      inspection_date: "2026-10-23",
      phi_reference: "PHI01",
      notification_timestamp: expect.any(String),
    }));
    expect(payload.issue_description).toContain("larvae/pupae observed");
    expect(JSON.stringify(payload)).not.toContain("PATIENT-SECRET");
    expect(JSON.stringify(payload)).not.toContain("CONTACT-SECRET");
    expect(JSON.stringify(payload)).not.toContain("SENSITIVE-FREE-TEXT");
    expect(JSON.stringify(payload)).not.toContain("Back garden");
    expect(JSON.stringify(payload)).not.toContain("CASE-SECRET");
  });

  test("retry uses the same report ID as idempotency key", async () => {
    process.env.EXPO_PUBLIC_PREVENTION_NOTIFY_URL = "https://prevention.example/receiver";
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ accepted: true }) });

    await notifyPreventionTeam("token-value", phi, task, report);
    await notifyPreventionTeam("token-value", phi, task, report);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls.map(([, options]) => options.headers["Idempotency-Key"]))
      .toEqual(["saved-report-123", "saved-report-123"]);
  });

  test("uses the explicitly named local test receiver in Expo development mode", async () => {
    delete process.env.EXPO_PUBLIC_PREVENTION_NOTIFY_URL;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 202, json: async () => ({ accepted: true }) });

    await notifyPreventionTeam("token-value", phi, task, report);

    expect(global.fetch.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/dev/prevention-notifications");
  });

  test("does not notify before a report has been saved", async () => {
    process.env.EXPO_PUBLIC_PREVENTION_NOTIFY_URL = "https://prevention.example/receiver";
    global.fetch = jest.fn();

    await expect(notifyPreventionTeam("token-value", phi, task, { form: report.form }))
      .rejects.toThrow(/save the inspection report/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("surfaces receiver failure so the PHI can retry", async () => {
    process.env.EXPO_PUBLIC_PREVENTION_NOTIFY_URL = "https://prevention.example/receiver";
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ detail: "Receiver unavailable" }) });

    await expect(notifyPreventionTeam("token-value", phi, task, report))
      .rejects.toThrow("Receiver unavailable");
  });
});
