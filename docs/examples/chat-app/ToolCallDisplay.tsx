"use client";

import { useState } from "react";

export function ToolCallDisplay({
  toolName,
  input,
  output,
  isLoading,
}: {
  toolName: string;
  input: unknown;
  output?: unknown;
  isLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors ${
          isLoading
            ? "border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
            : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
        }`}
      >
        {isLoading ? (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border border-gray-300 border-t-gray-600 dark:border-gray-600 dark:border-t-gray-300" />
        ) : (
          <span className="text-green-600 dark:text-green-400">✓</span>
        )}
        <code className="font-mono">{toolName}</code>
        {!isLoading && <span className="text-gray-400">{expanded ? "▴" : "▾"}</span>}
      </button>

      {expanded && !isLoading && (
        <pre className="mt-1 ml-1 max-h-40 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
          {output != null
            ? String(JSON.stringify(output, null, 2))
            : String(JSON.stringify(input, null, 2))}
        </pre>
      )}
    </div>
  );
}
