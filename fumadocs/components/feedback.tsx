'use client';

import * as React from 'react';
import { ThumbsUp, ThumbsDown, MessageSquare, X, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FeedbackProps {
  /**
   * The page URL or identifier for tracking
   */
  pageId?: string;
  /**
   * Custom class name
   */
  className?: string;
  /**
   * Callback when feedback is submitted
   */
  onSubmit?: (data: FeedbackData) => void;
}

interface FeedbackData {
  pageId: string;
  helpful: boolean | null;
  comment?: string;
  timestamp: string;
}

type FeedbackState = 'initial' | 'helpful' | 'not-helpful' | 'submitted';

/**
 * Feedback widget for documentation pages
 *
 * Features:
 * - Thumbs up/down rating
 * - Optional comment for negative feedback
 * - Persists to prevent duplicate submissions
 * - Sends data to /api/feedback endpoint
 *
 * Usage in MDX:
 * ```mdx
 * <Feedback />
 * ```
 *
 * Or in a layout:
 * ```tsx
 * <Feedback pageId={page.url} />
 * ```
 */
export function Feedback({ pageId, className, onSubmit }: FeedbackProps) {
  const [state, setState] = React.useState<FeedbackState>('initial');
  const [comment, setComment] = React.useState('');
  const [showComment, setShowComment] = React.useState(false);
  const [resolvedPageId, setResolvedPageId] = React.useState(pageId || '');

  // Resolve page ID from URL on mount (avoid hydration mismatch)
  React.useEffect(() => {
    if (!pageId) {
      setResolvedPageId(window.location.pathname);
    }
  }, [pageId]);

  const currentPageId = resolvedPageId;

  // Check if already submitted (wrapped in try-catch for private browsing)
  React.useEffect(() => {
    if (!currentPageId) return;
    try {
      const submitted = localStorage.getItem(`feedback-${currentPageId}`);
      if (submitted) {
        setState('submitted');
      }
    } catch {
      // localStorage not available (private browsing)
    }
  }, [currentPageId]);

  const submitFeedback = async (helpful: boolean, feedbackComment?: string) => {
    const data: FeedbackData = {
      pageId: currentPageId,
      helpful,
      comment: feedbackComment,
      timestamp: new Date().toISOString(),
    };

    // Call custom handler if provided
    if (onSubmit) {
      onSubmit(data);
    }

    // Send to API
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (error) {
      // Silently fail - feedback is non-critical
      console.warn('[Feedback] Failed to submit:', error);
    }

    // Mark as submitted in localStorage (wrapped in try-catch for private browsing)
    try {
      localStorage.setItem(`feedback-${currentPageId}`, 'true');
    } catch {
      // localStorage not available (private browsing)
    }

    setState('submitted');
    setShowComment(false);
  };

  const handleHelpful = async () => {
    // Set visual state first, then submit
    setState('helpful');
    await submitFeedback(true);
  };

  const handleNotHelpful = () => {
    setState('not-helpful');
    setShowComment(true);
  };

  const textareaId = `feedback-comment-${currentPageId.replace(/\//g, '-')}`;

  const handleSubmitComment = () => {
    submitFeedback(false, comment);
  };

  if (state === 'submitted') {
    return (
      <div
        className={cn(
          'flex items-center gap-2 text-sm text-muted-foreground py-4 border-t mt-8',
          className
        )}
      >
        <span className="text-green-600 dark:text-green-400">✓</span>
        Thank you for your feedback!
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3 py-4 border-t mt-8',
        className
      )}
    >
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">
          Was this page helpful?
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleHelpful}
            disabled={state !== 'initial'}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
              'border border-border hover:border-green-500 hover:text-green-600',
              'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
              state === 'helpful' && 'border-green-500 text-green-600 bg-green-50 dark:bg-green-950'
            )}
            aria-label="Yes, this page was helpful"
          >
            <ThumbsUp className="size-4" />
            Yes
          </button>
          <button
            onClick={handleNotHelpful}
            disabled={state !== 'initial'}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
              'border border-border hover:border-red-500 hover:text-red-600',
              'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
              state === 'not-helpful' && 'border-red-500 text-red-600 bg-red-50 dark:bg-red-950'
            )}
            aria-label="No, this page was not helpful"
          >
            <ThumbsDown className="size-4" />
            No
          </button>
        </div>
      </div>

      {/* Comment form for negative feedback */}
      {showComment && (
        <div className="flex flex-col gap-2 animate-in slide-in-from-top-2">
          <label htmlFor={textareaId} className="text-sm text-muted-foreground">
            How can we improve this page?
          </label>
          <div className="flex gap-2">
            <textarea
              id={textareaId}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us what could be better..."
              className={cn(
                'flex-1 min-h-[80px] px-3 py-2 text-sm rounded-md',
                'border border-border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring',
                'resize-none'
              )}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setShowComment(false);
                setState('initial');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors"
            >
              <X className="size-4" />
              Cancel
            </button>
            <button
              onClick={handleSubmitComment}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
                'bg-primary text-primary-foreground hover:opacity-90 transition-opacity'
              )}
            >
              <Send className="size-4" />
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Inline feedback trigger (smaller, for embedding in content)
 */
export function FeedbackInline({ pageId }: { pageId?: string }) {
  return (
    <Feedback
      pageId={pageId}
      className="border-none mt-0 pt-0"
    />
  );
}
