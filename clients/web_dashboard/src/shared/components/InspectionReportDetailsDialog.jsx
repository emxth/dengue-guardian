import { X } from "lucide-react";
import { formatLocation } from "../utils/locationDisplay";

const yesNo = (value) => value === true ? "Yes" : value === false ? "No" : "Not assessed";

export default function InspectionReportDetailsDialog({ report, onClose }) {
  const form = report?.form ?? {};
  const task = report?.task ?? {};
  const caseInfo = form.case_investigation ?? {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="inspection-report-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-borderLight bg-surface shadow-xl">
        <header className="sticky top-0 flex items-center justify-between border-b border-borderLight bg-surface px-5 py-4">
          <div>
            <h2 id="inspection-report-title" className="text-base font-bold text-darkBase">Inspection report details</h2>
            <p className="mt-1 text-xs text-textMuted">{task.scenario_task_id || task.source_id || "Inspection"} · {form.inspection_date || report?.inspection_date || "Date not recorded"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close details" className="flex h-8 w-8 items-center justify-center rounded-md border border-borderLight text-textMuted hover:bg-background"><X size={15} /></button>
        </header>
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Section title="Assignment"><Detail label="PHI" value={report?.phi_id || report?.phi_reference} /><Detail label="Task type" value={task.task_type} /><Detail label="Location" value={formatLocation(task.location_label, task.village_area, task.moh_area, report?.location)} /><Detail label="Case reference" value={form.patient_case_reference} /><Detail label="Time" value={form.inspection_time} /><Detail label="Submitted" value={report?.submitted_at} /></Section>
          <Section title="Case investigation"><Detail label="Status" value={caseInfo.investigation_status} /><Detail label="Onset" value={caseInfo.disease_onset_date} /><Detail label="Hospital" value={caseInfo.hospital_name} /><Detail label="Discharge" value={caseInfo.discharge_date} /><Detail label="Outcome" value={caseInfo.case_outcome} /><Detail label="Laboratory findings" value={caseInfo.laboratory_findings} /><Detail label="Advice" value={caseInfo.isolation_or_advice} /></Section>
          <Section title="Contacts"><Detail label="Household investigated" value={yesNo(form.household_contacts_investigated)} /><Detail label="Other contacts investigated" value={yesNo(form.other_contacts_investigated)} />{(form.contacts ?? []).map((contact, index) => <div key={index} className="border-t border-borderLight pt-2"><Detail label={`Contact ${index + 1}`} value={[contact.contact_type, contact.contact_reference, contact.age_years == null ? "" : `${contact.age_years} years`, contact.date_seen].filter(Boolean).join(" · ")} /><Detail label="Symptoms / observations" value={contact.symptoms || contact.observation} /></div>)}</Section>
          <Section title="Environmental findings"><Detail label="Assessment complete" value={yesNo(form.environmental_assessment_complete)} />{(form.breeding_sites ?? []).map((site, index) => <div key={index} className="border-t border-borderLight pt-2"><Detail label={`Site ${index + 1}`} value={`${site.site_type || "Site"} · ${site.location_description || "Location not recorded"}`} /><Detail label="Water / larvae" value={`${site.standing_water || "Not assessed"} / ${site.larvae_pupae || "Not assessed"}`} /><Detail label="Severity / count" value={`${site.severity || "Not assessed"} / ${site.count ?? "Not recorded"}`} /><Detail label="Observation" value={site.observation} /></div>)}<Detail label="Waste / storage" value={form.waste_or_storage_observations} /></Section>
          <Section title="Actions and follow-up"><Detail label="Issue summary" value={report?.issue_description} /><Detail label="Actions taken" value={form.actions_taken} /><Detail label="Sources corrected" value={yesNo(form.breeding_sources_corrected)} /><Detail label="Education provided" value={yesNo(form.prevention_education_provided)} /><Detail label="Follow-up required" value={form.follow_up_required ? "Yes" : "No"} /><Detail label="Follow-up date" value={form.follow_up_date} /><Detail label="Follow-up notes" value={form.follow_up_notes} /><Detail label="Additional notes" value={form.additional_notes} /></Section>
        </div>
      </section>
    </div>
  );
}

function Section({ title, children }) {
  return <section className="space-y-2 border-t border-borderLight pt-3 first:border-0 first:pt-0"><h3 className="text-xs font-bold uppercase text-textMuted">{title}</h3>{children}</section>;
}

function Detail({ label, value }) {
  if (value === undefined || value === null || value === "") return null;
  return <p className="whitespace-pre-wrap text-xs leading-5 text-darkBase"><span className="font-semibold text-textMuted">{label}: </span>{String(value)}</p>;
}
