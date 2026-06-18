// import { HeroSection } from './landing-hero/hero-section';
import { DocsHeroV2 } from './docs-hero-v2';

/**
 * Welcome-page hero.
 *
 * Currently rendering the v2 left/right layout. The original ported
 * landing hero (`HeroSection`) is kept under an import comment above —
 * swap it back in by uncommenting the import and the `<HeroSection />`
 * line below.
 */
export function DocsHero() {
  return (
    <div className="not-prose mb-10">
      <DocsHeroV2 />
      {/* <HeroSection /> */}
    </div>
  );
}
