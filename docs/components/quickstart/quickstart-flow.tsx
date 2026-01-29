'use client';

import Image from 'next/image';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';

// Types
interface FrameworkData {
  id: string;
  name: string;
  logo: string;
  logoDark?: string;
}

interface QuickstartContextValue {
  selectedId: string;
  setSelectedId: (id: string) => void;
  registerFramework: (data: FrameworkData) => void;
  frameworks: FrameworkData[];
}

// Context to share state between QuickstartFlow and FrameworkOption
const QuickstartContext = createContext<QuickstartContextValue | null>(null);

export function useQuickstartFramework() {
  const context = useContext(QuickstartContext);
  return context?.selectedId ?? null;
}

// Framework option component - registers itself and conditionally renders content
interface FrameworkOptionProps {
  id: string;
  name: string;
  logo: string;
  logoDark?: string;
  children: ReactNode;
}

export function FrameworkOption({ id, name, logo, logoDark, children }: FrameworkOptionProps) {
  const context = useContext(QuickstartContext);
  const hasRegistered = useRef(false);

  useEffect(() => {
    if (context && !hasRegistered.current) {
      context.registerFramework({ id, name, logo, logoDark });
      hasRegistered.current = true;
    }
  }, [context, id, name, logo, logoDark]);

  // Only render if this framework is selected
  if (!context || context.selectedId !== id) {
    return null;
  }

  return <>{children}</>;
}

// Card component for framework selection
interface FrameworkCardProps {
  id: string;
  name: string;
  logo: string;
  logoDark?: string;
  selected: boolean;
  onSelect: () => void;
}

function FrameworkCard({ name, logo, logoDark, selected, onSelect }: FrameworkCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2
        ${selected
          ? 'border-[var(--composio-orange)] bg-fd-accent/30'
          : 'border-fd-border bg-fd-card hover:bg-fd-accent/50 hover:border-[color-mix(in_srgb,var(--composio-orange)_50%,transparent)]'
        }
      `}
    >
      <div className="flex h-6 w-6 shrink-0 items-center justify-center">
        {logoDark ? (
          <>
            <Image
              src={logo}
              alt={`${name} logo`}
              width={24}
              height={24}
              className="h-5 w-auto dark:hidden"
            />
            <Image
              src={logoDark}
              alt={`${name} logo`}
              width={24}
              height={24}
              className="h-5 w-auto hidden dark:block"
            />
          </>
        ) : (
          <Image
            src={logo}
            alt={`${name} logo`}
            width={24}
            height={24}
            className="h-5 w-auto"
          />
        )}
      </div>
      <span className="text-sm font-medium text-fd-foreground">{name}</span>
    </button>
  );
}

// Main wrapper component
interface QuickstartFlowProps {
  children: ReactNode;
}

export function QuickstartFlow({ children }: QuickstartFlowProps) {
  const [frameworks, setFrameworks] = useState<FrameworkData[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const registeredIds = useRef<Set<string>>(new Set());

  const registerFramework = (data: FrameworkData) => {
    if (!registeredIds.current.has(data.id)) {
      registeredIds.current.add(data.id);
      setFrameworks((prev) => {
        // Check if already exists
        if (prev.some((f) => f.id === data.id)) {
          return prev;
        }
        return [...prev, data];
      });
    }
  };

  // Set default selection to first framework once registered
  useEffect(() => {
    if (frameworks.length > 0 && !selectedId) {
      setSelectedId(frameworks[0].id);
    }
  }, [frameworks, selectedId]);

  const contextValue: QuickstartContextValue = {
    selectedId,
    setSelectedId,
    registerFramework,
    frameworks,
  };

  return (
    <QuickstartContext.Provider value={contextValue}>
      {/* Framework selector */}
      {frameworks.length > 0 && (
        <div className="not-prose mb-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {frameworks.map((framework) => (
              <FrameworkCard
                key={framework.id}
                id={framework.id}
                name={framework.name}
                logo={framework.logo}
                logoDark={framework.logoDark}
                selected={selectedId === framework.id}
                onSelect={() => setSelectedId(framework.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Render all children - FrameworkOption will conditionally show based on selection */}
      {children}
    </QuickstartContext.Provider>
  );
}
