/** Friendly relative time for the next review: "in 10 minutes", "tomorrow", "on Oct 30". */
export function formatWhen(d: Date, now = new Date()): string {
  const mins = Math.round((d.getTime() - now.getTime()) / 60_000);
  if (mins < 60) return `in ${Math.max(1, mins)} minutes`;
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const days = Math.floor((d.getTime() - startToday.getTime()) / 86_400_000);
  if (days === 0) return 'later today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  return `on ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}
