/**
 * Job order priority levels for shop-floor assignment.
 * Higher numeric value = higher urgency. Existing rows default to 0 (Normal).
 */
export const JOB_PRIORITY = {
  Normal: 0,
  High: 1,
  Urgent: 2,
} as const;

export type JobPriorityValue = (typeof JOB_PRIORITY)[keyof typeof JOB_PRIORITY];

export const JOB_PRIORITY_OPTIONS: ReadonlyArray<{
  value: JobPriorityValue;
  label: string;
}> = [
  { value: JOB_PRIORITY.Normal, label: "Normal" },
  { value: JOB_PRIORITY.High, label: "High" },
  { value: JOB_PRIORITY.Urgent, label: "Urgent" },
];

export function getJobPriorityLabel(priority: number | null | undefined): string {
  const match = JOB_PRIORITY_OPTIONS.find((o) => o.value === priority);
  return match?.label ?? "Normal";
}

export function normalizeJobPriority(priority: number | null | undefined): JobPriorityValue {
  if (priority === JOB_PRIORITY.High || priority === JOB_PRIORITY.Urgent) {
    return priority;
  }
  return JOB_PRIORITY.Normal;
}
