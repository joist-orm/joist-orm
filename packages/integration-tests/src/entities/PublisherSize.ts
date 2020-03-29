export enum PublisherSize {
  Small = "SMALL",
  Large = "LARGE",
}

type Details = { id: number; code: PublisherSize; name: string };

const details: Record<PublisherSize, Details> = {
  [PublisherSize.Small]: { id: 1, code: PublisherSize.Small, name: "Small" },
  [PublisherSize.Large]: { id: 2, code: PublisherSize.Large, name: "Large" },
};

export const PublisherSizes = {
  getByCode(code: PublisherSize): Details {
    return details[code];
  },

  findByCode(code: string): Details | undefined {
    return details[code as PublisherSize];
  },

  findById(id: number): Details | undefined {
    return Object.values(details).find((d) => d.id === id);
  },

  getValues(): ReadonlyArray<PublisherSize> {
    return Object.values(PublisherSize);
  },

  getDetails(): ReadonlyArray<Details> {
    return Object.values(details);
  },
};
