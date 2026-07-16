export function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="mb-5 flex flex-col gap-1.5">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-fd-foreground/55">
        {eyebrow}
      </span>
      <h2 className="text-xl font-medium leading-[1.15] tracking-[-0.01em] text-fd-foreground sm:text-2xl">
        {title}
      </h2>
    </div>
  );
}
