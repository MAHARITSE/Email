import { AgendaTask, TaskRecurrenceType } from '../types/agenda';
import { ParsedEmail } from '../types/gmail';
import { getActiveAccountEmail } from './multiAccountService';
import { notifyAgendaEvent } from './notificationService';
import { notifyIfAuthError } from './gmailApi';

function getStorageKey(userEmail?: string): string {
  const activeEmail = (userEmail || getActiveAccountEmail() || '').trim().toLowerCase();
  if (activeEmail) {
    return `gmail_agenda_v3_${activeEmail}`;
  }
  return 'gmail_agenda_v3_default';
}

// Purge legacy merged/shared agenda storage once on load
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('gmail_agenda_tasks_v1');
  } catch {}
}

export const DAYS_OF_WEEK = [
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
  { value: 0, label: 'Dimanche' },
];

export const TASK_TYPES: { type: TaskRecurrenceType; label: string; description: string }[] = [
  {
    type: 'programme',
    label: 'Programmé',
    description: 'Tâche ponctuelle avec date et heure précises',
  },
  {
    type: 'hebdomadaire',
    label: 'Hebdomadaire',
    description: 'Tâche récurrente chaque semaine (ex. tous les lundis)',
  },
  {
    type: 'mensuel',
    label: 'Mensuel',
    description: 'Tâche récurrente chaque mois (ex. le 28 du mois)',
  },
  {
    type: 'trimestriel',
    label: 'Trimestriel',
    description: 'Tâche récurrente tous les 3 mois (ex. fin de trimestre)',
  },
];

const INITIAL_SEEDED_TASKS: AgendaTask[] = [
  {
    id: 'task_seed_1',
    title: 'Rapport hebdomadaire et revue des e-mails en attente',
    description: 'Vérifier la boîte de réception, répondre aux devis et archiver les échanges terminés.',
    type: 'hebdomadaire',
    dayOfWeek: 1, // Lundi
    dueTime: '09:00',
    priority: 'haute',
    category: 'Travail',
    isCompleted: false,
    createdAt: Date.now() - 3 * 86400000,
    updatedAt: Date.now() - 3 * 86400000,
  },
  {
    id: 'task_seed_2',
    title: 'Relance des dossiers clients et validation des bons de commande',
    description: 'Contacter les interlocuteurs pour confirmer les signatures de devis envoyés la semaine passée.',
    type: 'programme',
    dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Demain
    dueTime: '14:30',
    priority: 'haute',
    category: 'Client',
    isCompleted: false,
    createdAt: Date.now() - 2 * 86400000,
    updatedAt: Date.now() - 2 * 86400000,
  },
  {
    id: 'task_seed_3',
    title: 'Clôture comptable mensuelle et rapprochement bancaire',
    description: 'Regrouper les factures acquittées reçues par mail et préparer la déclaration mensuelle.',
    type: 'mensuel',
    dayOfMonth: 28,
    dueTime: '16:00',
    priority: 'normale',
    category: 'Finances',
    isCompleted: false,
    createdAt: Date.now() - 10 * 86400000,
    updatedAt: Date.now() - 10 * 86400000,
  },
  {
    id: 'task_seed_4',
    title: 'Audit trimestriel des objectifs et planification stratégique',
    description: 'Bilan trimestriel des performances commerciales, bilan e-mails et feuille de route Q4.',
    type: 'trimestriel',
    dayOfMonth: 15,
    monthOfQuarter: 3,
    dueTime: '10:00',
    priority: 'haute',
    category: 'Stratégie',
    isCompleted: false,
    createdAt: Date.now() - 25 * 86400000,
    updatedAt: Date.now() - 25 * 86400000,
  },
];

export function getAgendaTasks(userEmail?: string): AgendaTask[] {
  if (typeof window === 'undefined') return [];
  const key = getStorageKey(userEmail);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      // Clean slate per account - no shared or merged data!
      localStorage.setItem(key, JSON.stringify([]));
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.error('Error reading agenda tasks:', err);
  }
  return [];
}

export function clearAllAgendaTasksForAccount(userEmail?: string): void {
  if (typeof window === 'undefined') return;
  const key = getStorageKey(userEmail);
  try {
    localStorage.setItem(key, JSON.stringify([]));
    window.dispatchEvent(new CustomEvent('gmail-agenda-updated'));
  } catch (err) {
    console.error('Error clearing agenda tasks:', err);
  }
}

