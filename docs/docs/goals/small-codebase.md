---
title: Small & simple codebase
sidebar_position: 6
---

Adopting (or writing from scratch) a new piece of infrastructure code like an ORM has pros/cons, one of the large cons being lack of a large base of contributors or committers to help maintain the project.

To help mitigate this risk, Joist strives to be a small codebase, such that users of Joist should ideally be able to debug/maintain/support Joist on their own if necessary.

This is achieved by:

1. Cutting scope, i.e. focusing only on Postgres
2. Having only one way of doing things, i.e. Joist does not provide multiple/optional Repository-style APIs vs EntityManger-style APIs
   - Relatedly, currently there are very few config options, although these will grow slightly over time (i.e. to support user-defined types)
3. Leveraging DataLoader, i.e. a lot of Joist's ROI in terms of providing generally fancy/high-performance auto-batching and pre-loading features with a relatively simple implementation comes from building on top of DataLoader

(Granted, this may change at some point, if Joist becomes popular enough to, say, tackle supporting multiple relational databases, or whatever misc feature, with the help/long-term support from multiple contributors.)
