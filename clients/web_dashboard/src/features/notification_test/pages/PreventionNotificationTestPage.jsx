import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { RefreshCw, FlaskConical } from "lucide-react";

const API_BASE = (import.meta.env.VITE_C3_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export default function PreventionNotificationTestPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/v1/dev/prevention-notifications`, {
        headers: { Accept: "application/json" },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || `Request failed (${response.status}).`);
      setNotifications(body.notifications || []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshOnMount = useEffectEvent(() => { refresh(); });
  useEffect(() => {
    const timer = setTimeout(refreshOnMount, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-borderLight pb-4">
        <div className="flex items-start gap-3">
          <FlaskConical className="mt-0.5 text-riskMedium" size={21} />
          <div>
            <h1 className="text-xl font-extrabold text-darkBase">Prevention Notification Test</h1>
            <p className="mt-1 text-sm text-textMuted">Temporary local receiver test. This is not the Prevention team’s dashboard.</p>
          </div>
        </div>
        <button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-md border border-borderLight bg-surface px-3 py-2 text-xs font-bold text-darkBase disabled:opacity-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </header>

      <section className="rounded-md border border-riskMedium/50 bg-amber-50/60 px-4 py-3 text-xs leading-5 text-darkBase">
        Local development only. The receiver stores minimal test notifications in MongoDB collection <code>prevention_notification_test_events</code>. Do not expose this page or endpoint as a production notification service.
      </section>

      <div className="flex items-center justify-between text-xs text-textMuted">
        <span>{notifications.length} persisted test notification{notifications.length === 1 ? "" : "s"}</span>
        {lastUpdated && <span>Updated {lastUpdated}</span>}
      </div>

      {error && <div role="alert" className="rounded-md border border-riskHigh bg-red-50 p-3 text-sm text-riskHigh">{error}</div>}
      {loading && notifications.length === 0 ? <p className="py-10 text-center text-sm text-textMuted">Checking local notification store…</p> : notifications.length === 0 ? (
        <p className="rounded-md border border-borderLight bg-surface px-4 py-10 text-center text-sm text-textMuted">No test notifications received yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-borderLight bg-surface">
          <table className="w-full min-w-[700px] border-collapse text-left text-sm">
            <thead className="border-b border-borderLight bg-background text-xs uppercase text-textMuted"><tr><th className="p-3">Received</th><th className="p-3">Inspection / task</th><th className="p-3">Location / date</th><th className="p-3">PHI</th><th className="p-3">Issue summary</th></tr></thead>
            <tbody className="divide-y divide-borderLight">
              {notifications.map((notification) => (
                <tr key={notification.inspection_id}>
                  <td className="whitespace-nowrap p-3 text-xs text-textMuted">{notification.received_at || notification.notification_timestamp}</td>
                  <td className="p-3"><div className="font-mono text-xs font-bold text-primary">{notification.inspection_id}</div><div className="mt-1 text-xs text-textMuted">{notification.task_id}</div></td>
                  <td className="p-3"><div className="font-semibold text-darkBase">{notification.location}</div><div className="mt-1 text-xs text-textMuted">{notification.inspection_date}</div></td>
                  <td className="p-3 text-xs font-semibold text-darkBase">{notification.phi_reference}</td>
                  <td className="max-w-sm whitespace-pre-wrap p-3 text-xs leading-5 text-darkBase">{notification.issue_description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
