## Overview

The Author entity represents a writer who can publish books.

Authors can have mentors (other authors) forming a recursive tree.

## Business Rules

| Rule | Description |
|------|-------------|
| firstName != lastName | First and last name must differ |
| max 12 books | An author cannot have 13 books |
| no cycles | Mentor chain cannot be circular |

## Fields

### numberOfBooks

Example of a derived async property that can be calculated via a populate hint.

### mentorNames

Example of a ReactiveField that uses a recursive parent relation.

### menteeNames

Example of a ReactiveField that uses a recursive child relation.

### rangeOfBooks

Example of a derived async enum.

### bookComments

Example of a derived async property that can be calculated via a populate hint through a polymorphic reference.

### bestReviews

Example of a ReactiveManyToMany - a derived m2m that auto-calculates its membership.

### menteesClosure

Example of a closure table.

### numberOfBooks2

Example of an async property that can be loaded via a populate hint.

### latestComment2

Example of an async property that returns an entity.

### allPublisherAuthorNames

Example of an async property that has a conflicting/overlapping reactive hint with ^.

### latestComments

Example of an async property that returns a list of entities.

### commentParentInfo

For testing reacting to poly CommentParent properties.

### withLoadedBooks

Example of using populate within an entity on itself.

### initials

Implements the business logic for a (synchronous) persisted derived value.

### fullName

Implements the business logic for an unpersisted derived value.

### fullName2

For testing `upsert` with setter-only properties.

### isPopular

Implements a public API for controlling access to a protected field (`wasEverPopular`).

### hasBooks

Example of an async boolean that can be navigated via a lens.

### reviews

All reviews across all of this author's books.

## Notes

Some additional notes the user might add here, with a code block:

```typescript
const author = await em.load(Author, "a:1");
await author.populate("books");
```
