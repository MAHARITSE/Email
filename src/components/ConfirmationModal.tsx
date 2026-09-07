import React, { useEffect, useState } from 'react';
import { AlertTriangle, Send, Trash2, X } from 'lucide-react';
import { ConfirmationDialogState } from '../types/gmail';
import { useTheme } from '../context/ThemeContext';

interface ConfirmationModalProps {
  dialog: ConfirmationDialogState | null;
  onClose: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ dialog, onClose }) => {
  const { isDark } = useTheme();
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!dialog?.isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isProcessing) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [dialog?.isOpen, isProcessing, onClose]);

  if (!dialog || !dialog.isOpen) return null;

  const handleConfirm = async () => {
    try {
      setIsProcessing(true);
      await dialog.onConfirm();
      onClose();
    } catch (err) {
      console.error('Confirmation action failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const isDanger = dialog.confirmStyle === 'danger';
  const isSend =
    dialog.confirmLabel.toLowerCase().includes('send') ||
    dialog.confirmLabel.toLowerCase().includes('envoyer') ||
    dialog.confirmLabel.toLowerCase().includes('transmit');

  return (
    <div
      id="confirmation-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isProcessing) onClose();
      }}
    >
      <div
        id="confirmation-modal-card"
        className={`w-full max-w-md transform overflow-hidden rounded-2xl p-6 shadow-2xl transition-all border ${
          isDark
            ? 'bg-[#080B10] border-slate-800 text-slate-300'
            : 'bg-white border-slate-200 text-slate-700'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                isDanger
                  ? 'bg-red-950/60 text-red-400 border-red-800/60 shadow-[0_0_12px_rgba(239,68,68,0.25)]'
                  : isSend
                  ? 'bg-cyan-950/60 text-cyan-400 border-cyan-800/60 shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                  : 'bg-amber-950/60 text-amber-400 border-amber-800/60 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
              }`}
            >
              {isDanger ? (
                <Trash2 className="h-5 w-5" />
              ) : isSend ? (
                <Send className="h-5 w-5" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
            </div>
            <h3 id="dialog-title" className={`text-base sm:text-lg font-bold font-mono tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {dialog.title}
            </h3>
          </div>
          <button
            id="close-confirmation-modal-btn"
            onClick={onClose}
            disabled={isProcessing}
            className={`rounded-lg p-1 transition ${isDark ? 'text-slate-500 hover:bg-slate-800 hover:text-slate-300' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className={`mt-3 text-xs sm:text-sm leading-relaxed whitespace-pre-line font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          {dialog.message}
        </p>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            id="cancel-confirmation-btn"
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className={`rounded-lg border px-4 py-2 text-xs font-mono font-medium transition disabled:opacity-50 ${isDark ? 'border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            Annuler
          </button>
          <button
            id="confirm-action-btn"
            type="button"
            onClick={handleConfirm}
            disabled={isProcessing}
            className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider text-slate-950 shadow-md transition disabled:opacity-50 ${
              isDanger
                ? 'bg-red-500 hover:bg-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                : 'bg-cyan-500 hover:bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.3)]'
            }`}
          >
            {isProcessing ? 'Traitement en cours...' : dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
