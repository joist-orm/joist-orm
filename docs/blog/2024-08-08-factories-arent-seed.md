---
title: Factories Over Seeds
slug: factories-over-seeds
authors:
  - name: Stephen Haberman
    url: https://github.com/stephenh
    image_url: https://github.com/stephenh.png
tags: []
---

Seeds are a common feature/concept in Node backends, i.e. see the [Prisma](https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding) and [Mikro](https://mikro-orm.io/docs/seeding) docs, where they provide a simple way to auto-populate your database with test data.

Joist has 


```
const slot2 = newItemSlot(em, { name: "Item #1", location: { withPath: "r:Kitchen/a:Bottom Drawer/Pull" } });
```



Don't grow seeds, build factories
