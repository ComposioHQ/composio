import { ImageResponse } from 'next/og';

export function GET(request: Request) {
  const input = new URL(request.url).searchParams.get('title')?.trim();
  const title = Array.from(input || 'Composio Docs').slice(0, 120).join('');

  return new ImageResponse(
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      width: '100%', height: '100%', padding: 72, background: '#131211', color: '#faf9f6',
      fontFamily: 'sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 32 }}>
        <div style={{ width: 28, height: 28, background: '#f76b15', borderRadius: 6 }} />
        Composio Docs
      </div>
      <div style={{ display: 'flex', fontSize: title.length > 60 ? 48 : 68, lineHeight: 1.12,
        letterSpacing: -2, maxWidth: 1056, overflowWrap: 'break-word' }}>
        {title}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24, color: '#bbb7b0' }}>
        <span>Build and operate agents</span>
        <span>docs.composio.dev</span>
      </div>
    </div>,
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
