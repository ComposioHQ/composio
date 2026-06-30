'use client';

import dynamic from 'next/dynamic';

// Load the Eve chat browser-only. eve/react can't be server-rendered (its
// client store pulls in Node-only bundler helpers), so we skip SSR entirely
// and only ship it to the browser.
const EveChat = dynamic(() => import('./eve-chat').then((m) => m.EveChat), {
  ssr: false,
});

export function EveChatMount() {
  return <EveChat />;
}
