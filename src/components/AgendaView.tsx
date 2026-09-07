import React, { useState, useEffect, useMemo } from 'react';
import {
  CalendarDays,
  CalendarClock,
  Repeat,
  Layers,
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Trash2,
  Edit2,
  Search,
  Filter,
  X,
  Sparkles,
  Info,
  Calendar,
  Check,
  Tag,
} from 'lucide-react';
import { AgendaTask, TaskRecurrenceType, TaskPriority } from '../types/agenda';
import {
  getAgendaTasks,
  saveAgendaTask,
  toggleTaskCompleted,
  deleteAgendaTask,
  isTaskOverdue,
  getTaskScheduleLabel,
  DAYS_OF_WEEK,
  TASK_TYPES,
} from '../services/agendaService';
import { useTheme } from '../context/ThemeContext';

interface AgendaViewProps {
  onBackToMailbox?: () => void;
  initialNewTaskData?: Partial<AgendaTask>;
}

export const AgendaView: React.FC<AgendaViewProps> = ({
  onBackToMailbox,
  initialNewTaskData,
}) => {
  const { isDark } = useTheme();
  const [tasks, setTasks] = useState<AgendaTask[]>(() => getAgendaTasks());
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all' | 'completed'>('pending');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal for Create/Edit Task
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<AgendaTask | null>(null);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<TaskRecurrenceType>('hebdomadaire');
  const [formDueDate, setFormDueDate] = useState('');
  const [formDueTime, setFormDueTime] = useState('09:00');
  const [formDayOfWeek, setFormDayOfWeek] = useState<number>(1);
  const [formDayOfMonth, setFormDayOfMonth] = useState<number>(1);
  const [formMonthOfQuarter, setFormMonthOfQuarter] = useState<number>(1);
  const [formPriority, setFormPriority] = useState<TaskPriority>('normale');
  const [formCategory, setFormCategory] = useState('Travail');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((c) => (c === msg ? null : c));
    }, 3500);
  };

  // Sync when tasks are updated anywhere
  useEffect(() => {
    const handleUpdate = () => {
      setTasks(getAgendaTasks());
    };
    window.addEventListener('gmail-agenda-updated', handleUpdate);
    return () => window.removeEventListener('gmail-agenda-updated', handleUpdate);
  }, []);

  // Handle open with initial data if passed
  useEffect(() => {
    if (initialNewTaskData) {
      openCreateModal(initialNewTaskData);
    }
  }, [initialNewTaskData]);

  const openCreateModal = (prefill?: Partial<AgendaTask>) => {
    setEditingTask(null);
    setFormTitle(prefill?.title || '');
    setFormDescription(prefill?.description || '');
    setFormType(prefill?.type || 'programme');
    setFormDueDate(
      prefill?.dueDate || new Date(Date.now() + 86400000).toISOString().split('T')[0]
    );
    setFormDueTime(prefill?.dueTime || '09:00');
    setFormDayOfWeek(prefill?.dayOfWeek !== undefined ? prefill.dayOfWeek : 1);
    setFormDayOfMonth(prefill?.dayOfMonth !== undefined ? prefill.dayOfMonth : 1);
    setFormMonthOfQuarter(prefill?.monthOfQuarter !== undefined ? prefill.monthOfQuarter : 1);
    setFormPriority(prefill?.priority || 'normale');
    setFormCategory(prefill?.category || 'Travail');
    setIsModalOpen(true);
  };

  const openEditModal = (task: AgendaTask) => {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormDescription(task.description || '');
    setFormType(task.type);
    setFormDueDate(task.dueDate || '');
    setFormDueTime(task.dueTime || '09:00');
    setFormDayOfWeek(task.dayOfWeek !== undefined ? task.dayOfWeek : 1);
    setFormDayOfMonth(task.dayOfMonth !== undefined ? task.dayOfMonth : 1);
    setFormMonthOfQuarter(task.monthOfQuarter !== undefined ? task.monthOfQuarter : 1);
    setFormPriority(task.priority);
    setFormCategory(task.category || 'Travail');
    setIsModalOpen(true);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    saveAgendaTask({
      id: editingTask ? editingTask.id : undefined,
      title: formTitle.trim(),
      description: formDescription.trim(),
      type: formType,
      dueDate: formType === 'programme' ? formDueDate : undefined,
      dueTime: formDueTime,
      dayOfWeek: formType === 'hebdomadaire' ? formDayOfWeek : undefined,
      dayOfMonth: formType === 'mensuel' || formType === 'trimestriel' ? formDayOfMonth : undefined,
      monthOfQuarter: formType === 'trimestriel' ? formMonthOfQuarter : undefined,
      priority: formPriority,
      category: formCategory.trim() || 'Travail',
      linkedEmailId: editingTask?.linkedEmailId,
      linkedEmailSubject: editingTask?.linkedEmailSubject,
    });

    setIsModalOpen(false);
    showToast(editingTask ? 'Tâche mise à jour avec succès' : 'Nouvelle tâche ajoutée à votre agenda');
  };

  const handleToggle = (task: AgendaTask) => {
    const updated = toggleTaskCompleted(task.id);
    if (updated) {
      if (updated.isCompleted) {
        showToast(`Tâche « ${updated.title.substring(0, 30)}... » cochée comme terminée`);
      } else {
        showToast(`Tâche remise en attente (« À faire »)`);
      }
    }
  };

  const handleDelete = (task: AgendaTask) => {
    if (window.confirm(`Confirmez-vous la suppression de la tâche « ${task.title} » ?`)) {
      deleteAgendaTask(task.id);
      showToast('Tâche supprimée');
    }
  };

  // Filtered tasks calculation
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Status filter
      if (statusFilter === 'pending' && t.isCompleted) return false;
      if (statusFilter === 'completed' && !t.isCompleted) return false;

      // Type filter
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;

      // Priority filter
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchDesc = t.description?.toLowerCase().includes(q);
        const matchCat = t.category?.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchCat) return false;
      }

      return true;
    });
  }, [tasks, statusFilter, typeFilter, priorityFilter, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const pending = tasks.filter((t) => !t.isCompleted);
    const completed = tasks.filter((t) => t.isCompleted);
    const overdue = pending.filter((t) => isTaskOverdue(t));
    const weekly = pending.filter((t) => t.type === 'hebdomadaire');
    const monthly = pending.filter((t) => t.type === 'mensuel');
    const quarterly = pending.filter((t) => t.type === 'trimestriel');
    const scheduled = pending.filter((t) => t.type === 'programme');

    return {
      total: tasks.length,
      pendingCount: pending.length,
      completedCount: completed.length,
      overdueCount: overdue.length,
      weeklyCount: weekly.length,
      monthlyCount: monthly.length,
      quarterlyCount: quarterly.length,
      scheduledCount: scheduled.length,
    };
  }, [tasks]);

  const getTypeBadge = (type: TaskRecurrenceType) => {
    switch (type) {
      case 'hebdomadaire':
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold ${
              isDark
                ? 'bg-cyan-950/80 border border-cyan-800/80 text-cyan-300'
                : 'bg-cyan-50 border border-cyan-200 text-cyan-800'
            }`}
          >
            <Repeat className="h-3 w-3 text-cyan-400" />
            <span>Hebdomadaire</span>
          </span>
        );
      case 'programme':
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold ${
              isDark
                ? 'bg-blue-950/80 border border-blue-800/80 text-blue-300'
                : 'bg-blue-50 border border-blue-200 text-blue-800'
            }`}
          >
            <CalendarClock className="h-3 w-3 text-blue-400" />
            <span>Programmé</span>
          </span>
        );
      case 'mensuel':
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold ${
              isDark
                ? 'bg-emerald-950/80 border border-emerald-800/80 text-emerald-300'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            }`}
          >
            <CalendarDays className="h-3 w-3 text-emerald-400" />
            <span>Mensuel</span>
          </span>
        );
      case 'trimestriel':
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold ${
              isDark
                ? 'bg-purple-950/80 border border-purple-800/80 text-purple-300'
                : 'bg-purple-50 border border-purple-200 text-purple-800'
            }`}
          >
            <Layers className="h-3 w-3 text-purple-400" />
            <span>Trimestriel</span>
          </span>
        );
    }
  };

  const getPriorityBadge = (priority: TaskPriority) => {
    switch (priority) {
      case 'haute':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/10 border border-rose-500/30 text-rose-400">
            Urgent
          </span>
        );
      case 'normale':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            Normal
          </span>
        );
      case 'basse':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-400 bg-slate-500/10 border border-slate-500/20">
            Basse
          </span>
        );
    }
  };

  return (
    <div
      id="agenda-main-view"
      className={`flex h-full flex-col overflow-hidden transition-colors ${
        isDark ? 'bg-[#05070A] text-slate-200' : 'bg-slate-50 text-slate-800'
      }`}
    >
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 rounded-xl px-4 py-2.5 text-xs font-mono font-medium shadow-2xl bg-cyan-600 text-white animate-in slide-in-from-top duration-200 flex items-center gap-2">
          <Check className="h-4 w-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Bar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b shrink-0 ${
          isDark ? 'border-slate-800 bg-[#080B10]' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-md">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold font-mono tracking-wide">
                Agenda & Tâches
              </h1>
              <span
                className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                  isDark
                    ? 'bg-cyan-950/60 border-cyan-800/80 text-cyan-300'
                    : 'bg-cyan-100 border-cyan-300 text-cyan-900'
                }`}
              >
                {stats.pendingCount} à faire
              </span>
            </div>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Gestionnaire de tâches récurrentes (hebdo, mensuel, trimestriel) et programmées
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onBackToMailbox && (
            <button
              type="button"
              onClick={onBackToMailbox}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                isDark
                  ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                  : 'border-slate-300 hover:bg-slate-100 text-slate-700'
              }`}
            >
              Retour à la boîte
            </button>
          )}

          <button
            type="button"
            id="agenda-create-task-btn"
            onClick={() => openCreateModal()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-cyan-600 hover:bg-cyan-500 text-white transition active:scale-95 shadow-md cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Nouvelle tâche</span>
          </button>
        </div>
      </div>

      {/* Persistence Guarantee Banner */}
      <div
        className={`px-6 py-2.5 border-b flex items-center justify-between gap-3 text-xs shrink-0 ${
          isDark
            ? 'bg-[#0A101D] border-cyan-900/40 text-cyan-300/90'
            : 'bg-cyan-50/80 border-cyan-200 text-cyan-900'
        }`}
      >
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-cyan-400 shrink-0" />
          <span className="leading-snug">
            <strong>Règle de conservation :</strong> Les tâches restent <strong>toujours actives et visibles</strong> dans votre liste tant que vous n'avez pas expressément coché qu'elles sont finies.
          </span>
        </div>
        {stats.overdueCount > 0 && (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300 shrink-0">
            ⚠️ {stats.overdueCount} en attente
          </span>
        )}
      </div>

      {/* Filters & Tabs Strip */}
      <div
        className={`px-6 py-3 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 ${
          isDark ? 'border-slate-800 bg-[#070A0F]' : 'border-slate-200 bg-white'
        }`}
      >
        {/* Status Tabs */}
        <div
          className={`flex items-center rounded-xl p-1 text-xs ${
            isDark ? 'bg-slate-900/90 border border-slate-800' : 'bg-slate-100 border border-slate-200'
          }`}
        >
          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-lg transition font-medium cursor-pointer ${
              statusFilter === 'pending'
                ? isDark
                  ? 'bg-slate-800 text-cyan-400 font-bold border border-cyan-500/30 shadow-xs'
                  : 'bg-white text-slate-900 font-bold shadow-xs'
                : isDark
                ? 'text-slate-400 hover:text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            À faire ({stats.pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition font-medium cursor-pointer ${
              statusFilter === 'all'
                ? isDark
                  ? 'bg-slate-800 text-cyan-400 font-bold border border-cyan-500/30 shadow-xs'
                  : 'bg-white text-slate-900 font-bold shadow-xs'
                : isDark
                ? 'text-slate-400 hover:text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Toutes ({stats.total})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('completed')}
            className={`px-3 py-1.5 rounded-lg transition font-medium cursor-pointer ${
              statusFilter === 'completed'
                ? isDark
                  ? 'bg-slate-800 text-cyan-400 font-bold border border-cyan-500/30 shadow-xs'
                  : 'bg-white text-slate-900 font-bold shadow-xs'
                : isDark
                ? 'text-slate-400 hover:text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Terminées ({stats.completedCount})
          </button>
        </div>

        {/* Recurrence & Type Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Type dropdown */}
          <div className="flex items-center gap-1 text-xs">
            <span className={`text-[11px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Type :
            </span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={`h-8 px-2 rounded-lg text-xs font-mono border outline-none cursor-pointer ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-slate-200'
                  : 'bg-white border-slate-300 text-slate-800'
              }`}
            >
              <option value="all">Tous les types</option>
              <option value="hebdomadaire">🔄 Hebdomadaire ({stats.weeklyCount})</option>
              <option value="programme">📅 Programmé ({stats.scheduledCount})</option>
              <option value="mensuel">📆 Mensuel ({stats.monthlyCount})</option>
              <option value="trimestriel">📊 Trimestriel ({stats.quarterlyCount})</option>
            </select>
          </div>

          {/* Priority dropdown */}
          <div className="flex items-center gap-1 text-xs">
            <span className={`text-[11px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Priorité :
            </span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className={`h-8 px-2 rounded-lg text-xs font-mono border outline-none cursor-pointer ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-slate-200'
                  : 'bg-white border-slate-300 text-slate-800'
              }`}
            >
              <option value="all">Toutes</option>
              <option value="haute">Urgent / Haute</option>
              <option value="normale">Normale</option>
              <option value="basse">Basse</option>
            </select>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search
              className={`absolute left-2.5 top-2.5 h-3.5 w-3.5 ${
                isDark ? 'text-slate-500' : 'text-slate-400'
              }`}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher une tâche..."
              className={`h-8 pl-8 pr-3 text-xs rounded-lg border outline-none w-48 sm:w-56 font-sans ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500 focus:border-cyan-400'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-600'
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Task List Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
        {filteredTasks.length === 0 ? (
          <div
            className={`flex flex-col items-center justify-center p-12 text-center rounded-2xl border ${
              isDark ? 'bg-[#080D1A]/50 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="p-4 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 mb-3">
              <CalendarDays className="h-8 w-8" />
            </div>
            <h3 className="text-sm font-bold font-mono uppercase tracking-wider mb-1">
              Aucune tâche correspondante
            </h3>
            <p className={`text-xs max-w-md ${isDark ? 'text-slate-400' : 'text-slate-500'} mb-4`}>
              {statusFilter === 'pending'
                ? "Toutes vos tâches sont actuellement accomplies ou aucun filtre ne correspond."
                : "Aucune tâche trouvée pour les critères sélectionnés."}
            </p>
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase bg-cyan-600 hover:bg-cyan-500 text-white transition active:scale-95 shadow-md cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Créer une tâche maintenant</span>
            </button>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const overdue = isTaskOverdue(task);
            const scheduleLabel = getTaskScheduleLabel(task);

            return (
              <div
                key={task.id}
                className={`group rounded-xl border p-4 transition-all duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  task.isCompleted
                    ? isDark
                      ? 'bg-slate-900/40 border-slate-800/80 opacity-70'
                      : 'bg-slate-100/70 border-slate-200 opacity-75'
                    : overdue
                    ? isDark
                      ? 'bg-amber-950/15 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.08)]'
                      : 'bg-amber-50/70 border-amber-300 shadow-xs'
                    : isDark
                    ? 'bg-[#080D1A] border-slate-800/90 hover:border-cyan-500/40 hover:shadow-md'
                    : 'bg-white border-slate-200 hover:border-cyan-300 hover:shadow-xs'
                }`}
              >
                {/* Left: Checkbox + Content */}
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() => handleToggle(task)}
                    className="mt-0.5 cursor-pointer text-slate-400 hover:text-cyan-400 transition transform active:scale-90 shrink-0"
                    title={
                      task.isCompleted
                        ? 'Cliquer pour marquer comme non finie'
                        : 'Cliquer pour marquer comme finie (retirera la tâche de la liste À faire)'
                    }
                  >
                    {task.isCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <Circle className="h-5 w-5 text-slate-400 hover:text-cyan-400" />
                    )}
                  </button>

                  {/* Details */}
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4
                        className={`text-sm font-semibold tracking-wide ${
                          task.isCompleted
                            ? 'line-through text-slate-500'
                            : isDark
                            ? 'text-white'
                            : 'text-slate-900'
                        }`}
                      >
                        {task.title}
                      </h4>

                      {/* Type Badge */}
                      {getTypeBadge(task.type)}

                      {/* Priority Badge */}
                      {getPriorityBadge(task.priority)}

                      {/* Overdue Badge if not completed */}
                      {overdue && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 border border-amber-500/40 text-amber-400">
                          <AlertTriangle className="h-3 w-3" />
                          <span>En retard (À finir)</span>
                        </span>
                      )}

                      {/* Completed Badge */}
                      {task.isCompleted && task.completedAt && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                          <Check className="h-3 w-3" />
                          <span>Terminé</span>
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    {task.description && (
                      <p
                        className={`text-xs line-clamp-2 ${
                          task.isCompleted
                            ? 'line-through text-slate-500'
                            : isDark
                            ? 'text-slate-300'
                            : 'text-slate-600'
                        }`}
                      >
                        {task.description}
                      </p>
                    )}

                    {/* Schedule info & category */}
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-mono">
                      <span
                        className={`flex items-center gap-1.5 ${
                          overdue ? 'text-amber-400 font-bold' : isDark ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        <Clock className="h-3 w-3" />
                        <span>{scheduleLabel}</span>
                      </span>

                      {task.category && (
                        <span
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${
                            isDark
                              ? 'bg-slate-900 border-slate-700 text-slate-400'
                              : 'bg-slate-100 border-slate-200 text-slate-600'
                          }`}
                        >
                          <Tag className="h-2.5 w-2.5" />
                          <span>{task.category}</span>
                        </span>
                      )}

                      {task.linkedEmailSubject && (
                        <span
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded border max-w-xs truncate ${
                            isDark
                              ? 'bg-cyan-950/40 border-cyan-800/60 text-cyan-300'
                              : 'bg-blue-50 border-blue-200 text-blue-800'
                          }`}
                          title={`E-mail associé : ${task.linkedEmailSubject}`}
                        >
                          <span>E-mail : {task.linkedEmailSubject}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditModal(task)}
                    className={`p-1.5 rounded-lg border transition cursor-pointer ${
                      isDark
                        ? 'border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white'
                        : 'border-slate-300 hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                    }`}
                    title="Modifier la tâche"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(task)}
                    className={`p-1.5 rounded-lg border transition cursor-pointer ${
                      isDark
                        ? 'border-slate-700 hover:bg-red-950/40 hover:border-red-500/40 text-slate-400 hover:text-red-400'
                        : 'border-slate-300 hover:bg-red-50 hover:border-red-300 text-slate-500 hover:text-red-600'
                    }`}
                    title="Supprimer la tâche"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: CREATE / EDIT TASK */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className={`w-full max-w-xl rounded-2xl border shadow-2xl p-6 transition-all ${
              isDark
                ? 'bg-[#090D18] border-cyan-500/30 text-white'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-inherit">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-600 text-white shadow-xs">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold font-mono uppercase tracking-wider">
                    {editingTask ? 'Modifier la tâche' : 'Nouvelle tâche agenda'}
                  </h3>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Active en permanence jusqu'à ce que vous la cochiez comme terminée
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitForm} className="space-y-4 pt-4">
              {/* Title */}
              <div className="space-y-1">
                <label className="text-xs font-mono font-bold text-slate-400 block">
                  Titre de la tâche *
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="ex. Préparer le rapport financier hebdomadaire..."
                  className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-sans ${
                    isDark
                      ? 'bg-[#05080F] border-slate-700 text-white placeholder-slate-500 focus:border-cyan-400'
                      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-600'
                  }`}
                />
              </div>

              {/* Task Type selector (Hebdomadaire, Programme, Mensuel, Trimestriel) */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-bold text-slate-400 block">
                  Type de tâche & Fréquence *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {TASK_TYPES.map((t) => (
                    <button
                      key={t.type}
                      type="button"
                      onClick={() => setFormType(t.type)}
                      className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                        formType === t.type
                          ? isDark
                            ? 'bg-cyan-950/70 border-cyan-400 text-cyan-300 font-bold shadow-xs'
                            : 'bg-cyan-50 border-cyan-600 text-cyan-900 font-bold shadow-xs'
                          : isDark
                          ? 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                      }`}
                    >
                      <div className="text-xs font-mono font-bold">{t.label}</div>
                      <div className="text-[10px] opacity-70 leading-tight mt-0.5 line-clamp-2">
                        {t.type === 'programme'
                          ? 'Ponctuel'
                          : t.type === 'hebdomadaire'
                          ? 'Chaque semaine'
                          : t.type === 'mensuel'
                          ? 'Chaque mois'
                          : 'Tous les 3 mois'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic schedule settings based on type */}
              <div
                className={`p-3.5 rounded-xl border space-y-3 ${
                  isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                {/* Case 1: Programmé (date ponctuelle) */}
                {formType === 'programme' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-mono text-slate-400 block">
                        Date d'échéance :
                      </label>
                      <input
                        type="date"
                        required
                        value={formDueDate}
                        onChange={(e) => setFormDueDate(e.target.value)}
                        className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none font-mono ${
                          isDark
                            ? 'bg-[#05080F] border-slate-700 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-mono text-slate-400 block">
                        Heure :
                      </label>
                      <input
                        type="time"
                        value={formDueTime}
                        onChange={(e) => setFormDueTime(e.target.value)}
                        className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none font-mono ${
                          isDark
                            ? 'bg-[#05080F] border-slate-700 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>
                  </div>
                )}

                {/* Case 2: Hebdomadaire (jour de la semaine) */}
                {formType === 'hebdomadaire' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-mono text-slate-400 block">
                        Jour de la semaine récurrent :
                      </label>
                      <select
                        value={formDayOfWeek}
                        onChange={(e) => setFormDayOfWeek(Number(e.target.value))}
                        className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none font-sans font-medium ${
                          isDark
                            ? 'bg-[#05080F] border-slate-700 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      >
                        {DAYS_OF_WEEK.map((d) => (
                          <option key={d.value} value={d.value}>
                            Tous les {d.label}s
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-mono text-slate-400 block">
                        Heure de rappel :
                      </label>
                      <input
                        type="time"
                        value={formDueTime}
                        onChange={(e) => setFormDueTime(e.target.value)}
                        className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none font-mono ${
                          isDark
                            ? 'bg-[#05080F] border-slate-700 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>
                  </div>
                )}

                {/* Case 3: Mensuel (jour du mois) */}
                {formType === 'mensuel' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-mono text-slate-400 block">
                        Jour du mois (1 à 31) :
                      </label>
                      <select
                        value={formDayOfMonth}
                        onChange={(e) => setFormDayOfMonth(Number(e.target.value))}
                        className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none font-mono ${
                          isDark
                            ? 'bg-[#05080F] border-slate-700 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                          <option key={day} value={day}>
                            Le {day} de chaque mois
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-mono text-slate-400 block">
                        Heure :
                      </label>
                      <input
                        type="time"
                        value={formDueTime}
                        onChange={(e) => setFormDueTime(e.target.value)}
                        className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none font-mono ${
                          isDark
                            ? 'bg-[#05080F] border-slate-700 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>
                  </div>
                )}

                {/* Case 4: Trimestriel (tous les 3 mois) */}
                {formType === 'trimestriel' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-mono text-slate-400 block">
                        Mois du trimestre :
                      </label>
                      <select
                        value={formMonthOfQuarter}
                        onChange={(e) => setFormMonthOfQuarter(Number(e.target.value))}
                        className={`w-full px-2.5 py-1.5 text-xs rounded-lg border outline-none font-sans ${
                          isDark
                            ? 'bg-[#05080F] border-slate-700 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      >
                        <option value={1}>1er mois (Jan / Avr / Juil / Oct)</option>
                        <option value={2}>2ème mois (Fév / Mai / Août / Nov)</option>
                        <option value={3}>3ème mois (Mars / Juin / Sept / Déc)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-mono text-slate-400 block">
                        Jour (1 à 31) :
                      </label>
                      <select
                        value={formDayOfMonth}
                        onChange={(e) => setFormDayOfMonth(Number(e.target.value))}
                        className={`w-full px-2.5 py-1.5 text-xs rounded-lg border outline-none font-mono ${
                          isDark
                            ? 'bg-[#05080F] border-slate-700 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                          <option key={day} value={day}>
                            Le {day}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-mono text-slate-400 block">
                        Heure :
                      </label>
                      <input
                        type="time"
                        value={formDueTime}
                        onChange={(e) => setFormDueTime(e.target.value)}
                        className={`w-full px-2.5 py-1.5 text-xs rounded-lg border outline-none font-mono ${
                          isDark
                            ? 'bg-[#05080F] border-slate-700 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Priority & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-mono font-bold text-slate-400 block">
                    Niveau de priorité
                  </label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as TaskPriority)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-mono font-bold ${
                      isDark
                        ? 'bg-[#05080F] border-slate-700 text-cyan-300'
                        : 'bg-slate-50 border-slate-300 text-cyan-800'
                    }`}
                  >
                    <option value="haute">🔴 Haute / Urgent</option>
                    <option value="normale">🟡 Normale</option>
                    <option value="basse">🟢 Basse</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-mono font-bold text-slate-400 block">
                    Catégorie / Thématique
                  </label>
                  <input
                    type="text"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="Travail, Client, Personnel, Finances..."
                    className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-sans ${
                      isDark
                        ? 'bg-[#05080F] border-slate-700 text-white placeholder-slate-500'
                        : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                    }`}
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-xs font-mono font-bold text-slate-400 block">
                  Description / Notes complémentaires (optionnel)
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Détails, liens ou actions requises..."
                  className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-sans resize-none ${
                    isDark
                      ? 'bg-[#05080F] border-slate-700 text-white placeholder-slate-500'
                      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                  }`}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-inherit">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-mono border transition cursor-pointer ${
                    isDark
                      ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                      : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-cyan-600 hover:bg-cyan-500 text-white transition active:scale-95 shadow-md cursor-pointer"
                >
                  {editingTask ? 'Enregistrer les modifications' : 'Créer la tâche'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
