"use client";

import Image from "next/image";
import { useIsMobile } from "./use-is-mobile";
import { LogoLoop } from "./logo-loop";

const LOGOS = [
  { src: "/clients/logo-agentai.svg", alt: "agent.ai", h: 34 },
  { src: "/clients/logo-context.svg", alt: "Context", h: 30 },
  { src: "/clients/logo-zoom.png", alt: "Zoom", h: 25 },
  { src: "/clients/logo-letta.svg", alt: "Letta", h: 27 },
  { src: "/clients/logo-glean.svg", alt: "Glean", h: 34 },
  { src: "/clients/logo-hubspot.svg", alt: "HubSpot", h: 34 },
  { src: "/clients/logo-wabi.svg", alt: "Wabi", h: 27 },
];

const MOBILE_SCALE = 0.75;

export function LogoBar() {
  const isMobile = useIsMobile();

  return (
    <section className="flex w-full items-center justify-center">
      <div
        className="w-full max-w-[800px] overflow-hidden px-4 py-[14px] grayscale"
        style={{
          maskImage:
            "linear-gradient(to right, transparent 0%, black 30%, black 70%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, black 30%, black 70%, transparent 100%)",
        }}
      >
        <LogoLoop
          direction="right"
          gap={isMobile ? 40 : 64}
          logoHeight={isMobile ? 18 : 26}
          logos={LOGOS}
          renderItem={(item: any) => {
            const logo = item as { src: string; alt: string; h: number };
            const h = isMobile ? logo.h * MOBILE_SCALE : logo.h;
            return (
              <Image
                alt={logo.alt}
                draggable={false}
                height={Math.ceil(h)}
                src={logo.src}
                style={{
                  height: h,
                  width: "auto",
                }}
                width={Math.ceil(h * 3)}
              />
            );
          }}
          speed={40}
        />
      </div>
    </section>
  );
}
