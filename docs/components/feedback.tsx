'use client';

import { useState, useRef, useEffect } from 'react';
import { PenLine, X, Loader2 } from 'lucide-react';

type Sentiment = 'positive' | 'neutral' | 'negative' | null;

interface FeedbackProps {
  page: string;
}

export function Feedback({ page }: FeedbackProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sentiment, setSentiment] = useState<Sentiment>(null);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setState('loading');

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page,
          pageTitle: document.title,
          sentiment,
          message: message.trim(),
          email: email.trim() || undefined,
          userAgent: navigator.userAgent,
          referrer: document.referrer || undefined,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) throw new Error('Failed to send');

      setState('success');
      closeTimeoutRef.current = setTimeout(() => {
        setIsOpen(false);
        setState('idle');
        setSentiment(null);
        setMessage('');
        setEmail('');
      }, 2000);
    } catch {
      setState('error');
    }
  };

  const handleClose = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsOpen(false);
    setState('idle');
    setSentiment(null);
    setMessage('');
    setEmail('');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 sm:px-2.5 sm:py-1.5 text-xs font-medium
          text-fd-muted-foreground hover:text-fd-foreground
          bg-fd-secondary/50 hover:bg-fd-secondary
          rounded-md
          transition-all duration-150 ease-out
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2 focus-visible:ring-offset-fd-background
          active:scale-[0.98]
          touch-manipulation
          motion-reduce:transition-none motion-reduce:active:scale-100"
        aria-label="Share feedback about this page"
      >
        <PenLine className="size-3.5" aria-hidden="true" />
        <span>Feedback</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center
            bg-black/60 backdrop-blur-sm
            animate-in fade-in duration-150
            motion-reduce:animate-none
            p-0 sm:p-4"
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-title"
        >
          <div
            className="bg-fd-background border border-fd-border shadow-2xl
              w-full max-w-md p-5 sm:p-6
              pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6
              rounded-t-xl sm:rounded-xl
              animate-in slide-in-from-bottom duration-200 sm:zoom-in-95
              motion-reduce:animate-none
              overscroll-contain
              max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="feedback-title" className="text-lg font-semibold text-fd-foreground">
                Share feedback
              </h2>
              <button
                type="button"
                onClick={handleClose}
                className="p-1.5 -m-1.5 rounded-md
                  text-fd-muted-foreground hover:text-fd-foreground hover:bg-fd-secondary
                  transition-all duration-150 ease-out
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring
                  active:scale-95
                  motion-reduce:transition-none motion-reduce:active:scale-100"
                aria-label="Close feedback dialog"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            {state === 'success' ? (
              <div
                className="text-center py-8 animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none"
                role="status"
                aria-live="polite"
              >
                <div className="inline-flex items-center justify-center size-12 mb-3 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                  <svg
                    className="size-6 text-emerald-600 dark:text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-fd-foreground font-medium">Thank you!</p>
                <p className="text-sm text-fd-muted-foreground mt-1">Your feedback helps us improve.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <p className="text-sm text-fd-muted-foreground mb-4">
                  Help us improve our documentation by sharing your thoughts.
                </p>

                <fieldset className="mb-4">
                  <legend className="sr-only">How would you rate this page?</legend>
                  <div className="flex gap-2" role="radiogroup" aria-label="Sentiment">
                    {[
                      { value: 'positive', emoji: '😊', label: 'Positive' },
                      { value: 'neutral', emoji: '😐', label: 'Neutral' },
                      { value: 'negative', emoji: '😞', label: 'Negative' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSentiment(option.value as Sentiment)}
                        className={`flex-1 py-3 sm:py-2.5 px-3 rounded-lg border text-xl
                          transition-all duration-150 ease-out
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2 focus-visible:ring-offset-fd-background
                          active:scale-[0.98]
                          touch-manipulation
                          motion-reduce:transition-none motion-reduce:active:scale-100
                          ${
                            sentiment === option.value
                              ? 'border-fd-primary bg-fd-primary/10 shadow-sm ring-1 ring-fd-primary/20'
                              : 'border-fd-border hover:border-fd-muted-foreground hover:bg-fd-secondary/50'
                          }`}
                        role="radio"
                        aria-checked={sentiment === option.value}
                        aria-label={option.label}
                      >
                        <span className="block transform transition-transform duration-150 hover:scale-110 motion-reduce:hover:scale-100">
                          {option.emoji}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <label className="block mb-4">
                  <span className="text-sm font-medium text-fd-foreground">
                    Your feedback <span className="text-red-500 dark:text-red-400">*</span>
                  </span>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us what you think…"
                    required
                    rows={4}
                    className="mt-1.5 w-full px-3 py-3 sm:py-2.5 border border-fd-border rounded-lg
                      bg-fd-background text-fd-foreground text-base sm:text-sm
                      placeholder:text-fd-muted-foreground
                      transition-colors duration-150
                      focus:outline-none focus:ring-2 focus:ring-fd-ring focus:border-transparent
                      resize-none"
                  />
                </label>

                <label className="block mb-6">
                  <span className="text-sm font-medium text-fd-foreground">
                    Email <span className="text-fd-muted-foreground font-normal">(optional)</span>
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="mt-1.5 w-full px-3 py-3 sm:py-2.5 border border-fd-border rounded-lg
                      bg-fd-background text-fd-foreground text-base sm:text-sm
                      placeholder:text-fd-muted-foreground
                      transition-colors duration-150
                      focus:outline-none focus:ring-2 focus:ring-fd-ring focus:border-transparent"
                  />
                </label>

                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 sm:justify-end pt-4 border-t border-fd-border/50">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm font-medium rounded-lg
                      text-fd-muted-foreground hover:text-fd-foreground hover:bg-fd-secondary
                      transition-all duration-150 ease-out
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring
                      active:scale-[0.98]
                      touch-manipulation
                      motion-reduce:transition-none motion-reduce:active:scale-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!message.trim() || state === 'loading'}
                    className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm font-medium rounded-lg
                      bg-fd-primary text-fd-primary-foreground
                      hover:bg-fd-primary/90
                      disabled:opacity-50 disabled:pointer-events-none
                      transition-all duration-150 ease-out
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2 focus-visible:ring-offset-fd-background
                      active:scale-[0.98]
                      touch-manipulation
                      motion-reduce:transition-none motion-reduce:active:scale-100
                      inline-flex items-center justify-center gap-2"
                    aria-live="polite"
                  >
                    {state === 'loading' && (
                      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    )}
                    <span>{state === 'loading' ? 'Sending…' : state === 'error' ? 'Try again' : 'Submit'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
