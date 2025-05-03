# o2m Query Rewriting

## Goal

We want to support "intuitive to the programmer" queries over o2m like:

```ts
em.find(
  // Find all authors...
  Author,
  { books: b },
  {
    condition: {
      // That have any book that has *both* a title=b1 and order=1
      and: [b.title.eq("b1"), b.order.eq(1)],
    },
  },
);
```

## Terminology

- Simple Conditions - A condition like `b.title.eq("b1")` that evals directly against a column
- Complex Conditions - A condition that `AND`/`OR`s simple or other nested complex conditions
- Inline Conditions - Simple conditions that included in the queries "join tree", i.e. the 2nd parameter to `em.find` that declares/binds the tables involved in the query.
- Cross-Child Conditions - A condition that checks sibling relations, i.e. `Author.books` and `Author.comments`
- Nested-Children - A condition that checks nested relations, i.e. `Author.books` and `Book.reviews`

## Scenarios

### Flat AND, Cross-Children

- `condition: { and: [b.title, b.title, c.text, c.text] }`
- `condition: { and: [b_conditions, c_conditions] }`
- `BOOL_OR(b.title AND b.title) as b_conditions`
- `BOOL_OR(c.text AND c.text) as c_conditions`

### Flat OR, Cross-Children

- `condition: { or: [b.title, b.title, c.text, c.text] }`
- `condition: { or: [b_conditions, c_conditions] }`
- `BOOL_OR(b.title OR b.title) as b_conditions`
- `BOOL_OR(c.text OR c.text) as c_conditions`

### Nested AND, Cross-Children, Same Paths

There is an `OR` but the conditions are within the same `books` path.

- `condition: { and: [{ or: [b1, br1] }, b2, b3, c1, c2] }`
- `condition: { and: [b_conditions, c_conditions] }`
- `BOOL_OR(br_conditions AND b2 AND b3) as b_conditions`
- `BOOL_OR(b1 OR br1) as br_conditions`
- `BOOL_OR(c1 AND c2) as c_conditions`

### Nested AND, Cross-Children, Different Paths

There is an `OR` but the conditions across b1/c1

- `condition: { and: [{ or: [b1, c1] }, b2, b3, c1, c2] }`
- `condition: { and: [b_conditions, c_conditions] }`
- `BOOL_OR(br_conditions AND b2 AND b3) as b_conditions`
- `BOOL_OR(b1 OR br1) as br_conditions`
- `BOOL_OR(c1 AND c2) as c_conditions`

---

- `condition: { or: [{ and: [b1, c1] }, { and: [b2, c2] }] }`
- There is no a singular child that has b1 and b2 both true
- But there is "some child" that has b1 and "some child" that has b2

## Theory

- Any inline simple condition is left where it's at
  - And if it's within an o2m/m2m, marks it's path as required
- Any leaf-condition that is in the top-level `AND` can be:
  - Grouped per child
  - Pushed down into the child's query
- Any top-level AND condition that is "contained to 1 path" can be pushed down
  - I.e. `books > reviews > ratings` could be pushed down into ratings 
  - The top-level conditions need to be "grouped by child" and pushed down as a group
- OR's that are "per child" can be pushed down into that child
  - `{ or: [b1, b2] }`
  - And make that child required
    - ...children start off as optional?

## Implementation Steps

* Maintain a map of `alias` -> Table
* For child joins, recorded required-ness
* For child joins, keep the condition builder around?
* For a given condition, be able to ask it the aliases it uses
  * Visit conditions, collect aliases 



---

* each node will have a set of aliases that it uses
  - simple nodes are just the immediately alias 
  - `br.rating.eq` -> `br`
  - `b.title.eq` -> `b`
  - complex nodes are the union of their children
  - `{ and: [b.title, b.title] }` -> `b`
  - `{ or: [b.title, br.title] }` -> [`b`, `br`]
* each node might be within nested CTE joins
  * `br` -> within `[reviews, books]`
  * `publisher` -> within `[]`
* a node like `{ and: [comment, book, book review] }` needs into two condition groups, `br` (takes `b`) and `c`
  * keep a list of existing condition groups, when find `book`, does any CG claim it?
  * keep a list of existing condition groups, when find `book review`, any need takeover `book`? 
  * if this is an `AND`, then yes
* if a node touches `N` CTEs, it has to stay top-level, `{ or: [book, comment] }`
