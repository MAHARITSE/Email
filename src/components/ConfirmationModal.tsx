import React, { useState } from 'react';
import { AlertTriangle, Send, Trash2, X } from 'lucide-react';
import { ConfirmationDialogState } from '../types/gmail';

interface ConfirmationModalProps {
  dialog: ConfirmationDialogState | null;
  onClose: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ dialog, onClose }) => {
  const [isProcessing, setIsProcessing] = useState(false);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div
        id="confirmation-modal-card"
        className="w-full max-w-md transform overflow-hidden rounded-2xl bg-[#080B10] p-6 shadow-[0_0_50px_rgba(0,0,0,0.9)] transition-all border border-slate-800 text-slate-300"
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
            <h3 id="dialog-title" className="text-base sm:text-lg font-bold font-mono tracking-tight text-white">
              {dialog.title}
            </h3>
          </div>
          <button
            id="close-confirmation-modal-btn"
            onClick={onClose}
            disabled={isProcessing}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-3 text-xs sm:text-sm leading-relaxed text-slate-400 whitespace-pre-line font-mono">
          {dialog.message}
        </p>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            id="cancel-confirmation-btn"
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-2 text-xs font-mono font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition disabled:opacity-50"
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
