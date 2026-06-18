"use client";

/**
 * Stand-in for the 3D `WarpTunnelCanvas` on the landing page. The real
 * component pulls in three.js + react-three-fiber + drei (~ 1MB+) which
 * we don't want to ship in the docs bundle. Render a deep gradient
 * backdrop that approximates the tunnel feel.
 */
export function WarpTunnelCanvas() {
  return (
    <div
      aria-hidden="true"
      className="h-full w-full"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 35%, rgba(38,46,140,0.55) 0%, rgba(11,11,15,0.95) 55%, #0b0b0f 80%)",
      }}
    />
  );
}
