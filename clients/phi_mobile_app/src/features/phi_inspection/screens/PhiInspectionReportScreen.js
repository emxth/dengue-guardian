import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DengueGuardianColors as colors } from "../../../shared/theme/colors";
import { fetchInspectionReport, notifyPreventionTeam, saveInspectionDraft, startInspection, submitInspection } from "../../../shared/api/phiScheduleApi";
import { readLocalInspectionDraft, removeLocalInspectionDraft, writeLocalInspectionDraft } from "../../../shared/api/inspectionDraftStorage";
import { hasNotifiedPreventionTeam, markPreventionNotificationSent } from "../../../shared/api/preventionNotificationStorage";

function createSubmissionId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 3) | 8).toString(16);
  });
}

function currentLocalDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function initialForm(task) {
  return {
    client_submission_id: createSubmissionId(),
    inspection_date: currentLocalDate(),
    inspection_time: "",
    patient_case_reference: task.case_id || task.source_id || "",
    case_investigation: {
      investigation_status: task.task_type === "Citizen Complaint" ? "Not applicable" : "Pending verification",
      disease_onset_date: "", hospital_name: "", discharge_date: "", laboratory_findings: "",
      case_outcome: "Unknown", isolation_or_advice: "",
    },
    household_contacts_investigated: null,
    other_contacts_investigated: null,
    contacts: [],
    environmental_assessment_complete: false,
    breeding_sites: [],
    waste_or_storage_observations: "",
    actions_taken: "",
    breeding_sources_corrected: null,
    prevention_education_provided: null,
    follow_up_required: false,
    follow_up_date: "",
    follow_up_notes: "",
    additional_notes: "",
    latitude: null,
    longitude: null,
  };
}

function Section({ title, children }) {
  return <View className="mb-4 rounded-lg border border-borderLight bg-surface p-4"><Text className="mb-3 text-sm font-bold text-darkBase">{title}</Text>{children}</View>;
}

function Field({ label, value, onChangeText, placeholder, multiline = false, keyboardType, editable = true }) {
  return (
    <View className="mb-3">
      <Text className="mb-1.5 text-xs font-semibold text-textMuted">{label}</Text>
      <TextInput value={value == null ? "" : String(value)} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textMuted} multiline={multiline} numberOfLines={multiline ? 3 : 1} keyboardType={keyboardType} editable={editable} textAlignVertical={multiline ? "top" : "center"} className={`rounded-md border border-borderLight bg-background px-3 py-2.5 text-sm text-darkBase ${multiline ? "min-h-20" : ""}`} />
    </View>
  );
}

function Choice({ label, value, options, onChange, disabled = false }) {
  return (
    <View className="mb-3">
      <Text className="mb-1.5 text-xs font-semibold text-textMuted">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => <TouchableOpacity key={option} disabled={disabled} onPress={() => onChange(option)} className={`rounded-md border px-3 py-2 ${value === option ? "border-primary bg-primary" : "border-borderLight bg-background"}`}><Text className={`text-xs font-semibold ${value === option ? "text-surface" : "text-darkBase"}`}>{option}</Text></TouchableOpacity>)}
      </View>
    </View>
  );
}

function YesNo({ label, value, onChange, disabled }) {
  const options = [true, false, null];
  const labels = ["Yes", "No", "Not assessed"];
  const selected = value === true ? "Yes" : value === false ? "No" : value === null ? "Not assessed" : undefined;
  return <Choice label={label} value={selected} options={labels} disabled={disabled} onChange={(valueLabel) => onChange(options[labels.indexOf(valueLabel)])} />;
}

function Summary({ label, value }) {
  return <View className="flex-row justify-between gap-3 py-1.5"><Text className="text-xs text-textMuted">{label}</Text><Text className="flex-1 text-right text-xs font-semibold text-darkBase">{value}</Text></View>;
}

function SecondaryButton({ label, icon, onPress }) {
  return <TouchableOpacity onPress={onPress} className="mb-3 min-h-10 flex-row items-center justify-center rounded-md border border-borderLight bg-surface px-3 py-2"><Ionicons name={icon} size={16} color={colors.primary} /><Text className="ml-2 text-xs font-bold text-primary">{label}</Text></TouchableOpacity>;
}

