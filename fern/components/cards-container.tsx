import { SimpleCard, SimpleCardProps } from "./simple-card";

export interface CardsContainerProps {
  cards: SimpleCardProps[];
}

export function CardsContainer({ cards }: CardsContainerProps) {
  return (
    <div className="cards-container">
      {cards.map((card, index) => (
        <SimpleCard key={index} {...card} />
      ))}
    </div>
  );
}
