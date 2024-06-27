import { type EnumMetadata } from "joist-orm";

export enum BookRange {
  Few = "FEW",
  Lot = "LOT",
}

export type BookRangeDetails = { id: number; code: BookRange; name: string };

const details: Record<BookRange, BookRangeDetails> = {
  [BookRange.Few]: { id: 1, code: BookRange.Few, name: "A Few" },
  [BookRange.Lot]: { id: 2, code: BookRange.Lot, name: "A Lot" },
};

export const BookRangeDetails = { Few: details[BookRange.Few], Lot: details[BookRange.Lot] };

export const BookRanges: EnumMetadata<BookRange, BookRangeDetails, number> = {
  name: "BookRange",

  getByCode(code: BookRange): BookRangeDetails {
    return details[code];
  },

  findByCode(code: string): BookRangeDetails | undefined {
    return details[code as BookRange];
  },

  findById(id: number): BookRangeDetails | undefined {
    return Object.values(details).find((d) => d.id === id);
  },

  getValues(): ReadonlyArray<BookRange> {
    return Object.values(BookRange);
  },

  getDetails(): ReadonlyArray<BookRangeDetails> {
    return Object.values(details);
  },
};
