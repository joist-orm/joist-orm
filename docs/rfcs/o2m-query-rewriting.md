# o2m Query Rewriting

## Goal

We want to support "intuitive to the programmer" queries over o2m like:

```ts
em.find(Author, { books: b }, { condition: { and: [b.title.eq("b1"), b.order.eq(1)] } });
```

And have that eval to "a singular book has both title 'b1' and order 1".

## Terminology

* Cross-Children - A condition that checks sibling relations, i.e. `Author.books` and `Author.comments`
* Nested-Children - A condition that checks nested relations, i.e. `Author.books` and `Book.reviews`

## Scenarios

### Flat AND, Cross-Children

* `condition: { and: [b.title, b.title, c.text, c.text] }`
* `condition: { and: [b_conditions, c_conditions] }`
* `BOOL_OR(b.title AND b.title) as b_conditions`
* `BOOL_OR(c.text AND c.text) as c_conditions`

### Flat OR, Cross-Children

* `condition: { or: [b.title, b.title, c.text, c.text] }`
* `condition: { or: [b_conditions, c_conditions] }`
* `BOOL_OR(b.title OR b.title) as b_conditions`
* `BOOL_OR(c.text OR c.text) as c_conditions`

### Nested AND & Cross-Children

* `condition: { and: [{ or: [b1, br1] }, b2, b3, c1, c2] }`
* `condition: { and: [b_conditions, c_conditions] }`
* `BOOL_OR(br_conditions AND b2 AND b3) as b_conditions`
* `BOOL_OR(b1 OR br1) as br_conditions`
* `BOOL_OR(c1 AND c2) as c_conditions`

## Theory

