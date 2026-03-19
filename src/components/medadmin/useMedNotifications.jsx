import { useEffect, useRef, useState } from "react";
import { format, differenceInMinutes } from "date-fns";
import { base44 } from "@/api/base44Client";

/**
 * Polls medication tasks every 60s and generates in-app notifications.
 * Escalation levels for missed doses:
 *  level 1 (>60 min overdue): amber
 *  level 2 (>120 min overdue): red, creates admin task
 *  level 3 (>240 min overdue): critical, undismissable
 */
export function useMedNotifications(user, enabled = true) {
  const [notifications, setNotifications] = useState([]);
  const [snoozedTasks, setSnoozedTasks] = useState({});
  const [criticalMissed, setCriticalMissed] = useState([]); // level 3
  const seenRef = useRef(new Set());
  const level2CreatedRef = useRef(new Set()); // track tasks we've auto-created

  function buildKey(task, type) {
    return `${task.id}:${type}`;
  }

  async function checkTasks() {
    if (!user?.email) return;
    const today = format(new Date(), "yyyy-MM-dd");
    const now = new Date();

    const tasks = await base44.entities.Task.filter({
      task_type: "medication_admin",
      status: "open",
      scheduled_date: today,
    });

    const newNotifs = [];
    const criticals = [];

    for (const task of tasks) {
      if (!task.scheduled_time) continue;
      if (task.outcome && task.outcome !== "pending") continue; // already recorded

      const snoozedUntil = snoozedTasks[task.id];
      if (snoozedUntil && now.getTime() < snoozedUntil) continue;

      const scheduled = new Date(`${task.scheduled_date}T${task.scheduled_time}`);
      const diffMs = scheduled - now;
      const diffMin = diffMs / 60000;
      const overdueMins = Math.abs(differenceInMinutes(now, scheduled));

      const isOverdue = diffMs < 0;
      const isDueSoon = diffMin >= 0 && diffMin <= 10;

      if (isOverdue) {
        // Level 3: >= 4 hours
        if (overdueMins >= 240) {
          criticals.push({
            id: buildKey(task, "critical"),
            type: "critical",
            escalationLevel: 3,
            taskId: task.id,
            title: task.title || "Medication",
            client: task.related_person || "Unknown client",
            scheduledTime: task.scheduled_time,
            overdueMins,
            createdAt: new Date(),
          });
        }

        // Level 2: >= 2 hours — create admin task once
        if (overdueMins >= 120) {
          const l2Key = buildKey(task, "level2");
          if (!level2CreatedRef.current.has(l2Key)) {
            level2CreatedRef.current.add(l2Key);
            try {
              await base44.entities.Task.create({
                task_type: "other",
                title: `URGENT: Missed dose — ${task.title} for ${task.related_person || "patient"}`,
                priority: "urgent",
                status: "open",
                outcome: "pending",
                scheduled_date: today,
                internal_notes: `Auto-generated missed dose escalation. Original task ID: ${task.id}`,
              });
            } catch {}
          }
          const key = buildKey(task, "overdue_l2");
          if (!seenRef.current.has(key)) {
            seenRef.current.add(key);
            newNotifs.push({
              id: key,
              type: "overdue_l2",
              escalationLevel: 2,
              taskId: task.id,
              title: task.title || "Medication",
              client: task.related_person || "Unknown client",
              scheduledTime: task.scheduled_time,
              overdueMins,
              createdAt: new Date(),
            });
          }
        } else if (overdueMins >= 60) {
          // Level 1: >= 1 hour
          const key = buildKey(task, "overdue_l1");
          if (!seenRef.current.has(key)) {
            seenRef.current.add(key);
            newNotifs.push({
              id: key,
              type: "overdue_l1",
              escalationLevel: 1,
              taskId: task.id,
              title: task.title || "Medication",
              client: task.related_person || "Unknown client",
              scheduledTime: task.scheduled_time,
              overdueMins,
              createdAt: new Date(),
            });
          }
        } else {
          const key = buildKey(task, "overdue");
          if (!seenRef.current.has(key)) {
            seenRef.current.add(key);
            newNotifs.push({
              id: key,
              type: "overdue",
              escalationLevel: 0,
              taskId: task.id,
              title: task.title || "Medication",
              client: task.related_person || "Unknown client",
              scheduledTime: task.scheduled_time,
              overdueMins,
              createdAt: new Date(),
            });
          }
        }
      } else if (isDueSoon) {
        const key = buildKey(task, "due_soon");
        if (!seenRef.current.has(key)) {
          seenRef.current.add(key);
          newNotifs.push({
            id: key,
            type: "due_soon",
            escalationLevel: 0,
            taskId: task.id,
            title: task.title || "Medication",
            client: task.related_person || "Unknown client",
            scheduledTime: task.scheduled_time,
            overdueMins: 0,
            createdAt: new Date(),
          });
        }
      }
    }

    setCriticalMissed(criticals);

    if (newNotifs.length > 0) {
      setNotifications((prev) => [...newNotifs, ...prev].slice(0, 50));
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        newNotifs.forEach((n) => {
          new Notification(
            n.escalationLevel >= 2 ? "🔴 MISSED DOSE — Urgent" : n.type === "overdue" ? "⚠️ Overdue Medication" : "💊 Medication Due Soon",
            { body: `${n.title} for ${n.client} (scheduled ${n.scheduledTime})`, tag: n.id }
          );
        });
      }
    }
  }

  useEffect(() => {
    if (!enabled || !user) return;
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    checkTasks();
    const interval = setInterval(checkTasks, 60 * 1000);
    return () => clearInterval(interval);
  }, [user, enabled, snoozedTasks]);

  function dismiss(idOrTaskId) {
    setNotifications((prev) => prev.filter((n) => n.id !== idOrTaskId && n.taskId !== idOrTaskId));
  }
  function dismissAll() { setNotifications([]); }
  function snooze(taskId, minutes) {
    const snoozeUntil = new Date().getTime() + minutes * 60 * 1000;
    setSnoozedTasks((prev) => ({ ...prev, [taskId]: snoozeUntil }));
    dismiss(taskId);
    seenRef.current = new Set([...seenRef.current].filter((k) => !k.startsWith(taskId + ":")));
  }

  return { notifications, criticalMissed, dismiss, dismissAll, snooze };
}