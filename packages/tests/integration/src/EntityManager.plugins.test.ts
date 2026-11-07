import { type Entity, ImmutableEntitiesPlugin, Plugin, getField, getMetadata, isInTrustedContext } from "joist-orm";
import { Author, Book, BookReview, Image, Publisher, Tag, User, newAuthor, newBook, newImage } from "src/entities";
import {
  insertAuthor,
  insertBook,
  insertBookReview,
  insertImage,
  insertPublisher,
  insertTag,
  select,
} from "src/entities/inserts";
import { isPreloadingEnabled, newEntityManager } from "src/testEm";
import { twoOf } from "src/utils";

describe("EntityManager.plugins", () => {
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
      // Given an image whose filename has never been read, even by a setter
      const { em } = ctx;
      const plugin = new BeforeGetFieldPlugin();
      const image = em.createPartial(Image, {});
      // And its first read will be observed by a plugin
      em.addPlugin(plugin);
      // When application logic reads the filename
      void image.fileName;
      // Then the plugin observes that field
      expect(plugin.calls).toEqual([[image, "fileName"]]);
    });

    it.withCtx("is called only the first time a field is accessed", async (ctx) => {
      // Given an image with an unread filename and a read plugin
      const { em } = ctx;
      const plugin = new BeforeGetFieldPlugin();
      const image = em.createPartial(Image, {});
      // And a plugin will observe its first filename read
      em.addPlugin(plugin);
      // When application logic reads that undefined filename twice
      void image.fileName;
      void image.fileName;
      // Then the plugin observes one read, even though no value was cached
      expect(plugin.calls).toEqual([[image, "fileName"]]);
    });

    it.withCtx("is called when accessing a m2o relation", async (ctx) => {
      // Given a persisted author
      await insertAuthor({ first_name: "a1" });
      // And a persisted book belongs to that author
      await insertBook({ title: "b1", author_id: 1 });
      const { em } = ctx;
      const plugin = new BeforeGetFieldPlugin();
      // And a plugin is installed before any reads of the book's author
      em.addPlugin(plugin);
      const b1 = await em.load(Book, "b:1", "author");
      // When application logic reads the loaded author repeatedly
      void b1.author.get;
      void b1.author.get;
      // Then the author field is observed once, independent of preloading's other reads
      expect(plugin.calls.filter((call) => call[0] === b1 && call[1] === "author")).toEqual([[b1, "author"]]);
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

    it.withCtx("can observe the meta, operation, and returned rows on find", async (ctx) => {
      await insertAuthor({ first_name: "a1" });
      const { em } = ctx;
      const plugin = new AfterFindPlugin();
      em.addPlugin(plugin);
      expect(plugin.calls).toHaveLength(0);
      await em.find(Author, {});
      expect(plugin.calls).toHaveLength(1);
      const [meta, operation, rows] = plugin.calls[0];
      expect(meta).toBe(getMetadata(Author));
      expect(operation).toBe("find");
      // The hook receives a read-only RowData view; observe-only hooks can read `rowCount`
      // without materializing, or `toRows()` when they want the POJO rows
      expect(rows.rowCount).toBe(1);
      expect(rows.get(0, "first_name")).toBe("a1");
      expect(rows.toRows()).toMatchObject([{ first_name: "a1" }]);
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
      // Given a persisted image whose first filename read will be external
      await insertImage({ type_id: 2, file_name: "original.jpg" });
      const { em } = ctx;
      const plugin = new InternalTrackingPlugin();
      const image = await em.load(Image, "1");
      // And the plugin is installed before that field is read
      em.addPlugin(plugin);
      // When application logic reads and then changes the filename
      void image.fileName;
      image.fileName = "external_test";
      // Then the first read is untrusted and the setter's equality comparison does not repeat it
      const getFileNameCalls = plugin.getFieldCalls.filter((c) => c.field === "fileName");
      expect(getFileNameCalls).toMatchObject([{ trusted: false }]);
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
      // Given a persisted review whose rating has never been read by this EM
      await insertAuthor({ first_name: "a1" });
      // And the author's existing book has a public review
      await insertBook({ title: "b1", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 5 });
      const { em } = ctx;
      const plugin = new InternalTrackingPlugin();
      em.addPlugin(plugin);
      const a1 = await em.load(Author, "a:1");
      // When a new book triggers Author.numberOfPublicReviews recalculation
      newBook(em, { author: a1 });
      await em.flush();
      // Then its first rating read is observed once in the trusted domain context
      expect(plugin.getFieldCalls.filter((c) => c.field === "rating")).toMatchObject([{ trusted: true }]);
    });
  });

  it.withCtx("does not replay cached ID reads for a later plugin", async (ctx) => {
    // Given an author whose assigned ID has already been read
    const a = newAuthor(ctx.em);
    await ctx.em.flush();
    void a.id;
    // And a plugin starts observing reads after the author was persisted
    const fields: string[] = [];
    ctx.em.addPlugin(
      new (class extends Plugin {
        /** Records reads without recursively reading the author's ID. */
        beforeGetField(entity: Entity, field: string): void {
          if (entity === a) fields.push(field);
        }
      })(),
    );
    // When application logic reads each public form of the author's ID
    void a.id;
    void a.idMaybe;
    void a.idTagged;
    void a.idTaggedMaybe;
    // Then the later plugin does not observe an ID that was already read
    expect(fields).toEqual([]);
  });

  it.withCtx("returns a field's new value when its first-read hook changes it", async (ctx) => {
    // Given an image persisted with an old filename
    await insertImage({ type_id: 2, file_name: "old.jpg" });
    const image = await ctx.em.load(Image, "1");
    // And a read hook renames the image before returning its filename
    ctx.em.addPlugin(
      new (class extends Plugin {
        /** Changes the field through its normal tracked setter. */
        beforeGetField(entity: Entity, field: string): void {
          if (entity === image && field === "fileName") {
            image.fileName = "new.jpg";
          }
        }
      })(),
    );
    // When application logic reads the filename
    const fileName = image.fileName;
    // Then it sees the value set by the hook, not the pre-hook cached value
    expect(fileName).toBe("new.jpg");
  });

  it.withCtx("shares the first ID read across all public ID forms and getField", async (ctx) => {
    // Given an author whose ID is observed from the start of its lifetime in this EM
    await insertAuthor({ first_name: "a1" });
    // And a plugin is installed before the author is loaded
    const plugin = new FieldReadsPlugin();
    ctx.em.addPlugin(plugin);
    const author = await ctx.em.load(Author, "a:1");
    // When application logic mixes every ID getter with direct field reads
    void author.id;
    void author.idMaybe;
    void author.idTagged;
    void author.idTaggedMaybe;
    getField(author, "id");
    // Then all forms share one observation of the stored ID
    expect(plugin.calls.filter((call) => call[0] === author && call[1] === "id")).toEqual([[author, "id"]]);
  });

  it.withCtx("does not repeat a field callback after writes, flushes, or refreshes", async (ctx) => {
    // Given an author's first name was read with a plugin installed
    await insertAuthor({ first_name: "a1" });
    // And a plugin observes the first name before any mutations
    const plugin = new FieldReadsPlugin();
    ctx.em.addPlugin(plugin);
    const author = await ctx.em.load(Author, "a:1");
    void author.firstName;
    // When the author is changed, persisted, and refreshed
    author.firstName = "new name";
    await ctx.em.flush();
    await ctx.em.refresh(author);
    void author.firstName;
    getField(author, "firstName");
    // Then the original callback is not repeated at any of those boundaries
    expect(plugin.calls.filter((call) => call[0] === author && call[1] === "firstName")).toEqual([
      [author, "firstName"],
    ]);
  });

  it.withCtx("retries a throwing read hook even after that hook read its own field", async (ctx) => {
    // Given an author with a hook that inspects its own field before failing once
    await insertAuthor({ first_name: "a1" });
    const author = await ctx.em.load(Author, "a:1");
    let attempts = 0;
    ctx.em.addPlugin(
      new (class extends Plugin {
        /** Reenters the getter without recursively dispatching the same plugin. */
        beforeGetField(entity: Entity, field: string): void {
          if (entity === author && field === "firstName") {
            attempts++;
            void author.firstName;
            if (attempts === 1) throw new Error("retry this read");
          }
        }
      })(),
    );
    // When application logic retries after the first hook throws
    try {
      void author.firstName;
    } catch {}
    void author.firstName;
    void author.firstName;
    // Then the successful retry completes the first read and later reads stay warm
    expect(attempts).toBe(2);
  });

  it.withCtx("observes fields in different bitmap words independently", async (ctx) => {
    // Given a persisted author with both an age and an SSN
    await insertAuthor({ first_name: "a1", age: 42, ssn: "123-45-6789" });
    // And a plugin is installed before either field is read
    const plugin = new FieldReadsPlugin();
    ctx.em.addPlugin(plugin);
    const author = await ctx.em.load(Author, "a:1");
    // When application logic mixes generated and direct reads of both fields
    void author.age;
    void author.ssn;
    getField(author, "age");
    getField(author, "ssn");
    void author.ssn;
    // Then neither field's observation consumes or repeats the other's callback
    expect(plugin.calls.filter((call) => call[0] === author && (call[1] === "age" || call[1] === "ssn"))).toEqual([
      [author, "age"],
      [author, "ssn"],
    ]);
  });

  it.withCtx("loads a field beyond the first bitmap word after a lower-word read", async (ctx) => {
    // Given a persisted author whose age and SSN have not been read
    await insertAuthor({ first_name: "a1", age: 42, ssn: "123-45-6789" });
    const author = await ctx.em.load(Author, "a:1");
    // When application logic reads the age before the SSN
    void author.age;
    const ssn = author.ssn;
    // Then the earlier age read does not hide the persisted SSN
    expect(ssn).toBe("123-45-6789");
  });

  it.withCtx("observes a protected field once across internal and application reads", async (ctx) => {
    // Given an author whose protected shape has not been read
    await insertAuthor({ first_name: "a1", favorite_shape: "circle" });
    // And a plugin is installed before housekeeping reads it
    const plugin = new FieldReadsPlugin();
    ctx.em.addPlugin(plugin);
    const author = await ctx.em.load(Author, "a:1");
    // When housekeeping reads it before application logic
    getField(author, "favoriteShape", true);
    void author.favoriteShape;
    void author.favoriteShape;
    // Then enrolling application read protection does not repeat the plugin callback
    expect(plugin.calls.filter((call) => call[0] === author && call[1] === "favoriteShape")).toEqual([
      [author, "favoriteShape"],
    ]);
  });

  it.withCtx("rejects reads of unknown entity fields", async (ctx) => {
    // Given an author with generated field metadata
    const author = newAuthor(ctx.em);
    // When application logic asks for a field that does not exist
    // Then it fails instead of silently bypassing first-read tracking
    expect(() => getField(author, "notAField")).toThrow("Unknown field Author.notAField");
  });
});

/** Records reads without accessing any entity getters from the callback. */
class FieldReadsPlugin extends Plugin {
  calls: [Entity, string][] = [];

  beforeGetField(entity: Entity, field: string): void {
    this.calls.push([entity, field]);
  }
}
