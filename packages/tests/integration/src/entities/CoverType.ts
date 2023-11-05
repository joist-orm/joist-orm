export enum CoverType {
  HardCover = "HARD_COVER",
  SoftCover = "SOFT_COVER",
}

type Details = { id: number; code: CoverType; name: string };

const details: Record<CoverType, Details> = {
  [CoverType.HardCover]: { id: 1, code: CoverType.HardCover, name: "Hard Cover" },
  [CoverType.SoftCover]: { id: 2, code: CoverType.SoftCover, name: "Soft Cover" },
};

export const CoverTypes = {
  getByCode(code: CoverType): Details {
    return details[code];
  },

  findByCode(code: string): Details | undefined {
    return details[code as CoverType];
  },

  findById(id: number): Details | undefined {
    return Object.values(details).find((d) => d.id === id);
  },

  getValues(): ReadonlyArray<CoverType> {
    return Object.values(CoverType);
  },

  getDetails(): ReadonlyArray<Details> {
    return Object.values(details);
  },
};
