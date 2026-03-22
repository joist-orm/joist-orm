## Overview


## Fields

### numberOfBookReviews

Example of a reactive query.

### titlesOfFavoriteBooks

Example of a ReactiveField reacting to ReactiveReferences (where a.favoriteBook is a unique).

### favoriteAuthor

Example of a ReactiveReference in an entity with subtypes.

### favoriteAuthorName

Example of a ReactiveField reacting to ReactiveReferences (where p.favoriteAuthor is not unique) .

### bookAdvanceTitlesSnapshot

Example of a RF that uses a lot of read-only hints, it should recalc only when p.name itself changes.

### numberOfBookAdvancesSnapshot

Example of a RF that uses solely a o2m read-only hints, it should recalc only when p.name itself changes.

### commentParentInfo

For testing reacting to poly CommentParent properties.
