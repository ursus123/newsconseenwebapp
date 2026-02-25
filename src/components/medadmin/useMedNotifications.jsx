import { useEffect, useRef, useState } from "react";
import { format, isPast } from "date-fns";
import { base44 } from "@/api/base44Client";

/**
 * Polls medication tasks every 60 s and generates in-app notifications
 * for tasks that are due (within 10 min) or overdue.
 *
 * Returns: { notifications, dismiss, dismissAll }
 */
export function useMedNotifications(user, enabled = true) {
  const [notifications, setNotifications] = useState([]);
  const seenRef = useRef(new Set()); // track tasks we've already notified about

  function buildKey(task, type) {
    return `${task.id}:${type}`;
  }

  async function checkTasks() {
    if (!user?.email) return;
    const today = format(new Date(), "yyyy-MM-dd");
    const now = new Date();

    // Fetch all open med tasks assigned to current user for today
    const tasks = await base44.entities.Task.filter({
      task_type: "medication_admin",
      status: "open",
      scheduled_date: today,
    });

    const newNotifs = [];

    tasks.forEach((task) => {
      if (!task.scheduled_time) return;
      const scheduled = new Date(`${task.scheduled_date}T${task.scheduled_time}`);
      const diffMs = scheduled - now; // negative = overdue
      const diffMin = diffMs / 60000;

      const isOverdue = diffMs < 0;
      const isDueSoon = diffMin >= 0 && diffMin <= 10;

      if (isOverdue) {
        const key = buildKey(task, "overdue");
        if (!seenRef.current.has(key)) {
          seenRef.current.add(key);
          newNotifs.push({
            id: key,
            type: "overdue",
            taskId: task.id,
            title: task.title || "Medication",
            client: task.related_person || "Unknown client",
            scheduledTime: task.scheduled_time,
            createdAt: new Date(),
          });
        }
      } else if (isDueSoon) {
        const key = buildKey(task, "due_soon");
        if (!seenRef.current.has(key)) {
          seenRef.current.add(key);
          newNotifs.push({
            id: key,
            type: "due_soon",
            taskId: task.id,
            title: task.title || "Medication",
            client: task.related_person || "Unknown client",
            scheduledTime: task.scheduled_time,
            createdAt: new Date(),
          });
        }
      }
    });

    if (newNotifs.length > 0) {
      setNotifications((prev) => [...newNotifs, ...prev].slice(0, 50));

      // Browser notification (if permission granted)
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        newNotifs.forEach((n) => {
          new Notification(n.type === "overdue" ? "⚠️ Overdue Medication" : "💊 Medication Due Soon", {
            body: `${n.title} for ${n.client} (scheduled ${n.scheduledTime})`,
            tag: n.id,
          });
        });
      }
    }
  }

  useEffect(() => {
    if (!enabled || !user) return;

    // Request browser notification permission
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    checkTasks(); // immediate
    const interval = setInterval(checkTasks, 60 * 1000); // every 60s
    return () => clearInterval(interval);
  }, [user, enabled]);

  function dismiss(id) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  function dismissAll() {
    setNotifications([]);
  }

  return { notifications, dismiss, dismissAll };
}