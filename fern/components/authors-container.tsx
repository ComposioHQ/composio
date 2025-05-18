export interface Author {
  name: string;
  imageSrc: string;
}

export const AuthorsContainer = ({ authors }: { authors: Author[] }) => {
  return (
    <div className="authors-container">
      {authors.map((author, i) => (
        <div className="author-container" key={i}>
          <img
            className="author-image"
            src={author.imageSrc}
            alt={author.name}
          />
          <span className="author-name">{author.name}</span>
        </div>
      ))}
    </div>
  );
};
