export const docs = {
  AdminUser: { comment: "", fields: {}, operations: undefined },
  Author: {
    comment:
      "The Author entity represents a writer who can publish books.\n\nAuthors can have mentors (other authors) forming a recursive tree.",
    fields: {
      numberOfBooks: "Example of a derived async property that can be calculated via a populate hint.",
      mentorNames: "Example of a ReactiveField that uses a recursive parent relation.",
      menteeNames: "Example of a ReactiveField that uses a recursive child relation.",
      rangeOfBooks: "Example of a derived async enum.",
      bookComments:
        "Example of a derived async property that can be calculated via a populate hint through a polymorphic reference.",
      bestReviews: "Example of a ReactiveManyToMany - a derived m2m that auto-calculates its membership.",
      menteesClosure: "Example of a closure table.",
      numberOfBooks2: "Example of an async property that can be loaded via a populate hint.",
      latestComment2: "Example of an async property that returns an entity.",
      allPublisherAuthorNames: "Example of an async property that has a conflicting/overlapping reactive hint with ^.",
      latestComments: "Example of an async property that returns a list of entities.",
      commentParentInfo: "For testing reacting to poly CommentParent properties.",
      withLoadedBooks: "Example of using populate within an entity on itself.",
      initials: "Implements the business logic for a (synchronous) persisted derived value.",
      fullName: "Implements the business logic for an unpersisted derived value.",
      fullName2: "For testing `upsert` with setter-only properties.",
      isPopular: "Implements a public API for controlling access to a protected field (`wasEverPopular`).",
      hasBooks: "Example of an async boolean that can be navigated via a lens.",
      reviews: "All reviews across all of this author's books.",
    },
    operations: undefined,
  },
  AuthorSchedule: { comment: "", fields: {}, operations: undefined },
  AuthorStat: { comment: "", fields: {}, operations: undefined },
  Book: {
    comment: "",
    fields: {
      commentParentInfo: "For testing reacting to poly CommentParent properties.",
      search: "For testing accessing `book.author.get` when it's undefined.",
    },
    operations: undefined,
  },
  BookAdvance: { comment: "", fields: {}, operations: undefined },
  BookReview: {
    comment: "",
    fields: { commentParentInfo: "For testing reacting to poly CommentParent properties." },
    operations: undefined,
  },
  Child: { comment: "", fields: {}, operations: undefined },
  ChildGroup: { comment: "", fields: {}, operations: undefined },
  ChildItem: { comment: "", fields: {}, operations: undefined },
  Comment: { comment: "", fields: {}, operations: undefined },
  Critic: { comment: "", fields: {}, operations: undefined },
  CriticColumn: { comment: "", fields: {}, operations: undefined },
  Image: { comment: "", fields: {}, operations: undefined },
  LargePublisher: { comment: "", fields: {}, operations: undefined },
  ParentGroup: { comment: "", fields: {}, operations: undefined },
  ParentItem: { comment: "", fields: {}, operations: undefined },
  Publisher: {
    comment: "",
    fields: {
      numberOfBookReviews: "Example of a reactive query.",
      titlesOfFavoriteBooks:
        "Example of a ReactiveField reacting to ReactiveReferences (where a.favoriteBook is a unique).",
      favoriteAuthor: "Example of a ReactiveReference in an entity with subtypes.",
      favoriteAuthorName:
        "Example of a ReactiveField reacting to ReactiveReferences (where p.favoriteAuthor is not unique) .",
      bookAdvanceTitlesSnapshot:
        "Example of a RF that uses a lot of read-only hints, it should recalc only when p.name itself changes.",
      numberOfBookAdvancesSnapshot:
        "Example of a RF that uses solely a o2m read-only hints, it should recalc only when p.name itself changes.",
      commentParentInfo: "For testing reacting to poly CommentParent properties.",
    },
    operations: undefined,
  },
  PublisherGroup: { comment: "", fields: {}, operations: undefined },
  SmallPublisher: {
    comment: "",
    fields: { favoriteAuthor: "Example of a ReactiveReference in an entity with subtypes." },
    operations: undefined,
  },
  SmallPublisherGroup: { comment: "", fields: {}, operations: undefined },
  Tag: { comment: "", fields: {}, operations: undefined },
  Task: { comment: "", fields: {}, operations: undefined },
  TaskItem: { comment: "", fields: {}, operations: undefined },
  User: { comment: "", fields: {}, operations: undefined },
  TaskNew: { comment: "", fields: {}, operations: undefined },
  TaskOld: {
    comment: "",
    fields: { commentParentInfo: "For testing reacting to poly CommentParent properties." },
    operations: undefined,
  },
} as const;

export type EntityDocs = typeof docs;