function persistTasks(tasks: AgendaTask[], userEmail?: string) {
  if (typeof window === 'undefined') return;
  const key = getStorageKey(userEmail);
  try {
    localStorage.setItem(key, JSON.stringify(tasks));
    window.dispatchEvent(new CustomEvent('gmail-agenda-updated'));
  } catch (err) {
    console.error('Error persisting agenda tasks:', err);
  }
}

export function saveAgendaTask(
  taskData: Partial<AgendaTask> & { title: string; type: TaskRecurrenceType },
  userEmail?: string
): AgendaTask {
  const current = getAgendaTasks(userEmail);
  const now = Date.now();

  if (taskData.id) {
    // Update existing task
    const index = current.findIndex((t) => t.id === taskData.id);
    if (index >= 0) {
      const updated: AgendaTask = {
        ...current[index],
        ...taskData,
        updatedAt: now,
      };
      current[index] = updated;
      persistTasks(current, userEmail);
      return updated;
    }
  }

  // Create new task
  const newTask: AgendaTask = {
    id: 'task_' + now + '_' + Math.random().toString(36).substring(2, 7),
    title: taskData.title.trim(),
    description: taskData.description?.trim() || '',
    type: taskData.type,
    dueDate: taskData.dueDate || '',
    dueTime: taskData.dueTime || '09:00',
    dayOfWeek: taskData.dayOfWeek !== undefined ? Number(taskData.dayOfWeek) : 1,
    dayOfMonth: taskData.dayOfMonth !== undefined ? Number(taskData.dayOfMonth) : 1,
    monthOfQuarter: taskData.monthOfQuarter !== undefined ? Number(taskData.monthOfQuarter) : 1,
    priority: taskData.priority || 'normale',
    category: taskData.category || 'Général',
    isCompleted: false,
    createdAt: now,
    updatedAt: now,
    linkedEmailId: taskData.linkedEmailId,
    linkedEmailSubject: taskData.linkedEmailSubject,
  };

  const next = [newTask, ...current];
  persistTasks(next, userEmail);
  return newTask;
}

/**
 * Toggle task completion.
 * Note: A task is NEVER removed automatically when overdue.
 * It is only marked as finished when explicitly toggled here!
 */
export function toggleTaskCompleted(
  taskId: string,
  forceStatus?: boolean,
  userEmail?: string
): AgendaTask | null {
  const current = getAgendaTasks(userEmail);
  const index = current.findIndex((t) => t.id === taskId);
  if (index < 0) return null;

  const target = current[index];
  const nextStatus = forceStatus !== undefined ? forceStatus : !target.isCompleted;

  const updated: AgendaTask = {
    ...target,
    isCompleted: nextStatus,
    completedAt: nextStatus ? Date.now() : undefined,
    updatedAt: Date.now(),
  };

  current[index] = updated;
  persistTasks(current, userEmail);
  return updated;
}

export function deleteAgendaTask(taskId: string, userEmail?: string): boolean {
  const current = getAgendaTasks(userEmail);
  const next = current.filter((t) => t.id !== taskId);
  if (next.length !== current.length) {
    persistTasks(next, userEmail);
    return true;
  }
  return false;
}

export function getPendingTasksCount(userEmail?: string): number {
  return getAgendaTasks(userEmail).filter((t) => !t.isCompleted).length;
}

/**
 * Checks if a task is overdue.
 * If a task is scheduled or recurrent and its due moment has passed,
 * it stays active and visible until the user explicitly checks it off!
 */
export function isTaskOverdue(task: AgendaTask): boolean {
  if (task.isCompleted) return false;
  if (!task.dueDate) return false;

  try {
    const timeStr = task.dueTime || '23:59';
    const dueDateTime = new Date(`${task.dueDate}T${timeStr}:00`);
    return dueDateTime.getTime() < Date.now();
  } catch {
    return false;
  }
}

/**
 * Formats a human-readable recurrence or schedule description for the task
 */
