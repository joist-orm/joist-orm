---
title: Tagged Ids
---

Joist automagically "tags" entity ids, which means prefixing them with a per-entity identifier.

For example, the value of `author1.id` is `"a:1"` instead of the number `1`.

There are a few reasons for this:

- It eliminates a class of bugs where ids are passed incorrectly across entity types.

  For example, a bug like:

  ```typescript
  const authorId = someAuthor.id;
  // Ops this is the wrong id
  const book = em.load(Book, authorId);
  ```

  Often these "wrong id" bugs will work during local unit tests because every table only has a few rows of `id 1`, `id 2`, so it's easy to have `id 1` taken from the `authors` table and accidentally work when looking it up in the `books` table.

  Note that Joist also has strongly-typed ids (i.e. `AuthorId`) to help prevent this, but those can only fix "wrong id" bugs that are internal to the application layer's codebase, i.e. the above example of reading an id from an entity and then immediately using it to look up the "wrong" entity (specifically the above code, even without tagged ids, is a compile error in Joist).

  However, tagged ids extends this same "strongly-typed ids" protection to API calls, i.e. if a client calls the API and gets back "author id 1" and then makes a follow up API call but accidentally uses that author id as a book id. Because we've crossed an API boundary (which generally have more generic id types, i.e. GraphQL's `ID` type is used for all objects), we need to use a runtime value to catch that "this id is not for the right entity".

  Granted, this will be a runtime error, but it will be a runtime error everytime time (i.e. even in local development when the "wrong id" often works by accident) instead of only showing up in production.

- It makes debugging easier because seeing ids like `a:1` in the logs, you immediately know which entity that is for, without having to also prefix your logging statements with `authorId=${...}`.

- GraphQL already uses essentially-strings/opaque `ID` types, and while Joist is technically GraphQL-agnostic, pragmatically implementing a GraphQL system is what drove most of Joist's development, so it was generally easy to support this in our APIs, so seemed like a low-hanging-fruit/easy-win.

Note that, in the database, the entity primary keys are still numeric / `serial` integers. Joist just auto-tags/detags them for you/for free.

For the tags, Joist will guess a tag name to use by abbreviating the entity name, i.e. `BookReview` --> `br`. If there is a collision, i.e. `br` is already taken, it will use the full entity name, i.e. `bookReview`. Tags are stored `joist-codegen.json` so you can easily change them if Joist initially guesses wrong.

Once you have a given tagged id deployed in production, you should probably never change it, i.e. in case id values like `a:1` ends up in a 3rd party system, changing your tagged id to `author:1` may break things.

Note that Joist will still look up "untagged ids" i.e. if you do `em.load(Author, "1")` it will not complain about the lack of a tag. However, if the tag value is wrong, i.e. `em.load(Author, "b:1")`, then it will be a runtime failure.
