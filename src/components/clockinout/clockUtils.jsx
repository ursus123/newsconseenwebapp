import { format, differenceInMinutes, startOfWeek, endOfWeek, eachDayOfInterval, parseISO } from "date-fns";

export function todayStr() { return format(new Date(), "yyyy-MM-dd"); }
export function nowTimeStr() { return format(new Date(), "HH:mm"); }
export function fmtDuration(mins) {
  if (!mins || mins <= 0) return "0m";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export async function getLocationCoords() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 6000 }
    );
  });
}

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

export async function getLocationString(coords) {
  if (!coords) return null;
  try {
    const res = await fetch(`${RAILWAY_URL}/geo/reverse?lat=${coords.lat}&lon=${coords.lon}`);
    const data = await res.json();
    return data.display_name || `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`;
  } catch {
    return `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`;
  }
}

export function getWeekDays() {
  const now = new Date();
  const start = startOfWeek(now, { weekStartsOn: 1 });
  const end = endOfWeek(now, { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
}

// Group tasks by date, compute durations
export function buildDayRecords(tasks) {
  const byDate = {};
  tasks.forEach((t) => {
    const d = t.scheduled_date;
    if (!d) return;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(t);
  });

  return Object.entries(byDate).map(([date, dayTasks]) => {
    const sorted = [...dayTasks].sort((a, b) => (a.scheduled_time || "").localeCompare(b.scheduled_time || ""));
    const cin = sorted.find((t) => t.task_type === "clock_in");
    const cout = sorted.find((t) => t.task_type === "clock_out");

    let totalMins = null;
    if (cin && cout) {
      const inT = new Date(`${date}T${cin.scheduled_time}:00`);
      const outT = new Date(`${date}T${cout.scheduled_time}:00`);
      totalMins = differenceInMinutes(outT, inT);
    }

    // Break time
    let breakMins = 0;
    const breakStarts = sorted.filter((t) => t.task_type === "break_start");
    const breakEnds = sorted.filter((t) => t.task_type === "break_end");
    breakStarts.forEach((bs, i) => {
      const be = breakEnds[i];
      if (bs && be) {
        const bsT = new Date(`${date}T${bs.scheduled_time}:00`);
        const beT = new Date(`${date}T${be.scheduled_time}:00`);
        breakMins += differenceInMinutes(beT, bsT);
      }
    });

    const netMins = totalMins !== null ? Math.max(0, totalMins - breakMins) : null;
    const enterprise = cin?.enterprise || cout?.enterprise || sorted.find((t) => t.enterprise)?.enterprise;

    return { date, cin, cout, totalMins, breakMins, netMins, enterprise, tasks: sorted };
  });
}

// Offline queue helpers
export const OFFLINE_QUEUE_KEY = (email) => `offline_clock_queue_${email}`;
export function getOfflineQueue(email) {
  return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY(email)) || "[]");
}
export function addToOfflineQueue(email, action) {
  const q = getOfflineQueue(email);
  q.push({ ...action, queued_at: new Date().toISOString() });
  localStorage.setItem(OFFLINE_QUEUE_KEY(email), JSON.stringify(q));
}
export function clearOfflineQueue(email) {
  localStorage.removeItem(OFFLINE_QUEUE_KEY(email));
}

export const LAST_ENTERPRISE_KEY = (email) => `last_enterprise_${email}`;