export type TaskRecurrenceType = 'hebdomadaire' | 'programme' | 'mensuel' | 'trimestriel';
export type TaskPriority = 'haute' | 'normale' | 'basse';

export interface AgendaTask {
  id: string;
  title: string;
  description?: string;
  type: TaskRecurrenceType; // 'hebdomadaire' | 'programme' | 'mensuel' | 'trimestriel'

  // Scheduling details
  dueDate?: string; // YYYY-MM-DD (for 'programme')
  dueTime?: string; // HH:mm (e.g. '09:30')
  dayOfWeek?: number; // 1 = Lundi, 2 = Mardi, 3 = Mercredi, 4 = Jeudi, 5 = Vendredi, 6 = Samedi, 0 = Dimanche
  dayOfMonth?: number; // 1 to 31 (for 'mensuel' and 'trimestriel')
  monthOfQuarter?: number; // 1, 2, or 3 (for 'trimestriel')

  // Categorization & Priority
  priority: TaskPriority; // 'haute' | 'normale' | 'basse'
  category?: string; // 'Travail', 'Personnel', 'Client', 'Administratif', etc.

  // Completion State:
  // ABSOLUTE RULE: A task is NEVER auto-removed or hidden from active view until the user checks it as completed!
  isCompleted: boolean;
  completedAt?: number;

  // Metadata
  createdAt: number;
  updatedAt: number;
  linkedEmailId?: string;
  linkedEmailSubject?: string;
}
