export enum PublisherSize {
  Small = "SMALL",
  Large = "LARGE",
}

export type PublisherSizeDetails = { id: number; code: PublisherSize; name: string };

const details: Record<PublisherSize, PublisherSizeDetails> = {
  [PublisherSize.Small]: { id: 1, code: PublisherSize.Small, name: "Small" },
  [PublisherSize.Large]: { id: 2, code: PublisherSize.Large, name: "Large" },
};

export const PublisherSizes = {
  getByCode(code: PublisherSize): PublisherSizeDetails {
    return details[code];
  },

  findByCode(code: string): PublisherSizeDetails | undefined {
    return details[code as PublisherSize];
  },

  findById(id: number): PublisherSizeDetails | undefined {
    return Object.values(details).find((d) => d.id === id);
  },

  getValues(): ReadonlyArray<PublisherSize> {
    return Object.values(PublisherSize);
  },

  getDetails(): ReadonlyArray<PublisherSizeDetails> {
    return Object.values(details);
  },
};
