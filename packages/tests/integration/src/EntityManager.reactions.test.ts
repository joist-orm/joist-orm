import { expect } from "@jest/globals";
import { Author, LargePublisher, newAuthor, Publisher, SmallPublisher, Tag, User } from "@src/entities";
import {
  insertAuthor,
  insertAuthorToTag,
  insertPublisher,
  insertSmallPublisher,
  insertTag,
  insertUser,
} from "@src/entities/inserts";
import { getMetadata, MaybeAbstractEntityConstructor } from "joist-orm";

describe("EntityManager.reactions", () => {
  it.withCtx("creates the right internal reactions", async () => {
    const fn = expect.any(Function);
    expect(getInternalReactions(Author)).toMatchObject([
      { name: "direct", hint: "firstName", fn, runOnce: false },
      { name: "m2o", hint: { publisher: "name" }, fn, runOnce: false },
      { name: "o2m", hint: { mentees: "firstName" }, fn, runOnce: false },
      { name: "m2m", hint: { tags: "name" }, fn, runOnce: false },
      { name: "rf", hint: "search", fn, runOnce: false },
      { name: "rr", hint: "rootMentor", fn, runOnce: false },
      { name: "setViaHook", hint: "graduated", fn, runOnce: false },
      { name: "immutable", hint: { publisher: "type" }, fn, runOnce: false },
      { name: "runOnce", hint: "nickNames", fn, runOnce: true },
      { name: expect.stringMatching(/^Author.ts:\d+$/), hint: "ssn", fn, runOnce: false },
    ]);
    expect(getInternalReactions(User)).toMatchObject([{ name: "poly", hint: { favoritePublisher: "name" }, fn }]);
  });

  it.withCtx("creates the right reaction targets", async () => {
    const fn = expect.any(Function);
    expect(getReactions(Publisher)).toMatchObject([
      {
        kind: "reaction",
        cstr: Author,
        fields: ["name"],
        path: ["authors"],
        source: Publisher,
        isReadOnly: false,
        name: "m2o",
        fn,
      },
      {
        kind: "reaction",
        cstr: Author,
        fields: ["type"],
        path: ["authors"],
        source: Publisher,
        isReadOnly: true,
        name: "immutable",
        fn,
      },
    ]);
    expect(getReactions(SmallPublisher)).toMatchObject([
      {
        kind: "reaction",
        cstr: User,
        fields: ["name"],
        path: ["users"],
        source: SmallPublisher,
        isReadOnly: false,
        name: "poly",
        fn,
      },
    ]);
    expect(getReactions(LargePublisher)).toMatchObject([
      {
        kind: "reaction",
        cstr: User,
        fields: ["name"],
        path: ["users"],
        source: LargePublisher,
        isReadOnly: false,
        name: "poly",
        fn,
      },
    ]);
    expect(getReactions(Tag)).toMatchObject([
      {
        kind: "reaction",
        cstr: Author,
        fields: ["name"],
        path: ["authors"],
        source: Tag,
        isReadOnly: false,
        name: "m2m",
        fn,
      },
    ]);
    expect(getReactions(Author)).toMatchObject([
      {
        kind: "reaction",
        cstr: Author,
        fields: ["firstName"],
        path: [],
        source: Author,
        isReadOnly: false,
        name: "direct",
        fn,
        runOnce: false,
      },
      {
        kind: "reaction",
        cstr: Author,
        fields: ["publisher"],
        path: [],
        source: Author,
        isReadOnly: false,
        name: "m2o",
        fn,
        runOnce: false,
      },
      {
        kind: "reaction",
        cstr: Author,
        fields: [],
        path: [],
        source: Author,
        isReadOnly: false,
        name: "o2m",
        fn,
        runOnce: false,
      },
      {
        kind: "reaction",
        cstr: Author,
        fields: ["mentor", "deletedAt", "firstName"],
        path: ["mentor"],
        source: Author,
        isReadOnly: false,
        name: "o2m",
        fn,
        runOnce: false,
      },
      {
        kind: "reaction",
        cstr: Author,
        fields: ["tags"],
        path: [],
        source: Author,
        isReadOnly: false,
        name: "m2m",
        fn,
        runOnce: false,
      },
      {
        kind: "reaction",
        cstr: Author,
        fields: ["search"],
        path: [],
        source: Author,
        isReadOnly: false,
        name: "rf",
        fn,
        runOnce: false,
      },
      {
        kind: "reaction",
        cstr: Author,
        fields: ["rootMentor"],
        path: [],
        source: Author,
        isReadOnly: false,
        name: "rr",
        fn,
        runOnce: false,
      },
      {
        kind: "reaction",
        cstr: Author,
        fields: ["graduated"],
        path: [],
        source: Author,
        isReadOnly: false,
        name: "setViaHook",
        fn,
        runOnce: false,
      },
      {
        kind: "reaction",
        cstr: Author,
        fields: ["publisher"],
        path: [],
        source: Author,
        isReadOnly: false,
        name: "immutable",
        fn,
        runOnce: false,
      },
      {
        kind: "reaction",
        cstr: Author,
        fields: ["nickNames"],
        path: [],
        source: Author,
        isReadOnly: false,
        name: "runOnce",
        fn,
        runOnce: true,
      },
      {
        kind: "reaction",
        cstr: Author,
        fields: ["ssn"],
        path: [],
        source: Author,
        isReadOnly: false,
        name: expect.stringMatching(/^Author.ts:\d+$/),
        fn,
        runOnce: false,
      },
    ]);
  });

  it.withCtx("only runs explicitly triggered reactions when updating", async ({ em }) => {
    // Given an author
    await insertAuthor({ first_name: "a1" });
    const a = await em.load(Author, "a:1");
    // And then we update firstName
    a.firstName = "new name";
    await em.flush();
    // Then only the direct field reaction should run
    expect(a.transientFields.reactions).toEqual({
      direct: 1,
      immutable: 0,
      m2m: 0,
      m2o: 0,
      o2m: 0,
      rf: 1, // this is indirectly dependent on firstName, so it will run too
      rr: 0,
      setViaHook: 0,
      afterMetadata: 0,
      runOnce: 0,
    });
  });

  it.withCtx("runs all reactions on create", async ({ em }) => {
    // Given a new author
    const a = newAuthor(em);
    // When we flush
    await em.flush();
    // Then we run all the reactions
    expect(a.transientFields.reactions).toEqual({
      direct: 1,
      immutable: 1,
      m2m: 1,
      m2o: 1,
      o2m: 1,
      rf: 2, // this runs on the initial loop due to being created, then again after search changes in the second loop
      rr: 1,
      setViaHook: 1,
      afterMetadata: 1,
      runOnce: 1,
    });
    // And when we trigger another flush where the author is no longer new
    em.touch(a);
    await em.flush();
    // Then they shouldn't run again
    expect(a.transientFields.reactions).toEqual({
      direct: 1,
      immutable: 1,
      m2m: 1,
      m2o: 1,
      o2m: 1,
      rf: 2,
      rr: 1,
      setViaHook: 1,
      afterMetadata: 1,
      runOnce: 1,
    });
  });

  it.withCtx("runs reaction triggered by a hook", async ({ em }) => {
    // Given an author with a reaction that is triggered by a hook
    const a = newAuthor(em);
    await em.flush();
    // And the reaction runs b/c all reactions run on create
    expect(a.transientFields.reactions.setViaHook).toBe(1);
    // When we cause graduated to update
    em.touch(a);
    a.transientFields.setGraduatedInFlush = true;
    await em.flush();
    // Then the reaction runs again
    expect(a.transientFields.reactions.setViaHook).toBe(2);
  });

  it.withCtx("runs reactions added via afterMetadata", async ({ em }) => {
    // Given an author
    await insertAuthor({ first_name: "a1" });
    const a = await em.load(Author, "a:1");
    // When we change their ssn
    a.ssn = "new ssn";
    await em.flush();
    // Then it runs the reaction added in afterMetadata
    expect(a.transientFields.reactions.afterMetadata).toBe(1);
  });

  it.withCtx("runs reactions on parent of an immutable field", async ({ em }) => {
    // Given an author with a publisher
    await insertPublisher({ name: "p1" });
    await insertPublisher({ id: 2, name: "p2" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    const a = await em.load(Author, "a:1");
    const p2 = await em.load(Publisher, "p:2");
    // When we change the publisher
    a.publisher.set(p2);
    await em.flush();
    // Then the reaction runs
    expect(a.transientFields.reactions.immutable).toBe(1);
    // And when we clear the publisher
    a.publisher.set(undefined);
    await em.flush();
    // Then the reaction runs again
    expect(a.transientFields.reactions.immutable).toBe(2);
  });

  describe("m2o reactions", () => {
    it.withCtx("run on set", async ({ em }) => {
      // Given an Author
      await insertPublisher({ name: "p1" });
      await insertAuthor({ first_name: "a1" });
      const p = await em.load(Publisher, "p:1");
      const a = await em.load(Author, "a:1");
      expect(a.transientFields.reactions.m2o).toBe(0);
      // When we set the publisher
      a.publisher.set(p);
      await em.flush();
      // Then the reaction runs
      expect(a.transientFields.reactions.m2o).toBe(1);
    });

    it.withCtx("run on unset", async ({ em }) => {
      // Given an Author with a publisher
      await insertPublisher({ name: "p1" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const p = await em.load(Publisher, "p:1");
      const a = await em.load(Author, "a:1");
      expect(a.transientFields.reactions.m2o).toBe(0);
      // When we unset the publisher
      a.publisher.set(undefined);
      await em.flush();
      // Then the reaction runs
      expect(a.transientFields.reactions.m2o).toBe(1);
    });

    it.withCtx("run on change", async ({ em }) => {
      // Given an Author with a publisher
      await insertPublisher({ name: "p1" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const p = await em.load(Publisher, "p:1");
      const a = await em.load(Author, "a:1");
      expect(a.transientFields.reactions.m2o).toBe(0);
      // When we unset the publisher
      p.name = "p2";
      await em.flush();
      // Then the reaction runs
      expect(a.transientFields.reactions.m2o).toBe(1);
    });

    it.withCtx("run on delete", async ({ em }) => {
      // Given an Author with a publisher
      await insertPublisher({ name: "p1" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const p = await em.load(Publisher, "p:1");
      const a = await em.load(Author, "a:1");
      expect(a.transientFields.reactions.m2o).toBe(0);
      // When we delete the publisher
      em.delete(p);
      await em.flush();
      // Then the reaction runs
      expect(a.transientFields.reactions.m2o).toBe(1);
    });
  });

  describe("o2m reactions", () => {
    it.withCtx("run on add", async ({ em }) => {
      // Given an Author with a mentee and another author without a mentor
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3" });
      const a1 = await em.load(Author, "a:1");
      const a3 = await em.load(Author, "a:3");
      expect(a1.transientFields.reactions.o2m).toBe(0);
      // When we add a mentee to the author
      a1.mentees.add(a3);
      await em.flush();
      // Then it runs the reaction
      expect(a1.transientFields.reactions.o2m).toBe(1);
    });

    it.withCtx("run on remove", async ({ em }) => {
      // Given an Author with two mentees
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3", mentor_id: 1 });
      const a1 = await em.load(Author, "a:1", "mentees");
      const a3 = await em.load(Author, "a:3");
      expect(a1.transientFields.reactions.o2m).toBe(0);
      // When we remove a mentee
      a1.mentees.remove(a3);
      await em.flush();
      // Then it runs the reaction
      expect(a1.transientFields.reactions.o2m).toBe(1);
    });

    it.withCtx("run on delete", async ({ em }) => {
      // Given an Author with two mentees
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3", mentor_id: 1 });
      const a1 = await em.load(Author, "a:1");
      const a3 = await em.load(Author, "a:3");
      expect(a1.transientFields.reactions.o2m).toBe(0);
      // When we delete a mentee
      em.delete(a3);
      await em.flush();
      // Then it runs the reaction
      expect(a1.transientFields.reactions.o2m).toBe(1);
    });

    it.withCtx("run on change", async ({ em }) => {
      // Given an Author with two mentees
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3", mentor_id: 1 });
      const a1 = await em.load(Author, "a:1", "mentees");
      const a3 = await em.load(Author, "a:3");
      expect(a1.transientFields.reactions.o2m).toBe(0);
      // When we change a mentee
      a3.firstName = "new name";
      await em.flush();
      // Then it runs the reaction
      expect(a1.transientFields.reactions.o2m).toBe(1);
    });

    it.withCtx("do not trigger over reactivity on change", async ({ em }) => {
      // Given an Author with two mentees
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1 });
      await insertAuthor({ first_name: "a3", mentor_id: 1 });
      const a1 = await em.load(Author, "a:1", "mentees");
      const [a2, a3] = a1.mentees.get;
      expect(a1.transientFields.reactions.o2m).toBe(0);
      expect(a2.transientFields.reactions.o2m).toBe(0);
      expect(a3.transientFields.reactions.o2m).toBe(0);
      // When we change a mentee
      a3.firstName = "new name";
      await em.flush();
      // Then it runs the reaction only on the mentor
      expect(a1.transientFields.reactions.o2m).toBe(1);
      expect(a2.transientFields.reactions.o2m).toBe(0);
      expect(a3.transientFields.reactions.o2m).toBe(0);
    });
  });

  describe("m2m reactions", () => {
    it.withCtx("run on add", async ({ em }) => {
      // Given an Author with a tag
      await insertAuthor({ first_name: "a1" });
      await insertTag({ name: "t1" });
      await insertTag({ name: "t2" });
      await insertAuthorToTag({ author_id: 1, tag_id: 1 });
      const a = await em.load(Author, "a:1");
      const t = await em.load(Tag, "t:2");
      expect(a.transientFields.reactions.m2m).toBe(0);
      // When we add another tag to the author
      a.tags.add(t);
      await em.flush();
      // Then it runs the reaction
      // Note: there is an issue with the way we handle unloaded m2m relations that causes this to run twice.  We get
      // queued by the initial add, and then again when maybeApplyAddedAndRemovedBeforeLoaded is called when the
      // reaction itself populates the field.  This is a bug that we should fix, but it's ok for now because reactions
      // should be idempotent so it's just a performance issue.
      expect(a.transientFields.reactions.m2m).toBe(2);
    });

    it.withCtx("run on remove", async ({ em }) => {
      // Given an Author with two tags
      await insertAuthor({ first_name: "a1" });
      await insertTag({ name: "t1" });
      await insertTag({ name: "t2" });
      await insertAuthorToTag({ author_id: 1, tag_id: 1 });
      await insertAuthorToTag({ author_id: 1, tag_id: 2 });
      const a = await em.load(Author, "a:1");
      const t = await em.load(Tag, "t:1");
      expect(a.transientFields.reactions.m2m).toBe(0);
      // When we remove a tag
      a.tags.remove(t);
      await em.flush();
      // Then it runs the reaction
      // Note: there is an issue with the way we handle unloaded m2m relations that causes this to run twice.  We get
      // queued by the initial remove, and then again when maybeApplyAddedAndRemovedBeforeLoaded is called when the
      // reaction itself populates the field.  This is a bug that we should fix, but it's ok for now because reactions
      // should be idempotent so it's just a performance issue.
      expect(a.transientFields.reactions.m2m).toBe(2);
    });

    it.withCtx("run on delete", async ({ em }) => {
      // Given an Author with two tags
      await insertAuthor({ first_name: "a1" });
      await insertTag({ name: "t1" });
      await insertTag({ name: "t2" });
      await insertAuthorToTag({ author_id: 1, tag_id: 1 });
      await insertAuthorToTag({ author_id: 1, tag_id: 2 });
      const a = await em.load(Author, "a:1");
      const t = await em.load(Tag, "t:1");
      expect(a.transientFields.reactions.m2m).toBe(0);
      // When we delete a tag
      em.delete(t);
      await em.flush();
      // Then it runs the reaction
      // Note: there is an issue with the way we handle unloaded m2m relations that causes this to run twice.  We get
      // queued by the initial delete, and then again when maybeApplyAddedAndRemovedBeforeLoaded is called when the
      // reaction itself populates the field.  This is a bug that we should fix, but it's ok for now because reactions
      // should be idempotent so it's just a performance issue.
      expect(a.transientFields.reactions.m2m).toBe(2);
    });

    it.withCtx("run on change", async ({ em }) => {
      // Given an Author with a tag
      await insertAuthor({ first_name: "a1" });
      await insertTag({ name: "t1" });
      await insertAuthorToTag({ author_id: 1, tag_id: 1 });
      const a = await em.load(Author, "a:1");
      const t = await em.load(Tag, "t:1");
      expect(a.transientFields.reactions.m2m).toBe(0);
      // When we change the tag
      t.name = "3";
      await em.flush();
      // Then it runs the reaction
      expect(a.transientFields.reactions.m2m).toBe(1);
    });

    it.withCtx("do not trigger over reactivity on change", async ({ em }) => {
      // Given two authors
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      // And the first author has a tag
      await insertTag({ name: "t1" });
      await insertAuthorToTag({ author_id: 1, tag_id: 1 });
      const [a1, a2] = await em.find(Author, {});
      const t = await em.load(Tag, "t:1");
      expect(a1.transientFields.reactions.m2m).toBe(0);
      expect(a2.transientFields.reactions.m2m).toBe(0);
      // When we add the tag to the second author
      a2.tags.add(t);
      await em.flush();
      // Then the first author's reaction is not triggered but the second author's reaction is
      expect(a1.transientFields.reactions.m2m).toBe(0);
      // Note: there is an issue with the way we handle unloaded m2m relations that causes this to run twice.  We get
      // queued by the initial remove, and then again when maybeApplyAddedAndRemovedBeforeLoaded is called when the
      // reaction itself populates the field.  This is a bug that we should fix, but it's ok for now because reactions
      // should be idempotent so it's just a performance issue.
      expect(a2.transientFields.reactions.m2m).toBe(2);
    });
  });

  describe("polymorphic reactions", () => {
    it.withCtx("run on set", async ({ em }) => {
      // Given a user with no favorite publisher
      await insertSmallPublisher({ name: "p1" });
      await insertUser({ name: "u1" });
      const p = await em.load(SmallPublisher, "p:1");
      const u = await em.load(User, "u:1");
      expect(u.transientFields.reactions.poly).toBe(0);
      // When we set the favorite publisher
      u.favoritePublisher.set(p);
      await em.flush();
      // Then the reaction runs
      expect(u.transientFields.reactions.poly).toBe(1);
    });

    it.withCtx("run on unset", async ({ em }) => {
      // Given a user with a favorite publisher
      await insertSmallPublisher({ name: "p1" });
      await insertUser({ name: "u1", favorite_publisher_small_id: 1 });
      const u = await em.load(User, "u:1");
      expect(u.transientFields.reactions.poly).toBe(0);
      // When we unset the favorite publisher
      u.favoritePublisher.set(undefined);
      await em.flush();
      // Then the reaction runs
      expect(u.transientFields.reactions.poly).toBe(1);
    });

    it.withCtx("run on change", async ({ em }) => {
      // Given a user with a favorite publisher
      await insertSmallPublisher({ name: "p1" });
      await insertUser({ name: "u1", favorite_publisher_small_id: 1 });
      const p = await em.load(SmallPublisher, "p:1");
      const u = await em.load(User, "u:1");
      expect(u.transientFields.reactions.poly).toBe(0);
      // When we update the publisher
      p.name = "new name";
      await em.flush();
      // Then the reaction runs
      expect(u.transientFields.reactions.poly).toBe(1);
    });

    it.withCtx("run on delete", async ({ em }) => {
      // Given a user with a favorite publisher
      await insertSmallPublisher({ name: "p1" });
      await insertUser({ name: "u1", favorite_publisher_small_id: 1 });
      const p = await em.load(SmallPublisher, "p:1");
      const u = await em.load(User, "u:1");
      expect(u.transientFields.reactions.poly).toBe(0);
      // When we delete the publisher
      em.delete(p);
      await em.flush();
      // Then the reaction runs
      expect(u.transientFields.reactions.poly).toBe(1);
    });
  });

  describe("reactive field reactions", () => {
    it.withCtx("runs rule on change", async ({ em }) => {
      // Given an author
      await insertAuthor({ first_name: "a1" });
      const a = await em.load(Author, "a:1");
      expect(a.transientFields.reactions.rf).toBe(0);
      // When we change the author's first name to cause the reactive field to run
      a.firstName = "new name";
      await em.flush();
      // Then the reaction runs
      expect(a.transientFields.reactions.rf).toBe(1);
    });
  });

  describe("reactive reference reactions", () => {
    it.withCtx("runs on set", async ({ em }) => {
      // Given two authors
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      const [a1, a2] = await em.find(Author, {}, { orderBy: { id: "ASC" } });
      expect(a2.transientFields.reactions.rr).toBe(0);
      // When one is assigned as a mentor to the other causing rootMentor to update
      a2.mentor.set(a1);
      await em.flush();
      // Then the reaction runs
      expect(a2.transientFields.reactions.rr).toBe(1);
    });

    it.withCtx("runs on unset", async ({ em }) => {
      // Given an author with a mentor
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1, root_mentor_id: 1 });
      const [, a2] = await em.find(Author, {}, { orderBy: { id: "ASC" } });
      expect(a2.transientFields.reactions.rr).toBe(0);
      // When the mentor is unset causing rootMentor to update
      a2.mentor.set(undefined);
      await em.flush();
      // Then the reaction runs
      expect(a2.transientFields.reactions.rr).toBe(1);
    });

    // We don't support reacting to changes through a reactive reference, so no test for this for now

    it.withCtx("runs on delete", async ({ em }) => {
      // Given an author with a mentor
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2", mentor_id: 1, root_mentor_id: 1 });
      const [a1, a2] = await em.find(Author, {}, { orderBy: { id: "ASC" } });
      expect(a2.transientFields.reactions.rr).toBe(0);
      // When the mentor is deleted causing rootMentor to update
      em.delete(a1);
      await em.flush();
      // Then the reaction runs
      expect(a2.transientFields.reactions.rr).toBe(1);
    });
  });

  describe("runOnce", () => {
    it.withCtx("only runs once per flush when true", async ({ em }) => {
      // Given an author
      await insertAuthor({ first_name: "a1" });
      const a = await em.load(Author, "a:1");
      expect(a.transientFields.reactions.runOnce).toBe(0);
      // When a field is set to a value that would cause the reaction to run multiple times normally
      a.nickNames = []; // The hook will set this to ["a1ster"] which would ordinarily cause the reaction to run twice
      await em.flush();
      // Then the reaction runs exactly once
      expect(a.nickNames).toEqual(["a1ster"]);
      expect(a.transientFields.reactions.runOnce).toBe(1);
      // When we set the value again and flush
      a.nickNames = [];
      await em.flush();
      // Then the reaction has run one more time
      expect(a.nickNames).toEqual(["a1ster"]);
      expect(a.transientFields.reactions.runOnce).toBe(2);
    });
  });
});

function getInternalReactions(cstr: MaybeAbstractEntityConstructor<any>): any[] {
  return getMetadata(cstr).config.__data.reactions;
}

function getReactions(cstr: MaybeAbstractEntityConstructor<any>): any[] {
  return getMetadata(cstr).config.__data.reactables.filter((r) => r.kind === "reaction");
}
