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

interface ClientData {
  id: string;
  name: string;
  description: string;
  icon?: string;
  iconDark?: string;
  category: 'popular' | 'ide' | 'other';
}

interface ConnectContextValue {
  selectedId: string;
  setSelectedId: (id: string) => void;
  registerClient: (data: ClientData) => void;
  clients: ClientData[];
}

const ConnectContext = createContext<ConnectContextValue | null>(null);

function ClientIcon({ icon, iconDark, name, size = 16 }: { icon?: string; iconDark?: string; name: string; size?: number }) {
  if (!icon) return null;

  if (iconDark) {
    return (
      <>
        <Image src={icon} alt={`${name} logo`} width={size} height={size} className="h-4 w-4 shrink-0 dark:hidden" />
        <Image src={iconDark} alt={`${name} logo`} width={size} height={size} className="h-4 w-4 shrink-0 hidden dark:block" />
      </>
    );
  }

  return <Image src={icon} alt={`${name} logo`} width={size} height={size} className="h-4 w-4 shrink-0" />;
}

function PopularTab({
  client,
  selected,
  onSelect,
}: {
  client: ClientData;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all whitespace-nowrap
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500
        ${selected
          ? 'bg-fd-background text-fd-foreground shadow-sm dark:bg-fd-accent/60 dark:shadow-none'
          : 'text-fd-muted-foreground hover:text-fd-foreground'
        }
      `}
    >
      <ClientIcon icon={client.icon} iconDark={client.iconDark} name={client.name} />
      {client.name}
    </button>
  );
}

interface ConnectFlowProps {
  children: ReactNode;
}

export function ConnectFlow({ children }: ConnectFlowProps) {
  const [clients, setClients] = useState<ClientData[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const registeredIds = useRef<Set<string>>(new Set());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const registerClient = (data: ClientData) => {
    if (!registeredIds.current.has(data.id)) {
      registeredIds.current.add(data.id);
      setClients((prev) => {
        if (prev.some((c) => c.id === data.id)) return prev;
        return [...prev, data];
      });
    }
  };

  useEffect(() => {
    if (clients.length > 0 && !selectedId) {
      setSelectedId(clients[0].id);
    }
  }, [clients, selectedId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [dropdownOpen]);

  const contextValue: ConnectContextValue = {
    selectedId,
    setSelectedId,
    registerClient,
    clients,
  };

  const popular = clients.filter((c) => c.category === 'popular');
  const others = clients.filter((c) => c.category !== 'popular');
  const selectedIsOther = others.some((c) => c.id === selectedId);
  const selectedOtherClient = others.find((c) => c.id === selectedId);

  return (
    <ConnectContext.Provider value={contextValue}>
      {clients.length > 0 && (
        <div className="not-prose mb-8 rounded-xl border border-fd-border bg-fd-card/50">
          <div className="flex items-center justify-between gap-3 p-3">
            {/* Popular tabs */}
            <div className={`flex items-center gap-1 overflow-x-auto rounded-lg p-1 transition-all ${selectedIsOther ? 'bg-fd-muted/30 opacity-40' : 'bg-fd-muted/50 dark:bg-fd-muted/30'}`}>
              {popular.map((client) => (
                <PopularTab
                  key={client.id}
                  client={client}
                  selected={selectedId === client.id}
                  onSelect={() => {
                    setSelectedId(client.id);
                    setDropdownOpen(false);
                  }}
                />
              ))}
            </div>

            {/* More clients dropdown */}
            {others.length > 0 && (
              <div className="relative shrink-0" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  aria-expanded={dropdownOpen}
                  aria-haspopup="menu"
                  onKeyDown={(e) => { if (e.key === 'Escape') setDropdownOpen(false); }}
                  className={`
                    flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500
                    ${selectedIsOther
                      ? 'border-[var(--composio-orange)] bg-fd-accent/30 text-fd-foreground'
                      : 'border-fd-border bg-fd-card text-fd-muted-foreground hover:text-fd-foreground hover:bg-fd-accent/50'
                    }
                  `}
                >
                  {selectedIsOther && selectedOtherClient && (
                    <ClientIcon icon={selectedOtherClient.icon} iconDark={selectedOtherClient.iconDark} name={selectedOtherClient.name} />
                  )}
                  {selectedIsOther ? selectedOtherClient?.name : 'More clients'}
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 opacity-60">
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {dropdownOpen && (
                  <div role="menu" className="absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded-lg border border-fd-border bg-fd-card p-1 shadow-lg">
                    {others.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setSelectedId(client.id);
                          setDropdownOpen(false);
                        }}
                        className={`
                          flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors
                          ${selectedId === client.id
                            ? 'bg-fd-accent/50 text-fd-foreground'
                            : 'text-fd-muted-foreground hover:bg-fd-accent/30 hover:text-fd-foreground'
                          }
                        `}
                      >
                        <ClientIcon icon={client.icon} iconDark={client.iconDark} name={client.name} />
                        <div>
                          <span className="block font-medium">{client.name}</span>
                          <span className="block text-xs text-fd-muted-foreground">{client.description}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {children}
    </ConnectContext.Provider>
  );
}

interface ConnectClientOptionProps {
  id: string;
  name: string;
  description: string;
  icon?: string;
  iconDark?: string;
  category?: 'popular' | 'ide' | 'other';
  children: ReactNode;
}

export function ConnectClientOption({
  id,
  name,
  description,
  icon,
  iconDark,
  category = 'other',
  children,
}: ConnectClientOptionProps) {
  const context = useContext(ConnectContext);
  const hasRegistered = useRef(false);

  useEffect(() => {
    if (context && !hasRegistered.current) {
      context.registerClient({ id, name, description, icon, iconDark, category });
      hasRegistered.current = true;
    }
  }, [context, id, name, description, icon, iconDark, category]);

  if (!context || context.selectedId !== id) {
    return null;
  }

  return (
    <>
      <h2 className="text-2xl font-semibold tracking-tight mt-8 mb-4">{name}</h2>
      {children}
    </>
  );
}
