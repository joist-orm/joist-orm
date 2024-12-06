---
title: Evolution of Defaults
slug: evolution-of-defaults
authors:
  - name: Stephen Haberman
    url: https://github.com/stephenh
    image_url: https://github.com/stephenh.png
tags: []
---

Joist's mission is to help you model your application's business logic, with first-class support for domain modeling concepts & features.

An example of this is Joist's support for something as simple as default values (i.e. the `Author.status` should default to `Active`), and particularly observing how the feature of "set a default" evolved over time.

### In the beginning: schema defaults

Joist's initial default value support was extremely simple, and limited to whatever was declared as `DEFAULT`s in the database schema. I.e. for a column like:

```sql
ALTER ...
```

Code that created new entities would get that value of `order: 1` applied:

```ts
const a = em.create(Author, {});
console.log(a.order); // already 1
```

This was an obvious approach, and had a few pros:

* Pro: The `order` was set immediately
* Pro: No duplication of "`order: 1` is the default" between the database schema & TypeScript code
* Con: Only supports static values

### Using beforeCreate hooks

Being limited to static values is not great, so the next way of implementing "set a default" was using `beforeCreate` hooks:

```ts
// Default the numberOfBooks
config.beforeCreate("books", a => {
  if (a.numberOfBooks === undefined) {
    a.numberOfBooks = a.books.get.length;  
  }  
})
```

* Pro: Support for arbitrary business logic
* Con: Default isn't ran until `em.flush`
* Con: Susceptible to hook ordering issues
* Con: Boilerplate/imperative--not really a first-class feature



### Adding a real API

```ts
config.setDefault("numberOfBooks", { books: {} }, a => {
  return a.books.get.length;   
})
```

### Dependency Tracking


### Factories Join the Party


### Future: Finds


### Slow Grind 

We used Joist for 4 years without cross-entity default dependency tracking, and it was fine, we didn't need it to ship features.

At first `beforeCreate` was enough, and for awhile `setDefault` was enough.
