export const SEVERITY_LABELS = [
  "Informational",
  "Low",
  "Medium",
  "High",
  "Critical",
] as const;

export const THREAT_LABELS = [
  "Safe",
  "Low",
  "Medium",
  "High",
  "Critical",
] as const;

export function severityLabel(level: number | undefined | null) {
  if (level == null || level < 0 || level > 4) return "Unknown";
  return SEVERITY_LABELS[level];
}

export function threatLabel(level: number | undefined | null) {
  if (level == null || level < 0 || level > 4) return "Unknown";
  return THREAT_LABELS[level];
}

export function criticalityLabel(value: number | undefined | null) {
  if (value == null) return "Unknown";
  if (value >= 30) return "High";
  if (value >= 20) return "Normal";
  if (value >= 10) return "Low";
  return String(value);
}
