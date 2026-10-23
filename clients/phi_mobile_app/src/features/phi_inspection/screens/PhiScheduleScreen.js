import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DengueGuardianColors as colors } from "../../../shared/theme/colors";
import { fetchMySchedule, fetchMyScheduleDates, startInspection } from "../../../shared/api/phiScheduleApi";
import PhiInspectionReportScreen from "./PhiInspectionReportScreen";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value) {
  const parsed = parseLocalDate(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function TaskRow({ task, onOpen }) {
  const taskId = task.scenario_task_id || task.source_id || "Inspection task";
  const complete = task.task_status === "Completed";
  const inProgress = task.task_status === "In Progress";
  const buttonLabel = complete ? "View report" : inProgress ? "Resume inspection" : "Start inspection";
  return (
    <View className="mb-3 rounded-lg border border-borderLight bg-surface p-4">
      <View className="mb-3 flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-xs font-bold text-primary">{taskId}</Text>
          <Text className="mt-1 text-sm font-bold text-darkBase">{task.task_type || "Inspection"}</Text>
        </View>
        {complete && <Text className="text-xs font-bold text-riskCleared">COMPLETED</Text>}
        {!complete && inProgress && <Text className="text-xs font-bold text-riskMedium">IN PROGRESS</Text>}
      </View>
      <View className="mb-3 flex-row items-center rounded-md bg-background px-3 py-2">
        <Ionicons name="time-outline" size={16} color={colors.primary} />
        <Text className="ml-2 text-sm font-bold text-darkBase">
          {task.start_time || "Time pending"}{task.end_time ? ` - ${task.end_time}` : ""}
        </Text>
      </View>
      <Info label="Location" value={task.location_label || task.village_area || task.location_id || "Not specified"} />
      <Info label="Village / area" value={[task.village_area, task.moh_area].filter(Boolean).join(" · ") || "Not specified"} />
      {!!task.phi_range && <Info label="PHI range" value={task.phi_range} />}
      <TouchableOpacity accessibilityRole="button" onPress={() => onOpen(task)} className="mt-3 min-h-11 flex-row items-center justify-center rounded-md bg-primary px-4 py-2.5">
        <Ionicons name={complete ? "document-text-outline" : "clipboard-outline"} size={17} color="#FFFFFF" />
        <Text className="ml-2 text-sm font-bold text-surface">{buttonLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function Info({ label, value }) {
  return <View className="flex-row justify-between gap-4 py-1"><Text className="text-xs text-textMuted">{label}</Text><Text className="flex-1 text-right text-xs font-semibold text-darkBase">{value}</Text></View>;
}

function ScheduleCalendar({ dates, selectedDate, visibleMonth, onMonthChange, onSelectDate }) {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const monthName = visibleMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const cells = useMemo(() => {
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const dayCount = new Date(year, month + 1, 0).getDate();
    return [
      ...Array(firstWeekday).fill(null),
      ...Array.from({ length: dayCount }, (_, index) => index + 1),
    ];
  }, [month, year]);
  const availableDates = new Set(dates);

  return (
    <View className="mb-4 rounded-lg border border-borderLight bg-surface p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => onMonthChange(new Date(year, month - 1, 1))} className="h-9 w-9 items-center justify-center rounded-md border border-borderLight bg-background"><Ionicons name="chevron-back" size={18} color={colors.primary} /></TouchableOpacity>
        <Text className="text-sm font-bold text-darkBase">{monthName}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next month" onPress={() => onMonthChange(new Date(year, month + 1, 1))} className="h-9 w-9 items-center justify-center rounded-md border border-borderLight bg-background"><Ionicons name="chevron-forward" size={18} color={colors.primary} /></TouchableOpacity>
      </View>
      <View className="mb-1 flex-row">
        {WEEKDAYS.map((day, index) => <Text key={`${day}-${index}`} className="w-[14.285%] py-2 text-center text-[11px] font-bold text-textMuted">{day}</Text>)}
      </View>
      <View className="flex-row flex-wrap">
        {cells.map((day, index) => {
          if (!day) return <View key={`empty-${index}`} className="w-[14.285%] p-1"><View className="h-10" /></View>;
          const key = dateKey(year, month, day);
          const hasSchedule = availableDates.has(key);
          const selected = key === selectedDate;
          return (
            <View key={key} className="w-[14.285%] p-1">
              <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected }} disabled={!hasSchedule} onPress={() => onSelectDate(key)} className={`h-10 items-center justify-center rounded-md border ${selected ? "border-primary bg-primary" : hasSchedule ? "border-secondary/60 bg-mintSurface" : "border-transparent bg-background"}`}>
                <Text className={`text-xs font-bold ${selected ? "text-surface" : hasSchedule ? "text-primary" : "text-textMuted"}`}>{day}</Text>
                {hasSchedule && <View className={`mt-0.5 h-1 w-1 rounded-full ${selected ? "bg-surface" : "bg-primary"}`} />}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
      <Text className="mt-2 text-[11px] text-textMuted">Highlighted dates have a confirmed schedule assigned to you.</Text>
    </View>
  );
}

export default function PhiScheduleScreen({ token, phi, onLogout }) {
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [schedule, setSchedule] = useState(null);
  const [activeTask, setActiveTask] = useState(null);
  const [loadingDates, setLoadingDates] = useState(true);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const selectedDateRef = useRef("");

  const loadDates = useCallback(async () => {
    setError("");
    try {
      const result = await fetchMyScheduleDates(token);
      const nextDates = result.dates || [];
      setDates(nextDates);
      const nextDate = selectedDateRef.current && nextDates.includes(selectedDateRef.current)
        ? selectedDateRef.current
        : nextDates[0] || "";
      selectedDateRef.current = nextDate;
      setSelectedDate(nextDate);
      if (nextDate) setVisibleMonth(parseLocalDate(nextDate));
    } catch (requestError) {
      if (requestError.status === 401) await onLogout();
      else setError(requestError.message);
    } finally { setLoadingDates(false); setRefreshing(false); }
  }, [onLogout, token]);

  useEffect(() => { loadDates(); }, [loadDates]);
  useEffect(() => {
    let active = true;
    if (!selectedDate) { setSchedule(null); return undefined; }
    setLoadingSchedule(true);
    setError("");
    fetchMySchedule(token, selectedDate)
      .then((result) => { if (active) setSchedule(result); })
      .catch(async (requestError) => {
        if (!active) return;
        setSchedule(null);
        if (requestError.status === 401) await onLogout();
        else setError(requestError.message);
      })
      .finally(() => { if (active) setLoadingSchedule(false); });
    return () => { active = false; };
  }, [onLogout, selectedDate, token]);

  async function openTask(task) {
    setError("");
    const taskId = task.scenario_task_id || task.source_id;
    let hasSubmittedReport = task.task_status === "Completed";
    if (!hasSubmittedReport) {
      try {
        const reportState = await fetchInspectionReport(token, taskId);
        hasSubmittedReport = Boolean(reportState.submitted_reports?.length);
      } catch (requestError) {
        if (requestError.status === 401) { await onLogout(); return; }
        if (requestError.status !== undefined && requestError.status >= 500) {
          setError(requestError.message);
          return;
        }
      }
    }
    if (!hasSubmittedReport) {
      try {
        await startInspection(token, taskId);
        setSchedule((current) => current ? {
          ...current,
          tasks: current.tasks.map((row) =>
            (row.scenario_task_id || row.source_id) === taskId
              ? { ...row, task_status: "In Progress" }
              : row
          ),
        } : current);
      } catch (requestError) {
        if (requestError.status === 401) { await onLogout(); return; }
        if (requestError.status !== undefined) { setError(requestError.message); return; }
      }
    }
    setActiveTask(task);
  }

  if (activeTask) {
    return <PhiInspectionReportScreen
      token={token}
      phi={phi}
      task={activeTask}
      onBack={() => setActiveTask(null)}
      onLogout={onLogout}
      onSubmitted={async () => {
        try {
          setSchedule(await fetchMySchedule(token, selectedDate));
        } catch (requestError) {
          setError(requestError.message);
        }
        await loadDates();
      }}
    />;
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 16, paddingBottom: 36 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadDates(); }} tintColor={colors.primary} />}>
      <View className="mb-5 flex-row items-center justify-between gap-3">
        <View className="flex-1"><Text className="text-xl font-extrabold text-darkBase">My Schedule</Text><Text className="mt-1 text-xs text-textMuted">{phi.display_name || phi.phi_id}{phi.phi_range ? ` · ${phi.phi_range}` : ""}</Text></View>
        <TouchableOpacity accessibilityRole="button" onPress={onLogout} className="flex-row items-center rounded-md border border-borderLight bg-surface px-3 py-2"><Ionicons name="log-out-outline" size={16} color={colors.textMuted} /><Text className="ml-1.5 text-xs font-bold text-textMuted">Sign out</Text></TouchableOpacity>
      </View>

      {loadingDates ? <ActivityIndicator className="py-8" color={colors.primary} /> : dates.length === 0 ? (
        <View className="mb-4 rounded-lg border border-borderLight bg-surface p-4"><Text className="text-sm leading-5 text-textMuted">No confirmed PHI schedule has been released to your account yet.</Text></View>
      ) : (
        <ScheduleCalendar dates={dates} selectedDate={selectedDate} visibleMonth={visibleMonth} onMonthChange={setVisibleMonth} onSelectDate={(date) => { selectedDateRef.current = date; setSelectedDate(date); }} />
      )}

      {!!error && <Text accessibilityRole="alert" className="mb-4 rounded-md border border-riskHigh bg-red-50 p-3 text-sm text-riskHigh">{error}</Text>}
      {loadingSchedule ? <ActivityIndicator className="py-8" color={colors.primary} /> : schedule ? (
        <>
          <View className="mb-3 flex-row items-center justify-between"><Text className="text-base font-bold text-darkBase">{formatDate(schedule.planning_date)}</Text><Text className="text-xs font-semibold text-primary">{schedule.tasks.length} assigned tasks</Text></View>
          {schedule.tasks.map((task, index) => <TaskRow key={task.scenario_task_id || task.source_id || index} task={task} onOpen={openTask} />)}
        </>
      ) : !error && !loadingDates && dates.length > 0 ? <Text className="py-6 text-center text-sm text-textMuted">Select a highlighted date to view your assigned tasks.</Text> : null}
    </ScrollView>
  );
}
