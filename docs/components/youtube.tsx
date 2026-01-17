interface YouTubeProps {
  id: string;
  title?: string;
}

export function YouTube({ id, title = 'YouTube video' }: YouTubeProps) {
  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted">
      <iframe
        className="h-full w-full border-0"
        src={`https://www.youtube.com/embed/${id}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}
