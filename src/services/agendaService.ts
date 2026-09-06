import { AgendaTask, TaskRecurrenceType } from '../types/agenda';

const AGENDA_STORAGE_KEY = 'gmail_agenda_tasks_v1';

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

export function getAgendaTasks(): AgendaTask[] {
  if (typeof window === 'undefined') return INITIAL_SEEDED_TASKS;
  try {
    const raw = localStorage.getItem(AGENDA_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(AGENDA_STORAGE_KEY, JSON.stringify(INITIAL_SEEDED_TASKS));
      return INITIAL_SEEDED_TASKS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return INITIAL_SEEDED_TASKS;
  } catch (err) {
    console.error('Error reading agenda tasks:', err);
    return INITIAL_SEEDED_TASKS;
  }
}

function persistTasks(tasks: AgendaTask[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AGENDA_STORAGE_KEY, JSON.stringify(tasks));
    window.dispatchEvent(new CustomEvent('gmail-agenda-updated'));
  } catch (err) {
    console.error('Error persisting agenda tasks:', err);
  }
}

export function saveAgendaTask(
  taskData: Partial<AgendaTask> & { title: string; type: TaskRecurrenceType }
): AgendaTask {
  const current = getAgendaTasks();
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
      persistTasks(current);
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
  persistTasks(next);
  return newTask;
}

/**
 * Toggle task completion.
 * Note: A task is NEVER removed automatically when overdue.
 * It is only marked as finished when explicitly toggled here!
 */
export function toggleTaskCompleted(taskId: string, forceStatus?: boolean): AgendaTask | null {
  const current = getAgendaTasks();
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
  persistTasks(current);
  return updated;
}

export function deleteAgendaTask(taskId: string): boolean {
  const current = getAgendaTasks();
  const next = current.filter((t) => t.id !== taskId);
  if (next.length !== current.length) {
    persistTasks(next);
    return true;
  }
  return false;
}

export function getPendingTasksCount(): number {
  return getAgendaTasks().filter((t) => !t.isCompleted).length;
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
