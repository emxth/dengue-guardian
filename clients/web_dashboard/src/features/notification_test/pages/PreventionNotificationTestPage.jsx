import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { Activity, Bell, Clock3, Eye, MapPin, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";
import InspectionReportDetailsDialog from "../../../shared/components/InspectionReportDetailsDialog";

const API_BASE = (import.meta.env.VITE_C3_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export default function PreventionDashboard() {
  const [notifications, setNotifications] = useState([]);
  const [search, setSearch] = useState("");
  const [phiFilter, setPhiFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);

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

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = notifications.filter((item) => (item.received_at || item.notification_timestamp || "").slice(0, 10) === today).length;
  const phiCount = new Set(notifications.map((item) => item.phi_reference).filter(Boolean)).size;
  const filteredNotifications = notifications.filter((item) => {
    const query = search.trim().toLowerCase();
    const searchable = [item.task_id, item.location, item.issue_description, item.phi_reference].join(" ").toLowerCase();
    return (!query || searchable.includes(query)) && (!phiFilter || item.phi_reference === phiFilter);
  });
  const phiOptions = [...new Set(notifications.map((item) => item.phi_reference).filter(Boolean))].sort();

  function displayLocation(value) {
    return (value || "Area not recorded").replace(/\s*[-·]\s*\w+\s+point\s*$/i, "").trim() || "Area not recorded";
  }

  function displayTime(value) {
    if (!value) return "Time unavailable";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-borderLight pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-mintSurface text-primary"><ShieldCheck size={21} /></span>
          <div>
            <h1 className="text-xl font-extrabold text-darkBase">Prevention Dashboard</h1>
            <p className="mt-1 text-sm text-textMuted">PHI inspection notifications and field findings</p>
          </div>
        </div>
        <button type="button" onClick={refresh} disabled={loading} title="Refresh notifications" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-borderLight bg-surface text-textMuted hover:bg-background disabled:opacity-50">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </header>

      <div className="grid grid-cols-1 border-y border-borderLight bg-surface sm:grid-cols-3">
        <Metric icon={Bell} label="Notifications received" value={notifications.length} />
        <Metric icon={Clock3} label="Received today" value={todayCount} />
        <Metric icon={Users} label="PHIs represented" value={phiCount} />
      </div>

      {error && <div role="alert" className="rounded-md border border-riskHigh bg-red-50 p-3 text-sm text-riskHigh">{error}</div>}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-sm font-bold text-darkBase">Inspection inbox</h2><p className="mt-1 text-xs text-textMuted">{filteredNotifications.length} of {notifications.length} notifications{lastUpdated ? ` · Updated ${lastUpdated}` : ""}</p></div>
          <div className="flex flex-wrap gap-2">
            <label className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted" />
              <input aria-label="Search notifications" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search location, PHI, task…" className="h-9 w-60 rounded-md border border-borderLight bg-surface pl-8 pr-3 text-xs text-darkBase" />
            </label>
            <select aria-label="Filter by PHI" value={phiFilter} onChange={(event) => setPhiFilter(event.target.value)} className="h-9 rounded-md border border-borderLight bg-surface px-3 text-xs text-darkBase">
              <option value="">All PHIs</option>
              {phiOptions.map((phi) => <option key={phi} value={phi}>{phi}</option>)}
            </select>
          </div>
        </div>

        {loading && notifications.length === 0 ? <p className="py-12 text-center text-sm text-textMuted">Loading notifications…</p> : filteredNotifications.length === 0 ? (
          <div className="border-y border-borderLight bg-surface px-4 py-12 text-center"><Activity className="mx-auto mb-3 text-secondary" size={22} /><p className="text-sm font-semibold text-darkBase">{notifications.length ? "No notifications match these filters" : "No inspection notifications received"}</p><p className="mt-1 text-xs text-textMuted">Notifications appear here after a PHI submits an inspection and sends its issue summary.</p></div>
        ) : (
          <div className="overflow-x-auto border-y border-borderLight bg-surface">
            <table className="w-full min-w-[780px] border-collapse text-left text-sm">
              <thead className="border-b border-borderLight bg-background text-[11px] font-bold uppercase text-textMuted"><tr><th className="px-3 py-2.5">Received</th><th className="px-3 py-2.5">Inspection</th><th className="px-3 py-2.5">Location / date</th><th className="px-3 py-2.5">PHI</th><th className="px-3 py-2.5">Issue summary</th><th className="px-3 py-2.5">State</th></tr></thead>
              <tbody className="divide-y divide-borderLight">
                {filteredNotifications.map((notification) => (
                  <tr key={`${notification.task_id}-${notification.received_at || notification.notification_timestamp}`} className="align-top hover:bg-background/50">
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-textMuted">{displayTime(notification.received_at || notification.notification_timestamp)}</td>
                    <td className="px-3 py-3"><div className="text-xs font-semibold text-darkBase">Inspection report</div><div className="mt-1 text-xs text-textMuted">Task {notification.task_id}</div></td>
                    <td className="px-3 py-3"><div className="flex items-center gap-1.5 font-semibold text-darkBase"><MapPin size={13} className="shrink-0 text-secondary" />{displayLocation(notification.location)}</div><div className="mt-1 text-xs text-textMuted">{notification.inspection_date}</div></td>
                    <td className="px-3 py-3 text-xs font-semibold text-darkBase">{notification.phi_reference}</td>
                    <td className="max-w-md whitespace-pre-wrap px-3 py-3 text-xs leading-5 text-darkBase">{notification.issue_description}</td>
                    <td className="px-3 py-3"><div className="flex items-center gap-2"><span className="inline-flex items-center gap-1 rounded-full bg-mintSurface px-2 py-1 text-[10px] font-bold text-riskCleared"><span className="h-1.5 w-1.5 rounded-full bg-riskCleared" />Received</span><button type="button" onClick={() => setSelectedReport({ ...(notification.inspection_report || {}), issue_description: notification.issue_description, location: notification.location, phi_reference: notification.phi_reference, inspection_date: notification.inspection_date })} disabled={!notification.inspection_report} title={notification.inspection_report ? "View inspection report details" : "Full report details are unavailable"} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-borderLight text-primary hover:bg-background disabled:cursor-not-allowed disabled:opacity-40"><Eye size={14} /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selectedReport && <InspectionReportDetailsDialog report={selectedReport} onClose={() => setSelectedReport(null)} />}
    </main>
  );
}

function Metric({ icon: Icon, label, value }) {
  return <div className="flex items-center gap-3 border-b border-borderLight px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><span className="flex h-8 w-8 items-center justify-center rounded-md bg-mintSurface text-primary"><Icon size={16} /></span><div><p className="text-[10px] font-bold uppercase text-textMuted">{label}</p><p className="text-lg font-extrabold text-darkBase">{value}</p></div></div>;
}
