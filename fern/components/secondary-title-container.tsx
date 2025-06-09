import { PropsWithChildren } from "react";

interface SecondaryTitleContainerProps {
  id?: string;
  title: string;
  description: string;
}

export function SecondaryTitleContainer({
  id,
  title,
  description,
  children,
}: PropsWithChildren<SecondaryTitleContainerProps>) {
  return (
    <div className="page-secondary-title-container">
      <h2 id={id} className="h2-title page-title mb-6">
        {title}
      </h2>
      <p className="p-base page-blurb mb-6">{description}</p>
      {children}
    </div>
  );
}
