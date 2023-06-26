export enum PublisherType {
  Small = "SMALL",
  Big = "BIG",
}
export type PublisherTypeDetails = { id: number; code: PublisherType; name: string };
const details: Record<PublisherType, PublisherTypeDetails> = {
  [PublisherType.Small]: { id: 1, code: PublisherType.Small, name: "Small" },
  [PublisherType.Big]: { id: 2, code: PublisherType.Big, name: "Big" },
};
export const PublisherTypeDetails: Record<PublisherType[0], PublisherTypeDetails> = {
  Small: details[PublisherType.Small],
  Big: details[PublisherType.Big],
};
export const PublisherTypes = {
  getByCode(code: PublisherType): PublisherTypeDetails {
    return details[code];
  },
  findByCode(code: string): PublisherTypeDetails | undefined {
    return details[code as PublisherType];
  },
  findById(id: number): PublisherTypeDetails | undefined {
    return Object.values(details).find((d) => d.id === id);
  },
  getValues(): ReadonlyArray<PublisherType> {
    return Object.values(PublisherType);
  },
  getDetails(): ReadonlyArray<PublisherTypeDetails> {
    return Object.values(details);
  },
};
