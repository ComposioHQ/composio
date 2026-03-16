"use client";

import { useEffect, useState } from "react";

type Toolkit = {
  slug: string;
  name: string;
  logo?: string;
  isConnected: boolean;
  connectedAccountId?: string;
};

export default function Dashboard() {
  const [toolkits, setToolkits] = useState<Toolkit[]>([]);
  async function fetchConnections() {
    const res = await fetch("/api/connections", { cache: "no-store" });
    const data = await res.json();
    setToolkits(data.toolkits);
  }

  useEffect(() => {
    fetchConnections();
  }, []);

  async function connect(slug: string) {
    const res = await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolkit: slug }),
    });
    const { redirectUrl } = await res.json();
    window.location.href = redirectUrl;
  }

  async function disconnect(connectedAccountId: string) {
    await fetch("/api/connections/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectedAccountId }),
    });
    fetchConnections();
  }

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">App Connections</h1>
      <p className="text-gray-500 mb-6">
        Connect your apps to give your agent access.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {toolkits.map((t) => (
          <div
            key={t.slug}
            className="flex items-center justify-between p-4 border rounded-lg"
          >
            <div className="flex items-center gap-3">
              {t.logo && (
                <img src={t.logo} alt={t.name} className="w-8 h-8 rounded" />
              )}
              <div>
                <p className="font-medium">{t.name}</p>
                <p
                  className={`text-xs ${
                    t.isConnected ? "text-green-600" : "text-gray-400"
                  }`}
                >
                  {t.isConnected ? "Connected" : "Not connected"}
                </p>
              </div>
            </div>
            {t.isConnected ? (
              <button
                onClick={() => disconnect(t.connectedAccountId!)}
                className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => connect(t.slug)}
                className="px-3 py-1.5 text-sm bg-black text-white rounded hover:bg-gray-800"
              >
                Connect
              </button>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
