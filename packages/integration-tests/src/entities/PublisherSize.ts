export const PublisherSize = {
  Small: { id: 1, code: "SMALL", name: "Small" },
  Large: { id: 2, code: "LARGE", name: "Large" },
};

export type PublisherSize = typeof PublisherSize.Small | typeof PublisherSize.Large;
