import { Card, Cards } from 'fumadocs-ui/components/card';
import cookbookPersonas from '@/data/cookbook-personas.json';

interface PersonaEntry {
  tags: string[];
  title: string;
  description: string;
}

const personas = cookbookPersonas as Record<string, PersonaEntry>;

const ALL_SLUGS = Object.keys(personas);

export function PersonaRecipes({ slug }: { slug: string }) {
  const current = personas[slug];
  if (!current) return null;

  const scored = ALL_SLUGS
    .filter((s) => s !== slug)
    .map((s) => {
      const other = personas[s];
      const overlap = current.tags.filter((t) => other.tags.includes(t)).length;
      return { slug: s, overlap, ...other };
    })
    .filter((entry) => entry.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 3);

  if (scored.length === 0) return null;

  return (
    <div className="not-prose mt-8">
      <h2 className="mb-3 text-sm font-semibold text-fd-muted-foreground">
        More recipes
      </h2>
      <Cards>
        {scored.map((entry) => (
          <Card
            key={entry.slug}
            title={entry.title}
            href={`/cookbooks/${entry.slug}`}
            description={entry.description}
          />
        ))}
      </Cards>
    </div>
  );
}
