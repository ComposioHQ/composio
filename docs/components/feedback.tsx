'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Loader2 } from 'lucide-react';

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
          sentiment,
          message: message.trim(),
          email: email.trim() || undefined,
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
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-fd-muted-foreground hover:text-fd-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
        aria-label="Share feedback"
      >
        <MessageSquare className="w-4 h-4" aria-hidden="true" />
        Share feedback
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={handleClose}
        >
          <div
            className="bg-fd-background border border-fd-border rounded-lg shadow-lg w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Share feedback</h2>
              <button
                onClick={handleClose}
                className="text-fd-muted-foreground hover:text-fd-foreground transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {state === 'success' ? (
              <p className="text-green-600 text-center py-8">
                Thank you for your feedback!
              </p>
            ) : (
              <form onSubmit={handleSubmit}>
                <p className="text-sm text-fd-muted-foreground mb-4">
                  Help us improve our documentation by sharing your thoughts.
                </p>

                <div className="flex gap-2 mb-4">
                  {[
                    { value: 'positive', emoji: '😊', label: 'Positive' },
                    { value: 'neutral', emoji: '😐', label: 'Neutral' },
                    { value: 'negative', emoji: '😞', label: 'Negative' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSentiment(option.value as Sentiment)}
                      className={`flex-1 py-2 px-3 rounded-md border text-xl transition-colors ${
                        sentiment === option.value
                          ? 'border-fd-primary bg-fd-primary/10'
                          : 'border-fd-border hover:border-fd-muted-foreground'
                      }`}
                      aria-label={option.label}
                    >
                      {option.emoji}
                    </button>
                  ))}
                </div>

                <label className="block mb-4">
                  <span className="text-sm font-medium">
                    Your feedback <span className="text-red-500">*</span>
                  </span>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us what you think…"
                    required
                    rows={4}
                    className="mt-1 w-full px-3 py-2 border border-fd-border rounded-md bg-fd-background text-fd-foreground placeholder:text-fd-muted-foreground focus:outline-none focus:ring-2 focus:ring-fd-ring resize-none"
                  />
                </label>

                <label className="block mb-6">
                  <span className="text-sm font-medium">Email (optional)</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    autoComplete="email"
                    className="mt-1 w-full px-3 py-2 border border-fd-border rounded-md bg-fd-background text-fd-foreground placeholder:text-fd-muted-foreground focus:outline-none focus:ring-2 focus:ring-fd-ring"
                  />
                </label>

                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 text-sm font-medium text-fd-muted-foreground hover:text-fd-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!message.trim() || state === 'loading'}
                    className="px-4 py-2 text-sm font-medium bg-fd-primary text-fd-primary-foreground rounded-md hover:bg-fd-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
                  >
                    {state === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />}
                    {state === 'error' ? 'Try again' : 'Submit feedback'}
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
