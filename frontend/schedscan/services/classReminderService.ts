/**
 * Class Reminder Service (Local Notifications)
 *
 * Schedules local on-device notifications for upcoming classes.
 * This replaces the server-side cron job (send_class_reminders),
 * eliminating the need for a separate DigitalOcean Job container.
 *
 * How it works:
 * - When the user's active schedule loads, we cancel all previous reminders
 *   and schedule new ones for the next 7 days of classes.
 * - Each class gets a notification based on user's selected lead time.
 * - Reminders are rescheduled whenever the active schedule changes.
 * - Uses Expo's local scheduled notifications (not push), so it works
 *   offline and costs nothing.
 */

import * as Notifications from 'expo-notifications';
import { Course } from './courseService';
import { SavedSchedule } from './scheduleStorageService';

const DAYS_AHEAD_TO_SCHEDULE = 7;

// Category identifier for class reminders so we can cancel them selectively
const CLASS_REMINDER_CATEGORY = 'class-reminder';

/**
 * Map day codes (from OCR) to JS weekday numbers (0=Sunday, 6=Saturday).
 */
const dayCodeToNumbers = (dayCode: string): number[] => {
  if (!dayCode || dayCode.trim() === '') return [];

  const singleDayMap: Record<string, number> = {
    M: 1, T: 2, W: 3, TH: 4, F: 5, S: 6,
    SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
    MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4,
    FRIDAY: 5, SATURDAY: 6, SUNDAY: 0,
  };

  const multiDayMap: Record<string, number[]> = {
    MTH: [1, 4], TF: [2, 5], MW: [1, 3], TTH: [2, 4],
    MWF: [1, 3, 5], MTWTH: [1, 2, 3, 4], MTWTHF: [1, 2, 3, 4, 5],
  };

  const upper = dayCode.toUpperCase().trim();
  if (multiDayMap[upper]) return multiDayMap[upper];
  if (singleDayMap[upper] !== undefined) return [singleDayMap[upper]];
  return [];
};

/**
 * Parse a time string like "07:00AM" or "2:30 PM" → { hours, minutes } in 24h.
 */
const parseTime = (timeStr: string): { hours: number; minutes: number } | null => {
  if (!timeStr) return null;
  const match = timeStr.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  return { hours, minutes };
};

/**
 * Cancel all previously scheduled class reminders.
 */
export const cancelAllClassReminders = async (): Promise<void> => {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    const classReminders = all.filter(
      (n) => n.content.data?.category === CLASS_REMINDER_CATEGORY
    );

    for (const notif of classReminders) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }

    console.log(`[ClassReminder] Cancelled ${classReminders.length} scheduled reminders`);
  } catch (error) {
    console.error('[ClassReminder] Failed to cancel reminders:', error);
  }
};

/**
 * Schedule local notifications for all classes in the next N days.
 * Call this whenever the active schedule is loaded or changes.
 *
 * @param schedule - The active schedule with courses
 */
export const scheduleClassReminders = async (
  schedule: SavedSchedule | null,
  minutesBefore: number = 15,
): Promise<number> => {
  const reminderMinutesBefore = [5, 10, 15].includes(minutesBefore) ? minutesBefore : 15;

  // Always clear old reminders first
  await cancelAllClassReminders();

  if (!schedule || !schedule.courses || schedule.courses.length === 0) {
    console.log('[ClassReminder] No schedule/courses — skipped scheduling');
    return 0;
  }

  const now = new Date();
  let scheduledCount = 0;

  // For each of the next N days, check which courses fall on that weekday
  for (let dayOffset = 0; dayOffset < DAYS_AHEAD_TO_SCHEDULE; dayOffset++) {
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + dayOffset);
    const weekday = targetDate.getDay(); // 0=Sun

    for (const course of schedule.courses) {
      const courseDays = dayCodeToNumbers(course.day);
      if (!courseDays.includes(weekday)) continue;

      const parsed = parseTime(course.start_time);
      if (!parsed) continue;

      // Build the reminder trigger time (class start minus reminderMinutesBefore)
      const classTime = new Date(targetDate);
      classTime.setHours(parsed.hours, parsed.minutes, 0, 0);

      const reminderTime = new Date(classTime.getTime() - reminderMinutesBefore * 60 * 1000);

      // Skip if the reminder time is in the past
      if (reminderTime <= now) continue;

      const label = course.subject_name || course.subject_code;
      const locationText = course.location ? ` at ${course.location}` : '';

      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: label,
            body: `Starts in ${reminderMinutesBefore} minutes${locationText}`,
            sound: 'default',
            data: {
              category: CLASS_REMINDER_CATEGORY,
              type: 'class_reminder',
              subject_code: course.subject_code,
              course_id: course.id,
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: reminderTime,
          },
        });
        scheduledCount++;
      } catch (err) {
        console.warn(`[ClassReminder] Failed to schedule for ${course.subject_code}:`, err);
      }
    }
  }

  console.log(
    `[ClassReminder] Scheduled ${scheduledCount} reminders for the next ${DAYS_AHEAD_TO_SCHEDULE} days (${reminderMinutesBefore} minutes before class)`
  );

  return scheduledCount;
};

/**
 * Get count of currently scheduled class reminders (for debugging).
 */
export const getScheduledReminderCount = async (): Promise<number> => {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.filter((n) => n.content.data?.category === CLASS_REMINDER_CATEGORY).length;
};

export const classReminderService = {
  scheduleClassReminders,
  cancelAllClassReminders,
  getScheduledReminderCount,
};

export default classReminderService;
