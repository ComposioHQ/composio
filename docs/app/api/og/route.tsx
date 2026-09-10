import { ImageResponse } from 'next/og';

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const input = params.get('title')?.trim();
  const title = Array.from(input || 'Composio Docs').slice(0, 120).join('');

  return new ImageResponse(
    params.get('variant') === 'home' ? (
      <div style={{
        display: 'flex', width: '100%', height: '100%',
        background: '#131211', color: '#faf9f6', fontFamily: 'sans-serif',
      }}>
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          width: 810, padding: '60px 64px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 28 }}>
            <div style={{ width: 24, height: 24, background: '#f76b15', borderRadius: 5 }} />
            Composio Docs
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', fontSize: 76, lineHeight: 1.04, letterSpacing: -3 }}>
              <span>Build and operate</span>
              <span style={{ color: '#ff8a42' }}>AI agents.</span>
            </div>
            <div style={{ display: 'flex', fontSize: 27, lineHeight: 1.4, color: '#bbb7b0', maxWidth: 620 }}>
              Tools, managed authentication, and secure execution for your agents.
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: 23, color: '#bbb7b0' }}>docs.composio.dev</div>
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          width: 390, padding: '64px 40px', background: '#f76b15', color: '#131211',
        }}>
          <div style={{ display: 'flex', fontSize: 20, letterSpacing: 3 }}>FROM THE DOCS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {['SDK', 'CLI', 'MCP'].map((label) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #b84c0b', paddingBottom: 20 }}>
                <span style={{ fontSize: 48 }}>{label}</span>
                <span style={{ fontSize: 32 }}>↗</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderRadius: 8, background: '#131211', color: '#faf9f6', fontSize: 26 }}>
            <span>Start building</span><span>→</span>
          </div>
        </div>
      </div>
    ) : (
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
    </div>
    ),
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