export function getTaskScheduleLabel(task: AgendaTask): string {
  const time = task.dueTime ? ` à ${task.dueTime}` : '';

  switch (task.type) {
    case 'programme': {
      if (!task.dueDate) return 'Programmé' + time;
      try {
        const [y, m, d] = task.dueDate.split('-');
        return `Le ${d}/${m}/${y}${time}`;
      } catch {
        return `Le ${task.dueDate}${time}`;
      }
    }
    case 'hebdomadaire': {
      const dayName = DAYS_OF_WEEK.find((d) => d.value === task.dayOfWeek)?.label || 'Jour';
      return `Chaque semaine (${dayName}${time})`;
    }
    case 'mensuel': {
      const day = task.dayOfMonth || 1;
      return `Chaque mois (le ${day}${time})`;
    }
    case 'trimestriel': {
      const day = task.dayOfMonth || 1;
      const mQ = task.monthOfQuarter ? `Mois ${task.monthOfQuarter}` : 'Fin';
      return `Chaque trimestre (${mQ}, le ${day}${time})`;
    }
    default:
      return 'Tâche';
  }
}

/**
 * Import Google Calendar events for a specific account via OAuth token
 * and save them into persistent agenda tasks for that account.
 */
export async function importGoogleCalendarEvents(
  token: string,
  userEmail?: string
): Promise<{ importedCount: number; errors?: string }> {
  if (!token) return { importedCount: 0, errors: 'Aucun jeton d\'accès fourni' };

  try {
    const timeMin = new Date(Date.now() - 7 * 86400000).toISOString();
    const timeMax = new Date(Date.now() + 60 * 86400000).toISOString();

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
      timeMin
    )}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=250`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        notifyIfAuthError(res.status, 'Jeton expiré ou permission Google Calendar non accordée.');
        return {
          importedCount: 0,
          errors: 'Jeton expiré ou permission Google Calendar non accordée. Veuillez vous reconnecter à Google.',
        };
      }
      return { importedCount: 0, errors: `Erreur Google Calendar (${res.status}): ${res.statusText}` };
    }

    const data = await res.json();
    const items = data.items || [];
    const currentTasks = getAgendaTasks(userEmail);
    const now = Date.now();
    let newCount = 0;

    for (const item of items) {
      if (!item.id || item.status === 'cancelled') continue;

      const gcalId = `gcal_${item.id}`;
      const startDateTime = item.start?.dateTime || item.start?.date;
      if (!startDateTime) continue;

      let dueDate = '';
      let dueTime = '09:00';

      if (startDateTime.includes('T')) {
        const parts = startDateTime.split('T');
        dueDate = parts[0];
        dueTime = parts[1].substring(0, 5);
      } else {
        dueDate = startDateTime;
      }

      const existingIndex = currentTasks.findIndex((t) => t.id === gcalId);
      const summaryTitle = item.summary ? item.summary.trim() : 'Événement Google Calendar';

      const taskObj: AgendaTask = {
        id: gcalId,
        title: summaryTitle,
        description: (item.location ? `Lieu : ${item.location}\n` : '') + (item.description || ''),
        type: 'programme',
        dueDate,
        dueTime,
        priority: 'normale',
        category: 'Google Calendar',
        isCompleted: false,
        createdAt: existingIndex >= 0 ? currentTasks[existingIndex].createdAt : now,
        updatedAt: now,
      };

      if (existingIndex >= 0) {
        currentTasks[existingIndex] = {
          ...currentTasks[existingIndex],
          ...taskObj,
          isCompleted: currentTasks[existingIndex].isCompleted,
        };
      } else {
        currentTasks.unshift(taskObj);
        newCount++;
      }
    }

    persistTasks(currentTasks, userEmail);
    return { importedCount: newCount };
  } catch (err: any) {
    console.error('Error importing Google Calendar events:', err);
    return { importedCount: 0, errors: err?.message || 'Échec de l\'import Google Calendar' };
  }
}

/**
 * Automatically scan parsed emails for calendar invites and save them to agenda
 */
export function importEmailCalendarInvites(emails: ParsedEmail[], userEmail?: string): number {
  if (!emails || emails.length === 0) return 0;
  const currentTasks = getAgendaTasks(userEmail);
  const existingIds = new Set(currentTasks.map((t) => t.linkedEmailId || t.id));
  const now = Date.now();
  let addedCount = 0;

  emails.forEach((em) => {
    if (existingIds.has(em.id)) return;

    const subject = (em.subject || '').toLowerCase();
    const isInvite =
      subject.includes('invitation') ||
      subject.includes('réunion') ||
      subject.includes('rendez-vous') ||
      subject.includes('rdv') ||
      subject.includes('webinar') ||
      subject.includes('convocation') ||
      subject.includes('meeting') ||
      em.attachments?.some((att) => att.filename.endsWith('.ics'));

    if (isInvite) {
      // Calculate due date (default to email date + 1 day if not explicit)
      const emailDate = new Date(Number(em.internalDate) || Date.now());
      const dueDateObj = new Date(emailDate.getTime() + 86400000);
      const dueDate = dueDateObj.toISOString().split('T')[0];

      const newTask: AgendaTask = {
        id: `email_invite_${em.id}`,
        title: em.subject || 'Rendez-vous depuis e-mail',
        description: `Invitations / RDV reçu de ${em.fromName || em.fromEmail}\n\n${(em.snippet || em.bodyText || '').slice(0, 150)}`,
        type: 'programme',
        dueDate,
        dueTime: '09:00',
        priority: 'haute',
        category: 'Invitation Mail',
        isCompleted: false,
        createdAt: now,
        updatedAt: now,
        linkedEmailId: em.id,
        linkedEmailSubject: em.subject,
      };

      currentTasks.unshift(newTask);
      existingIds.add(em.id);
      addedCount++;
    }
  });

  if (addedCount > 0) {
    persistTasks(currentTasks, userEmail);
  }
  return addedCount;
}

/**
 * Core Agenda Notification Engine:
 * - Checks tasks 2 days in advance (Day -2, Day -1, Day 0)
 * - Fires notifications 2 times per day: at 09:00 (9h) and 16:00 (16h)
 */
export function checkAndNotifyAgendaTasks(userEmail?: string): { notifiedCount: number } {
  if (typeof window === 'undefined') return { notifiedCount: 0 };

  const tasks = getAgendaTasks(userEmail);
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentHour = now.getHours();
  let notifiedCount = 0;

  // Identify active time slots (9h and/or 16h)
  const activeSlots: ('09:00' | '16:00')[] = [];
  if (currentHour >= 8 && currentHour < 14) {
    activeSlots.push('09:00');
  }
  if (currentHour >= 15 && currentHour < 21) {
    activeSlots.push('16:00');
  }
  // Fallback if checked outside exact window
  if (activeSlots.length === 0) {
    if (currentHour < 14) activeSlots.push('09:00');
    else activeSlots.push('16:00');
  }

  tasks.forEach((task) => {
    if (task.isCompleted) return;

    let targetDateStr = task.dueDate;

    if (!targetDateStr) {
      if (task.type === 'hebdomadaire' && task.dayOfWeek !== undefined) {
        const taskDay = task.dayOfWeek;
        const currentDay = now.getDay();
        let daysUntil = (taskDay - currentDay + 7) % 7;
        const targetDate = new Date(now.getTime() + daysUntil * 86400000);
        targetDateStr = targetDate.toISOString().split('T')[0];
      } else if (task.type === 'mensuel' && task.dayOfMonth !== undefined) {
        const targetDate = new Date(now.getFullYear(), now.getMonth(), task.dayOfMonth);
        if (targetDate.getTime() < now.getTime() - 86400000) {
          targetDate.setMonth(targetDate.getMonth() + 1);
        }
        targetDateStr = targetDate.toISOString().split('T')[0];
      }
    }

    if (!targetDateStr) return;

    try {
      const taskDate = new Date(`${targetDateStr}T00:00:00`);
      const todayDate = new Date(`${todayStr}T00:00:00`);

      const diffMs = taskDate.getTime() - todayDate.getTime();
      const diffDays = Math.round(diffMs / 86400000);

      // Notify if within 2 days (Day -2, Day -1, Day 0)
      if (diffDays >= 0 && diffDays <= 2) {
        activeSlots.forEach((slot) => {
          const trackerKey = `gmail_agenda_notif_${task.id}_${todayStr}_${slot}`;
          const alreadyNotified = localStorage.getItem(trackerKey);

          if (!alreadyNotified) {
            localStorage.setItem(trackerKey, 'true');
            notifiedCount++;

            const advanceText =
              diffDays === 0
                ? "Aujourd'hui"
                : diffDays === 1
                ? 'Demain (dans 1 jour)'
                : 'Rappel 2 jours en avance';

            const slotText = slot === '09:00' ? 'Rappel de 09:00' : 'Rappel de 16:00';

            notifyAgendaEvent({
              title: task.title,
              advanceText,
              time: task.dueTime || '09:00',
              description: task.description,
              slotText,
            });
          }
        });
      }
    } catch (err) {
      console.error('Error evaluating agenda task notification:', err);
    }
  });

  return { notifiedCount };
}