export default function PhiInspectionReportScreen({ token, phi, task, onBack, onSubmitted, onLogout }) {
  const taskId = task.scenario_task_id || task.source_id;
  const [form, setForm] = useState(() => initialForm(task));
  const [submittedReport, setSubmittedReport] = useState(null);
  const [reportHistory, setReportHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [notificationSent, setNotificationSent] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const readOnly = Boolean(submittedReport);

  const persistLocal = useCallback(async (nextForm) => {
    try {
      await writeLocalInspectionDraft(phi.phi_id, taskId, {
        form: nextForm,
        updated_at: new Date().toISOString(),
      });
    } catch {
      setNotice("Encrypted local draft could not be saved. Keep this form open and retry Save draft when connected.");
    }
  }, [phi.phi_id, taskId]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [local, remote] = await Promise.all([
          readLocalInspectionDraft(phi.phi_id, taskId).catch(() => null),
          fetchInspectionReport(token, taskId),
        ]);
        if (!active) return;
        if (remote.submitted_reports?.length) {
          setReportHistory(remote.submitted_reports);
          setSubmittedReport(remote.submitted_reports[0]);
          setForm(remote.submitted_reports[0].form);
        } else if (remote.draft?.form && (!local?.form || (remote.draft.updated_at || "") >= (local.updated_at || ""))) {
          setForm(remote.draft.form);
        } else if (local) {
          setForm(local.form || local);
          setNotice(remote.draft?.form
            ? "Recovered a newer encrypted device draft than the server draft. Save it when connected."
            : "Recovered the encrypted draft saved on this device.");
        }
      } catch (requestError) {
        if (!active) return;
        if (requestError.status === 401) {
          await onLogout();
          return;
        }
        const local = await readLocalInspectionDraft(phi.phi_id, taskId).catch(() => null);
        if (local) {
          setForm(local.form || local);
          setNotice("Offline mode: recovered this task’s encrypted draft. Reconnect before saving to the service or submitting.");
        } else {
          setError(requestError.message);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [onLogout, phi.phi_id, taskId, token]);

  useEffect(() => {
    let active = true;
    if (!submittedReport?.report_id) {
      setNotificationSent(false);
      setNotificationError("");
      return () => { active = false; };
    }
    hasNotifiedPreventionTeam(submittedReport.report_id)
      .then((sent) => { if (active) { setNotificationSent(sent); setNotificationError(""); } })
      .catch(() => { if (active) setNotificationSent(false); });
    return () => { active = false; };
  }, [submittedReport?.report_id]);

  useEffect(() => {
    if (loading || readOnly) return undefined;
    const timer = setTimeout(() => { persistLocal(form); }, 500);
    return () => clearTimeout(timer);
  }, [form, loading, persistLocal, readOnly]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const updateCase = (key, value) => setForm((current) => ({ ...current, case_investigation: { ...current.case_investigation, [key]: value } }));

  async function handleSaveDraft() {
    setSaving(true); setError(""); setNotice("");
    try {
      await saveInspectionDraft(token, taskId, form);
      await persistLocal(form);
      setNotice("Draft saved securely. Resume it later from this task.");
    } catch (requestError) {
      if (requestError.status === 401) await onLogout();
      else {
        await persistLocal(form);
        setError(`${requestError.message} The encrypted device draft is retained; retry when connected.`);
      }
    } finally { setSaving(false); }
  }

  async function handleSubmit() {
    setError("");
    if (!form.inspection_date) return setError("Enter the inspection date.");
    if (!form.case_investigation?.investigation_status) return setError("Select a case investigation status.");
    if (!form.environmental_assessment_complete) return setError("Complete the environmental checklist before submitting.");
    if (form.follow_up_required && !form.follow_up_date) return setError("Enter a follow-up date or turn off follow-up required.");
    setSubmitting(true);
    try {
      const result = await submitInspection(token, taskId, form);
      await removeLocalInspectionDraft(phi.phi_id, taskId).catch(() => {});
      setNotice("Inspection report saved successfully.");
      const nextReport = { report_id: result.report_id, report_status: "Submitted", form, submitted_at: result.submitted_at };
      setSubmittedReport(nextReport);
      setReportHistory((current) => [nextReport, ...current.filter((report) => report.report_id !== result.report_id)]);
      onSubmitted?.();
    } catch (requestError) {
      if (requestError.status === 401) await onLogout();
      else {
        await persistLocal(form);
        setError(`${requestError.message} Your submission ID is unchanged; retry safely when connected.`);
      }
    } finally { setSubmitting(false); }
  }

  async function beginFollowUp() {
    setError("");
    try {
      await startInspection(token, taskId);
      setForm(initialForm(task));
      setSubmittedReport(null);
      setNotice("A new follow-up report is ready. Earlier submitted reports remain unchanged.");
    } catch (requestError) {
      if (requestError.status === 401) await onLogout();
      else setError(requestError.message);
    }
  }

  async function handleNotifyPrevention() {
    if (!submittedReport?.report_id || notificationBusy || notificationSent) return;
    setNotificationBusy(true);
    setNotificationError("");
    try {
      const result = await notifyPreventionTeam(token, phi, task, submittedReport);
      const notifiedAt = result.notification_timestamp || new Date().toISOString();
      await markPreventionNotificationSent(submittedReport.report_id, notifiedAt);
      setNotificationSent(true);
      setNotificationError("");
    } catch (requestError) {
      setNotificationError(requestError.message);
    } finally {
      setNotificationBusy(false);
    }
  }

  function addContact() {
    update("contacts", [...form.contacts, { contact_type: "Household", contact_reference: "", age_years: null, date_seen: form.inspection_date, observation: "", fever_reported: null, symptoms: "" }]);
  }
  function patchContact(index, key, value) {
    update("contacts", form.contacts.map((contact, row) => row === index ? { ...contact, [key]: value } : contact));
  }
  function addSite() {
    update("breeding_sites", [...form.breeding_sites, { site_type: "Other", location_description: "", standing_water: "Not assessed", count: null, larvae_pupae: "Not assessed", severity: "Not assessed", source_corrected: null, waste_or_blockage: null, observation: "" }]);
  }
  function patchSite(index, key, value) {
    update("breeding_sites", form.breeding_sites.map((site, row) => row === index ? { ...site, [key]: value } : site));
  }

  if (loading) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color={colors.primary} /></View>;

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View className="mb-4 flex-row items-center gap-3">
        <TouchableOpacity accessibilityRole="button" onPress={onBack} className="h-10 w-10 items-center justify-center rounded-md border border-borderLight bg-surface"><Ionicons name="arrow-back" size={19} color={colors.primary} /></TouchableOpacity>
        <View className="flex-1"><Text className="text-lg font-extrabold text-darkBase">{readOnly ? "Inspection report" : "Field inspection"}</Text><Text className="mt-0.5 text-xs text-textMuted">{taskId} · {phi.phi_id}</Text></View>
        {readOnly && <Text className="text-xs font-bold text-riskCleared">SUBMITTED</Text>}
      </View>

      <Section title="Assigned task">
        <Summary label="Task / case ID" value={`${taskId}${task.case_id ? ` · ${task.case_id}` : ""}`} />
        <Summary label="Assigned PHI / range" value={`${phi.phi_id} · ${task.phi_range || phi.phi_range || "Not recorded"}`} />
        <Summary label="Appointment" value={`${task.start_time || ""}${task.end_time ? `–${task.end_time}` : ""}`} />
        <Summary label="Location" value={[task.location_label, task.village_area, task.moh_area].filter(Boolean).join(" · ") || "Not recorded"} />
      </Section>

      {readOnly && reportHistory.length > 1 && <Section title="Submitted report history">
        {reportHistory.map((report) => <TouchableOpacity key={report.report_id} onPress={() => { setSubmittedReport(report); setForm(report.form); }} className="mb-2 rounded-md border border-borderLight bg-background px-3 py-2"><Text className="text-xs font-bold text-primary">{report.form?.inspection_date || "Inspection date not recorded"}{report.report_id === reportHistory[0]?.report_id ? " · Latest" : ""}</Text><Text className="mt-1 text-[11px] text-textMuted">Submitted {report.submitted_at || "date unavailable"}</Text></TouchableOpacity>)}
      </Section>}

      <Section title="Inspection and case details">
        <Field label="Inspection date (YYYY-MM-DD)" value={form.inspection_date} editable={!readOnly} onChangeText={(value) => update("inspection_date", value)} placeholder="2026-07-17" />
        <Field label="Inspection time (HH:MM)" value={form.inspection_time} editable={!readOnly} onChangeText={(value) => update("inspection_time", value)} placeholder="09:30" />
        <Summary label="Case reference (from task)" value={form.patient_case_reference || task.case_id || task.source_id || "Not available"} />
        <Choice label="Case investigation status" value={form.case_investigation.investigation_status} options={["Suspected", "Confirmed", "Not confirmed", "Pending verification", "Not applicable"]} disabled={readOnly} onChange={(value) => updateCase("investigation_status", value)} />
        <Field label="Disease onset date (YYYY-MM-DD)" value={form.case_investigation.disease_onset_date} editable={!readOnly} onChangeText={(value) => updateCase("disease_onset_date", value)} />
        <Field label="Hospital, if known" value={form.case_investigation.hospital_name} editable={!readOnly} onChangeText={(value) => updateCase("hospital_name", value)} />
        <Field label="Discharge date (YYYY-MM-DD)" value={form.case_investigation.discharge_date} editable={!readOnly} onChangeText={(value) => updateCase("discharge_date", value)} />
        <Field label="Laboratory findings, if available" value={form.case_investigation.laboratory_findings} editable={!readOnly} multiline onChangeText={(value) => updateCase("laboratory_findings", value)} />
        <Choice label="Case outcome" value={form.case_investigation.case_outcome} options={["Ongoing", "Recovered", "Deceased", "Unknown", "Not applicable"]} disabled={readOnly} onChange={(value) => updateCase("case_outcome", value)} />
        <Field label="Isolation or advice recorded" value={form.case_investigation.isolation_or_advice} editable={!readOnly} multiline onChangeText={(value) => updateCase("isolation_or_advice", value)} />
      </Section>

      <Section title="Household and contact investigation">
        <YesNo label="Household contacts investigated" value={form.household_contacts_investigated} disabled={readOnly} onChange={(value) => update("household_contacts_investigated", value)} />
        <YesNo label="Other relevant contacts investigated" value={form.other_contacts_investigated} disabled={readOnly} onChange={(value) => update("other_contacts_investigated", value)} />
        {form.contacts.map((contact, index) => (
          <View key={`contact-${index}`} className="mb-3 rounded-md border border-borderLight bg-background p-3">
            <RowTitle title={`Contact ${index + 1}`} onRemove={!readOnly ? () => update("contacts", form.contacts.filter((_, row) => row !== index)) : undefined} />
            <Choice label="Contact category" value={contact.contact_type || "Household"} options={["Household", "Other relevant"]} disabled={readOnly} onChange={(value) => patchContact(index, "contact_type", value)} />
            <Field label="Minimum necessary reference / name" value={contact.contact_reference} editable={!readOnly} onChangeText={(value) => patchContact(index, "contact_reference", value)} />
            <Field label="Age in years" value={contact.age_years} editable={!readOnly} keyboardType="number-pad" onChangeText={(value) => patchContact(index, "age_years", value ? Number(value) : null)} />
            <Field label="Date seen (YYYY-MM-DD)" value={contact.date_seen} editable={!readOnly} onChangeText={(value) => patchContact(index, "date_seen", value)} />
            <YesNo label="Fever reported" value={contact.fever_reported} disabled={readOnly} onChange={(value) => patchContact(index, "fever_reported", value)} />
            <Field label="Symptoms / observation" value={contact.symptoms || contact.observation} editable={!readOnly} multiline onChangeText={(value) => patchContact(index, "symptoms", value)} />
          </View>
        ))}
        {!readOnly && <SecondaryButton label="Add contact" icon="person-add-outline" onPress={addContact} />}
      </Section>

      <Section title="Environmental and breeding-site inspection">
        <SwitchRow label="Environmental checklist completed" value={form.environmental_assessment_complete} disabled={readOnly} onChange={(value) => update("environmental_assessment_complete", value)} />
        {form.breeding_sites.map((site, index) => (
          <View key={`site-${index}`} className="mb-3 rounded-md border border-borderLight bg-background p-3">
            <RowTitle title={`Potential breeding site ${index + 1}`} onRemove={!readOnly ? () => update("breeding_sites", form.breeding_sites.filter((_, row) => row !== index)) : undefined} />
            <Choice label="Site type" value={site.site_type} options={["Water storage", "Discarded container", "Tire", "Coconut shell", "Drain or gutter", "Waste area", "Other"]} disabled={readOnly} onChange={(value) => patchSite(index, "site_type", value)} />
            <Field label="Site location / description" value={site.location_description} editable={!readOnly} onChangeText={(value) => patchSite(index, "location_description", value)} />
            <Choice label="Standing water" value={site.standing_water} options={["Yes", "No", "Not assessed"]} disabled={readOnly} onChange={(value) => patchSite(index, "standing_water", value)} />
            <Field label="Count, if countable" value={site.count} editable={!readOnly} keyboardType="number-pad" onChangeText={(value) => patchSite(index, "count", value ? Number(value) : null)} />
            <Choice label="Larvae / pupae observed" value={site.larvae_pupae} options={["Yes", "No", "Not assessed"]} disabled={readOnly} onChange={(value) => patchSite(index, "larvae_pupae", value)} />
            <Choice label="Observed risk severity" value={site.severity} options={["Low", "Medium", "High", "Not assessed"]} disabled={readOnly} onChange={(value) => patchSite(index, "severity", value)} />
            <YesNo label="This source removed or corrected" value={site.source_corrected} disabled={readOnly} onChange={(value) => patchSite(index, "source_corrected", value)} />
            <YesNo label="Waste or blocked drain" value={site.waste_or_blockage} disabled={readOnly} onChange={(value) => update("breeding_sites", form.breeding_sites.map((item, row) => row === index ? { ...item, waste_or_blockage: value } : item))} />
            <Field label="Other observation" value={site.observation} editable={!readOnly} multiline onChangeText={(value) => patchSite(index, "observation", value)} />
          </View>
        ))}
        {!readOnly && <SecondaryButton label="Add breeding site" icon="add-circle-outline" onPress={addSite} />}
        <Field label="Waste, containers, water storage and environment observations" value={form.waste_or_storage_observations} editable={!readOnly} multiline onChangeText={(value) => update("waste_or_storage_observations", value)} />
        <Field label="Actions taken during visit" value={form.actions_taken} editable={!readOnly} multiline onChangeText={(value) => update("actions_taken", value)} />
        <YesNo label="Breeding sources removed or corrected" value={form.breeding_sources_corrected} disabled={readOnly} onChange={(value) => update("breeding_sources_corrected", value)} />
        <YesNo label="Dengue-prevention education provided" value={form.prevention_education_provided} disabled={readOnly} onChange={(value) => update("prevention_education_provided", value)} />
      </Section>

      <Section title="Follow-up and notes">
        <SwitchRow label="Further inspection / follow-up required" value={form.follow_up_required} disabled={readOnly} onChange={(value) => update("follow_up_required", value)} />
        <Field label="Next follow-up date (YYYY-MM-DD)" value={form.follow_up_date} editable={!readOnly} onChangeText={(value) => update("follow_up_date", value)} />
        <Field label="Follow-up notes" value={form.follow_up_notes} editable={!readOnly} multiline onChangeText={(value) => update("follow_up_notes", value)} />
        <Field label="Additional PHI notes" value={form.additional_notes} editable={!readOnly} multiline onChangeText={(value) => update("additional_notes", value)} />
        <Text className="text-[11px] leading-4 text-textMuted">Photo and GPS capture are not available in this app build. Contact details are restricted to the assigned PHI and authorized supervisors.</Text>
      </Section>

      {!!notice && <Text className="mb-3 rounded-md border border-riskCleared bg-mintSurface p-3 text-xs text-darkBase">{notice}</Text>}
      {!!error && <Text accessibilityRole="alert" className="mb-3 rounded-md border border-riskHigh bg-red-50 p-3 text-xs text-riskHigh">{error}</Text>}
      {readOnly && <View className="mb-3 rounded-lg border border-borderLight bg-surface p-4">
        <Text className="mb-2 text-xs leading-5 text-textMuted">This sends a short issue summary and inspection reference only. Patient and contact details are not included.</Text>
        <TouchableOpacity accessibilityRole="button" disabled={notificationBusy || notificationSent} onPress={handleNotifyPrevention} className={`min-h-12 flex-row items-center justify-center rounded-md px-4 py-3 ${notificationSent ? "bg-mintSurface" : "bg-primary"}`}>
          {notificationBusy ? <ActivityIndicator color="#FFFFFF" /> : <><Ionicons name={notificationSent ? "checkmark-circle" : "notifications-outline"} size={18} color={notificationSent ? colors.riskCleared : "#FFFFFF"} /><Text className={`ml-2 text-sm font-bold ${notificationSent ? "text-riskCleared" : "text-surface"}`}>{notificationSent ? "Prevention team notified" : "Notify Prevention Team"}</Text></>}
        </TouchableOpacity>
        {!!notificationError && <Text accessibilityRole="alert" className="mt-2 text-xs leading-5 text-riskHigh">{notificationError}{notificationError.includes("not configured") ? " Set EXPO_PUBLIC_PREVENTION_NOTIFY_URL to the endpoint provided by the Prevention team." : " You can retry; repeated requests use the same report idempotency key."}</Text>}
      </View>}
      {!readOnly && <>
        <TouchableOpacity disabled={saving || submitting} onPress={handleSaveDraft} className="mb-2 min-h-12 flex-row items-center justify-center rounded-md border border-primary bg-surface px-4 py-3 disabled:opacity-50">
          {saving ? <ActivityIndicator color={colors.primary} /> : <><Ionicons name="save-outline" size={17} color={colors.primary} /><Text className="ml-2 text-sm font-bold text-primary">Save draft</Text></>}
        </TouchableOpacity>
        <TouchableOpacity disabled={saving || submitting} onPress={handleSubmit} className="min-h-12 flex-row items-center justify-center rounded-md bg-primary px-4 py-3 disabled:opacity-50">
          {submitting ? <ActivityIndicator color="#FFFFFF" /> : <><Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" /><Text className="ml-2 text-sm font-bold text-surface">Submit inspection</Text></>}
        </TouchableOpacity>
      </>}
      {readOnly && submittedReport?.report_id === reportHistory[0]?.report_id && submittedReport?.form?.follow_up_required && <TouchableOpacity onPress={beginFollowUp} className="min-h-12 flex-row items-center justify-center rounded-md border border-primary bg-surface px-4 py-3"><Ionicons name="repeat-outline" size={18} color={colors.primary} /><Text className="ml-2 text-sm font-bold text-primary">Record follow-up inspection</Text></TouchableOpacity>}
    </ScrollView>
  );
}

function SwitchRow({ label, value, disabled, onChange }) {
  return <View className="mb-3 flex-row items-center justify-between"><Text className="flex-1 pr-3 text-xs font-semibold text-textMuted">{label}</Text><Switch value={value} disabled={disabled} onValueChange={onChange} trackColor={{ true: colors.primary }} /></View>;
}

function RowTitle({ title, onRemove }) {
  return <View className="mb-2 flex-row items-center justify-between"><Text className="text-xs font-bold text-darkBase">{title}</Text>{onRemove && <TouchableOpacity onPress={onRemove}><Ionicons name="trash-outline" size={18} color={colors.riskHigh} /></TouchableOpacity>}</View>;
}
