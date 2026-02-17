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
import { Wrench } from 'lucide-react';

// Types
interface ToolTypeData {
  id: string;
  name: string;
  icon: 'native' | 'mcp';
}

interface ToolTypeContextValue {
  selectedId: string;
  setSelectedId: (id: string) => void;
  registerToolType: (data: ToolTypeData) => void;
  toolTypes: ToolTypeData[];
}

// Context to share state between ToolTypeFlow and ToolTypeOption
const ToolTypeContext = createContext<ToolTypeContextValue | null>(null);

export function useToolType() {
  const context = useContext(ToolTypeContext);
  return context?.selectedId ?? null;
}

// Tool type option component - registers itself and conditionally renders content
interface ToolTypeOptionProps {
  id: string;
  name: string;
  icon: 'native' | 'mcp';
  children: ReactNode;
}

export function ToolTypeOption({ id, name, icon, children }: ToolTypeOptionProps) {
  const context = useContext(ToolTypeContext);
  const hasRegistered = useRef(false);

  useEffect(() => {
    if (context && !hasRegistered.current) {
      context.registerToolType({ id, name, icon });
      hasRegistered.current = true;
    }
  }, [context, id, name, icon]);

  // Only render if this tool type is selected
  if (!context || context.selectedId !== id) {
    return null;
  }

  return <>{children}</>;
}

// Card component for tool type selection
interface ToolTypeCardProps {
  id: string;
  name: string;
  icon: 'native' | 'mcp';
  selected: boolean;
  onSelect: () => void;
}

function ToolTypeCard({ name, icon, selected, onSelect }: ToolTypeCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2
        ${selected
          ? 'border-[var(--composio-orange)] bg-fd-accent/30'
          : 'border-fd-border bg-fd-card hover:bg-fd-accent/50 hover:border-[color-mix(in_srgb,var(--composio-orange)_50%,transparent)]'
        }
      `}
    >
      <div className="flex h-6 w-6 shrink-0 items-center justify-center">
        {icon === 'native' ? (
          <Wrench
            size={20}
            className={selected ? 'text-fd-foreground' : 'text-fd-muted-foreground'}
          />
        ) : (
          <>
            <Image
              src="/images/mcp-logo.svg"
              alt="MCP logo"
              width={20}
              height={20}
              className="h-5 w-5 dark:hidden"
            />
            <Image
              src="/images/mcp-logo-dark.svg"
              alt="MCP logo"
              width={20}
              height={20}
              className="h-5 w-5 hidden dark:block"
            />
          </>
        )}
      </div>
      <span className="text-sm font-medium text-fd-foreground">{name}</span>
    </button>
  );
}

// Main wrapper component
interface ToolTypeFlowProps {
  children: ReactNode;
}

export function ToolTypeFlow({ children }: ToolTypeFlowProps) {
  const [toolTypes, setToolTypes] = useState<ToolTypeData[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const registeredIds = useRef<Set<string>>(new Set());

  const registerToolType = (data: ToolTypeData) => {
    if (!registeredIds.current.has(data.id)) {
      registeredIds.current.add(data.id);
      setToolTypes((prev) => {
        // Check if already exists
        if (prev.some((t) => t.id === data.id)) {
          return prev;
        }
        return [...prev, data];
      });
    }
  };

  // Set default selection to first tool type once registered
  useEffect(() => {
    if (toolTypes.length > 0 && !selectedId) {
      setSelectedId(toolTypes[0].id);
    }
  }, [toolTypes, selectedId]);

  const contextValue: ToolTypeContextValue = {
    selectedId,
    setSelectedId,
    registerToolType,
    toolTypes,
  };

  return (
    <ToolTypeContext.Provider value={contextValue}>
      {/* Tool type selector */}
      {toolTypes.length > 0 && (
        <div className="not-prose mb-6">
          <div className="flex gap-3">
            {toolTypes.map((toolType) => (
              <ToolTypeCard
                key={toolType.id}
                id={toolType.id}
                name={toolType.name}
                icon={toolType.icon}
                selected={selectedId === toolType.id}
                onSelect={() => setSelectedId(toolType.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Render all children - ToolTypeOption will conditionally show based on selection */}
      {children}
    </ToolTypeContext.Provider>
  );
}
