import { type Entity, getMetadata, ImmutableEntitiesPlugin, isInTrustedContext, Plugin } from "joist-orm";
import { Author, Book, BookReview, Image, newAuthor, newBook, newImage, Publisher, Tag, User } from "src/entities";
import { insertAuthor, insertBook, insertPublisher, insertTag, select } from "src/entities/inserts";
import { isPreloadingEnabled, newEntityManager } from "src/testEm";
import { twoOf } from "src/utils";

describe("EntityManger.plugins", () => {
  describe("ImmutableEntitiesPlugin", () => {
    it.withCtx("prevents writes to immutable entities", async (ctx) => {
      const { em } = ctx;
      const plugin = new ImmutableEntitiesPlugin();
      em.addPlugin(plugin);
      const [a1, a2] = twoOf((i) => newAuthor(em, { firstName: `a${i + 1}` }));
      plugin.addEntity(a2);
      expect(() => (a2.firstName = "changed")).toThrow("Cannot set field firstName on immutable entity Author#2");
      expect(() => (a1.firstName = "changed")).not.toThrow();
    });

    it("does not throw when setField is called via reactions that don't change", async () => {
      const [em, em2] = twoOf(() => newEntityManager());
      newAuthor(em, { firstName: `a1` });
      await em.flush();
      const plugin = new ImmutableEntitiesPlugin();
      em2.addPlugin(plugin);
      const author = await em2.load(Author, "a:1");
      plugin.addEntity(author);
      // This .load should call setField trustedly, but it shouldn't throw because beforeSetField isn't called.
      // Unfortunately, I'm not sure if there's a way to assert that `setField` is actually called here
      await expect(() => author.search.load()).resolves.not.toThrow();
    });
  });

  describe("beforeSetField", () => {
    class BeforeSetFieldPlugin extends Plugin {
      calls: Parameters<Required<Plugin>["beforeSetField"]>[] = [];
      originalValue: any[] = [];

      beforeSetField(...args: Parameters<Required<Plugin>["beforeSetField"]>) {
        const [entity, field] = args;
        this.calls.push(args);
        this.originalValue.push(entity[field as keyof typeof entity]);
      }
    }

    it.withCtx("is called before an entity's field is set", async (ctx) => {
      const { em } = ctx;
      const plugin = new BeforeSetFieldPlugin();
      em.addPlugin(plugin);
      expect(plugin.calls).toHaveLength(0);
      // use Image because it doesn't have any defaults that would call setField multiple times on create
      const image = em.createPartial(Image, { fileName: "original name" });
      expect(plugin.calls).toHaveLength(1);
      expect(plugin.calls[0]).toEqual([image, "fileName", "original name"]);
      expect(plugin.originalValue[0]).toEqual(undefined);
      image.fileName = "new name";
      expect(plugin.calls).toHaveLength(2);
      expect(plugin.calls[1]).toEqual([image, "fileName", "new name"]);
      expect(plugin.originalValue[1]).toEqual("original name");
    });

    it.withCtx("is not called when the value of a field stays the same", async (ctx) => {
      const { em } = ctx;
      const plugin = new BeforeSetFieldPlugin();
      const image = em.createPartial(Image, { fileName: "original name" });
      em.addPlugin(plugin);
      image.fileName = "original name";
      expect(plugin.calls).toHaveLength(0);
    });

    it.withCtx("is called when the value of a field is reverted to its original value", async (ctx) => {
      const { em } = ctx;
      const plugin = new BeforeSetFieldPlugin();
      const image = em.createPartial(Image, { fileName: "original name" });
      em.addPlugin(plugin);
      image.fileName = "new name";
      expect(plugin.calls).toHaveLength(1);
      expect(plugin.calls[0]).toEqual([image, "fileName", "new name"]);
      expect(plugin.originalValue[0]).toEqual("original name");
      image.fileName = "original name";
      expect(plugin.calls).toHaveLength(2);
      expect(plugin.calls[1]).toEqual([image, "fileName", "original name"]);
      expect(plugin.originalValue[1]).toEqual("new name");
    });

    it.withCtx("is called when setting a m2o relation", async (ctx) => {
      const { em } = ctx;
      const plugin = new BeforeSetFieldPlugin();
      const a1 = newAuthor(em);
      const a2 = newAuthor(em);
      const b1 = newBook(em, { author: a1 });
      em.addPlugin(plugin);
      b1.author.set(a2);
      expect(plugin.calls).toMatchEntity([[b1, "author", a2]]);
    });
  });

  describe("beforeGetField", () => {
    class BeforeGetFieldPlugin extends Plugin {
      calls: Parameters<Required<Plugin>["beforeGetField"]>[] = [];

      beforeGetField(...args: Parameters<Required<Plugin>["beforeGetField"]>) {
        this.calls.push(args);
      }
    }

    it.withCtx("is called before an entity's field is retrieved", async (ctx) => {
      const { em } = ctx;
      const plugin = new BeforeGetFieldPlugin();
      const image = newImage(em);
      em.addPlugin(plugin);
      expect(plugin.calls).toHaveLength(0);
      const _ = image.fileName;
      expect(plugin.calls).toEqual([[image, "fileName"]]);
    });

    it.withCtx("is called each time a field is accessed", async (ctx) => {
      const { em } = ctx;
      const plugin = new BeforeGetFieldPlugin();
      const image = newImage(em);
      em.addPlugin(plugin);
      const _ = image.fileName;
      const _2 = image.fileName;
      expect(plugin.calls).toEqual([
        [image, "fileName"],
        [image, "fileName"],
      ]);
    });

    it.withCtx("is called when accessing a m2o relation", async (ctx) => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      const { em } = ctx;
      const plugin = new BeforeGetFieldPlugin();
      // Add the plugin before, b/c if join-preloading is enabled, we'll `getField` the value during
      // populate, and then m2o.get will be cached and not hit `getField`.
      // ...maybe ManyToOneReferenceImpl.doGet should also call beforeGetField on every invocation?
      em.addPlugin(plugin);
      const b1 = await em.load(Book, "b:1", "author");
      const _ = b1.author.get;
      if (isPreloadingEnabled) {
        expect(plugin.calls[plugin.calls.length - 1]).toMatchEntity([b1, "author"]);
      } else {
        // If we're not preloaded, then the `m2o.load` checks if the value changed while in-flight,
        // which accesses `author.id`, so look at the 2nd to last call to find `book.author`.
        expect(plugin.calls[plugin.calls.length - 2]).toMatchEntity([b1, "author"]);
      }
    });
  });

  describe("beforeFind", () => {
    class BeforeFindPlugin extends Plugin {
      calls: Parameters<Required<Plugin>["beforeFind"]>[] = [];

      beforeFind(...args: Parameters<Required<Plugin>["beforeFind"]>) {
        this.calls.push(args);
      }
    }

    it.withCtx("is called with the meta, operation and query on find", async (ctx) => {
      const { em } = ctx;
      const plugin = new BeforeFindPlugin();
      em.addPlugin(plugin);
      expect(plugin.calls).toHaveLength(0);
      await em.find(Author, {});
      expect(plugin.calls).toMatchObject([[getMetadata(Author), "find", {}, { limit: em.entityLimit }]]);
    });

    // TODO: do we want to test every operation here?
  });

  describe("afterFind", () => {
    class AfterFindPlugin extends Plugin {
      calls: Parameters<Required<Plugin>["afterFind"]>[] = [];

      afterFind(...args: Parameters<Required<Plugin>["afterFind"]>) {
        this.calls.push(args);
      }
    }

    it.withCtx("is called with the meta, operation and returned rows on find", async (ctx) => {
      await insertAuthor({ first_name: "a1" });
      const { em } = ctx;
      const plugin = new AfterFindPlugin();
      em.addPlugin(plugin);
      expect(plugin.calls).toHaveLength(0);
      await em.find(Author, {});
      expect(plugin.calls).toEqual([[getMetadata(Author), "find", [expect.objectContaining({})]]]);
    });
  });

  describe("beforeValidate/afterValidate", () => {
    class ValidatePlugin extends Plugin {
      beforeValidateCalls: Parameters<Required<Plugin>["beforeValidate"]>[] = [];
      afterValidateCalls: Parameters<Required<Plugin>["afterValidate"]>[] = [];
      beforeValidateAfterValidationRan: boolean[] = [];
      afterValidateAfterValidationRan: boolean[] = [];
      beforeValidateGraduated: (Date | undefined)[] = [];
      beforeValidateBookTitles: string[] = [];
      beforeValidateError?: Error;
      afterValidateError?: Error;
      authorToObserve?: Author;
      bookToObserve?: Book;
      authorToMutateInBeforeValidate?: Author;
      authorToMutateInAfterValidate?: Author;
      beforeValidateMutationMessage?: string;
      afterValidateMutationMessage?: string;

      async beforeValidate(...args: Parameters<Required<Plugin>["beforeValidate"]>) {
        await Promise.resolve();
        this.beforeValidateCalls.push(args);
        if (this.authorToObserve) {
          this.beforeValidateAfterValidationRan.push(this.authorToObserve.transientFields.afterValidationRan);
          this.beforeValidateGraduated.push(this.authorToObserve.graduated);
        }
        if (this.bookToObserve) {
          this.beforeValidateBookTitles.push(this.bookToObserve.title);
        }
        if (this.authorToMutateInBeforeValidate) {
          try {
            this.authorToMutateInBeforeValidate.firstName = "beforeValidate mutation";
          } catch (error) {
            this.beforeValidateMutationMessage = error instanceof Error ? error.message : String(error);
          }
        }
        if (this.beforeValidateError) throw this.beforeValidateError;
      }

      async afterValidate(...args: Parameters<Required<Plugin>["afterValidate"]>) {
        await Promise.resolve();
        this.afterValidateCalls.push(args);
        if (this.authorToObserve) {
          this.afterValidateAfterValidationRan.push(this.authorToObserve.transientFields.afterValidationRan);
        }
        if (this.authorToMutateInAfterValidate) {
          try {
            this.authorToMutateInAfterValidate.firstName = "afterValidate mutation";
          } catch (error) {
            this.afterValidateMutationMessage = error instanceof Error ? error.message : String(error);
          }
        }
        if (this.afterValidateError) throw this.afterValidateError;
      }
    }

    it.withCtx("runs before validation with post-hook entities and aborts before persistence", async (ctx) => {
      await insertAuthor({ first_name: "existing" });
      await insertBook({ title: "To be changed by hook", author_id: 1 });
      await insertTag({ name: "tag1" });
      const { em } = ctx;
      const plugin = new ValidatePlugin();
      em.addPlugin(plugin);
      const author = newAuthor(em);
      author.transientFields.setGraduatedInFlush = true;
      const book = await em.load(Book, "b:1", "tags");
      const tag = await em.load(Tag, "t:1");
      plugin.authorToObserve = author;
      plugin.bookToObserve = book;
      plugin.beforeValidateError = new Error("blocked by beforeValidate");
      book.tags.add(tag);

      await expect(em.flush()).rejects.toThrow("blocked by beforeValidate");

      expect(plugin.beforeValidateCalls).toHaveLength(1);
      expect(plugin.afterValidateCalls).toHaveLength(0);
      const entities = new Set<Entity>(plugin.beforeValidateCalls[0][0]);
      expect(entities.has(author)).toBe(true);
      expect(entities.has(book)).toBe(true);
      expect(entities.has(tag)).toBe(true);
      expect(plugin.beforeValidateAfterValidationRan).toEqual([false]);
      expect(plugin.beforeValidateGraduated[0]).toBeInstanceOf(Date);
      expect(plugin.beforeValidateBookTitles).toEqual(["Tags Changed"]);
      expect(author.transientFields.afterValidationRan).toBe(false);
      expect(await select("authors")).toMatchObject([{ id: 1, first_name: "existing" }]);
      expect(await select("books")).toMatchObject([{ id: 1, title: "To be changed by hook" }]);
      expect(await select("books_to_tags")).toEqual([]);
    });

    it.withCtx("runs after validation and aborts before persistence", async (ctx) => {
      const { em } = ctx;
      const plugin = new ValidatePlugin();
      em.addPlugin(plugin);
      const author = newAuthor(em);
      plugin.authorToObserve = author;
      plugin.afterValidateError = new Error("blocked by afterValidate");

      await expect(em.flush()).rejects.toThrow("blocked by afterValidate");

      expect(plugin.beforeValidateCalls).toHaveLength(1);
      expect(plugin.afterValidateCalls).toHaveLength(1);
      expect(plugin.afterValidateAfterValidationRan).toEqual([true]);
      expect(author.transientFields.afterValidationRan).toBe(true);
      expect(await select("authors")).toEqual([]);
    });

    it.withCtx("prevents entity mutations from validate hooks", async (ctx) => {
      const { em } = ctx;
      const plugin = new ValidatePlugin();
      em.addPlugin(plugin);
      const author = newAuthor(em, { firstName: "original" });
      plugin.authorToMutateInBeforeValidate = author;
      plugin.authorToMutateInAfterValidate = author;

      await em.flush();

      expect(plugin.beforeValidateMutationMessage).toBe(
        "Cannot mutate an entity during an em.flush outside of a entity hook or from afterCommit",
      );
      expect(plugin.afterValidateMutationMessage).toBe(
        "Cannot mutate an entity during an em.flush outside of a entity hook or from afterCommit",
      );
      expect(author.firstName).toBe("original");
    });

    it.withCtx("runs when validation is skipped", async (ctx) => {
      const { em } = ctx;
      const plugin = new ValidatePlugin();
      em.addPlugin(plugin);
      const author = newAuthor(em, { firstName: "same", lastName: "same" });
      plugin.authorToObserve = author;

      await em.flush({ skipValidation: true });

      expect(plugin.beforeValidateCalls.some((args) => args[0].some((entity) => entity === author))).toBe(true);
      expect(plugin.afterValidateCalls.length).toBe(plugin.beforeValidateCalls.length);
      expect(plugin.afterValidateAfterValidationRan.every((ran) => ran === false)).toBe(true);
      expect(author.transientFields.afterValidationRan).toBe(false);
    });

    it.withCtx("runs for reactive-query micro-flush passes", async (ctx) => {
      await insertPublisher({ name: "p1" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      await insertBook({ title: "b1", author_id: 1 });
      const { em } = ctx;
      const plugin = new ValidatePlugin();
      em.addPlugin(plugin);
      const book = await em.load(Book, "b:1");
      const review = em.create(BookReview, { book, rating: 1 });

      await em.flush();

      expect(plugin.beforeValidateCalls.length).toBeGreaterThan(1);
      expect(plugin.beforeValidateCalls[0][0].some((entity) => entity === review)).toBe(true);
      expect(
        plugin.beforeValidateCalls.slice(1).some((args) => args[0].some((entity) => entity instanceof Publisher)),
      ).toBe(true);
      expect(plugin.afterValidateCalls.length).toBe(plugin.beforeValidateCalls.length);
    });
  });

  describe("trusted parameter", () => {
    class InternalTrackingPlugin extends Plugin {
      setFieldCalls: { entity: string; field: string; value: any; trusted: boolean }[] = [];
      getFieldCalls: { entity: string; field: string; trusted: boolean }[] = [];

      beforeSetField(entity: any, field: string, value: any) {
        this.setFieldCalls.push({ entity: entity.toTaggedString(), field, value, trusted: isInTrustedContext() });
      }

      beforeGetField(entity: any, field: string) {
        if (field === "id") return;
        this.getFieldCalls.push({ entity: entity.toTaggedString(), field, trusted: isInTrustedContext() });
      }
    }

    it.withCtx("passes trusted=false for external field access", async (ctx) => {
      const { em } = ctx;
      const plugin = new InternalTrackingPlugin();
      const image = newImage(em);
      // Add plugin after create to only track our explicit external calls
      em.addPlugin(plugin);
      // Given we make both an external read & write
      const _ = image.fileName;
      image.fileName = "external_test";
      // Then we had two getField calls (once for equality check in setField, once for explicit read)
      const getFileNameCalls = plugin.getFieldCalls.filter((c) => c.field === "fileName");
      expect(getFileNameCalls).toMatchObject([{ trusted: false }, { trusted: false }]);
      // And one setField call
      const setFileNameCalls = plugin.setFieldCalls.filter((c) => c.field === "fileName");
      expect(setFileNameCalls).toMatchObject([{ value: "external_test", trusted: false }]);
    });

    it.withCtx("passes trusted=false for create opts and trusted=true for sync defaults", async (ctx) => {
      const { em } = ctx;
      const plugin = new InternalTrackingPlugin();
      em.addPlugin(plugin);

      const user = em.create(User, { name: "user input", email: "user@example.com" });

      expect(plugin.setFieldCalls.filter((call) => call.field === "name")).toMatchObject([
        { entity: user.toTaggedString(), value: "user input", trusted: false },
      ]);
      expect(plugin.setFieldCalls.filter((call) => call.field === "email")).toMatchObject([
        { entity: user.toTaggedString(), value: "user@example.com", trusted: false },
      ]);
      expect(plugin.setFieldCalls.filter((call) => call.field === "originalEmail")).toMatchObject([
        { entity: user.toTaggedString(), value: "user@example.com", trusted: true },
      ]);
    });

    it.withCtx("passes trusted=false for upsert input and trusted=true for sync defaults", async (ctx) => {
      const { em } = ctx;
      const plugin = new InternalTrackingPlugin();
      em.addPlugin(plugin);

      const user = await em.upsert(User, { name: "upsert input", email: "upsert@example.com" });

      expect(plugin.setFieldCalls.filter((call) => call.field === "name")).toMatchObject([
        { entity: user.toTaggedString(), value: "upsert input", trusted: false },
      ]);
      expect(plugin.setFieldCalls.filter((call) => call.field === "email")).toMatchObject([
        { entity: user.toTaggedString(), value: "upsert@example.com", trusted: false },
      ]);
      expect(plugin.setFieldCalls.filter((call) => call.field === "originalEmail")).toMatchObject([
        { entity: user.toTaggedString(), value: "upsert@example.com", trusted: true },
      ]);
    });

    it.withCtx("passes trusted=true for synchronous async-default application", async (ctx) => {
      const { em } = ctx;
      const plugin = new InternalTrackingPlugin();
      em.addPlugin(plugin);

      const author = newAuthor(em, { firstName: "factory input" });

      expect(plugin.setFieldCalls.filter((call) => call.field === "nickNames")).toMatchObject([
        { entity: author.toTaggedString(), value: ["factory input"], trusted: true },
      ]);
    });

    it.withCtx("passes trusted=true for setField from lifecycle hooks", async (ctx) => {
      const { em } = ctx;
      const plugin = new InternalTrackingPlugin();
      em.addPlugin(plugin);
      // Given author has a beforeFlush hook sets `graduated` when setGraduatedInFlush is true
      const a1 = newAuthor(em);
      a1.transientFields.setGraduatedInFlush = true;
      await em.flush();
      // Then we recorded setField call as trusted
      const graduatedCalls = plugin.setFieldCalls.filter((c) => c.field === "graduated");
      expect(graduatedCalls).toMatchObject([{ trusted: true }]);
    });

    it.withCtx("passes trusted=true for setField from reactive field recalculation", async (ctx) => {
      const { em } = ctx;
      const plugin = new InternalTrackingPlugin();
      em.addPlugin(plugin);
      // Given Author.numberOfBooks is a reactive field that gets recalculated
      const a1 = newAuthor(em);
      newBook(em, { author: a1 });
      await em.flush();
      // Then we recorded setField call as trusted
      const numberOfBooksCalls = plugin.setFieldCalls.filter((c) => c.field === "numberOfBooks");
      expect(numberOfBooksCalls).toMatchObject([{ trusted: true }]);
    });

    it.withCtx("passes trusted=true for getField from reactive field recalculation", async (ctx) => {
      const { em } = ctx;
      const plugin = new InternalTrackingPlugin();
      // Given Author.numberOfPublicReviews accesses the BookReview.rating value
      const a1 = newAuthor(em, { books: [{ reviews: [{ rating: 5 }] }] });
      newBook(em, { author: a1 });
      // And we don't add the plugin until before flush
      em.addPlugin(plugin);
      await em.flush();
      // Then we have ~4-5 trusted get calls
      const trustedGetCalls = plugin.getFieldCalls.filter((c) => c.field === "rating" && c.trusted);
      expect(trustedGetCalls.length).toBeGreaterThan(0);
      // And no untrusted get calls
      const untrustedGetCalls = plugin.getFieldCalls.filter((c) => c.field === "rating" && !c.trusted);
      expect(untrustedGetCalls.length).toBe(0);
    });
  });
});
