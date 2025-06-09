import { ReactElement } from "react";
import ArrowRightIcon from "../icons/arrow-right";
import { type Author, AuthorsContainer } from "./authors-container";

export interface SimpleCardProps {
  title: string;
  description: string;
  imageSrc: string;
  tags: string[];
  href: string;
  authors?: Author[];
}

export function SimpleCard({
  title,
  description,
  imageSrc,
  tags,
  href,
  authors,
}: SimpleCardProps): ReactElement {
  return (
    <div className="simple-card-container">
      <a
        href={href}
        target="_blank"
        className="flex flex-1 flex-col justify-stretch"
      >
        <img className="image-desktop w-full" src={imageSrc} />
        <img className="image-mobile w-full" src={imageSrc} />
        <div className="simple-card-text-and-link-container">
          <div className="simple-card-text-container">
            <div className="small-tag-container">
              {tags.map((tag, idx) => (
                <span key={idx} className="small-tag-light dark:small-tag-dark">
                  {tag}
                </span>
              ))}
            </div>
            <p className="h4-title simple-card-title">{title}</p>
            <p className="p-title">{description}</p>
            {authors != null && authors.length > 0 && (
              <AuthorsContainer authors={authors} />
            )}
          </div>
          <div className="simple-card-link-container">
            <div className="flex items-center">
              <span className="group inline-block cursor-pointer font-medium text-[#39594D] dark:text-[#517B6A] hover:text-black dark:hover:text-white">
                Build this
                <span className="ml-2 inline-block group-hover:no-underline">
                  <ArrowRightIcon />
                </span>
              </span>
            </div>
          </div>
        </div>
      </a>
    </div>
  );
}
