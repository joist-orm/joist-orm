import { ValidationErrors } from "joist-orm";
import {
  AdvanceStatus,
  BookAdvance,
  ImageType,
  PublisherStatus,
  newAuthor,
  newBook,
  newBookAdvance,
  newImage,
  newLargePublisher,
  newSmallPublisher,
} from "src/entities";
import { insertAuthor, insertBook, insertBookAdvance, insertPublisher } from "src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("EntityManager.transitions", () => {
  it("fires onTransition when created, by default", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em);
    await em.flush();
    expect(ba.transientFields.transitions).toEqual([AdvanceStatus.Pending]);
  });

  it("fires onTransition once per flushed change", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em);
    await em.flush();
    ba.status = AdvanceStatus.Signed;
    await em.flush();
    expect(ba.transientFields.transitions).toEqual([AdvanceStatus.Pending, AdvanceStatus.Signed]);
  });

  it("fires onTransition for each change chained within one flush", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em);
    await em.flush();
    ba.transientFields.payWhenSigned = true;
    ba.status = AdvanceStatus.Signed;
    await em.flush();
    expect(ba.transientFields.transitions).toEqual([AdvanceStatus.Pending, AdvanceStatus.Signed, AdvanceStatus.Paid]);
  });

  it("loads the onTransition hint", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em, { book: { title: "b1" } });
    await em.flush();
    ba.status = AdvanceStatus.Signed;
    await em.flush();
    expect(ba.transientFields.signedTitle).toBe("b1");
  });

  it("runs commit-phase onTransition once for each matching transition", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em);
    await em.flush();
    ba.transientFields.payWhenSigned = true;
    ba.status = AdvanceStatus.Signed;
    await em.flush();
    expect(ba.transientFields.onPaidCommitInvoked).toBe(1);
  });

  it("allows creating with any status", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em, { status: AdvanceStatus.Paid });
    await em.flush();
    expect(ba.isNewEntity).toBe(false);
  });

  it("rejects a transition missing from the transitions table when the field is set", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em, { status: AdvanceStatus.Paid });
    await em.flush();
    expect(() => {
      ba.status = AdvanceStatus.Pending;
    }).toThrow("Cannot change status from Paid to Pending");
  });

  it("rejects a change that fails its guard", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em, { status: AdvanceStatus.Signed, book: { title: "Unpublished" } });
    await em.flush();
    ba.status = AdvanceStatus.Paid;
    await expect(em.flush()).rejects.toThrow("Cannot pay an advance for an unpublished book");
  });

  it("skips a guard for changes it does not match", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em, { book: { title: "Unpublished" } });
    await em.flush();
    ba.status = AdvanceStatus.Signed;
    await em.flush();
    expect(ba.status).toBe(AdvanceStatus.Signed);
  });

  it("skips a guard when only its hinted fields change", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em, { status: AdvanceStatus.Paid });
    await em.flush();
    ba.book.get.title = "Unpublished";
    await em.flush();
    expect(ba.book.get.title).toBe("Unpublished");
  });

  it("does not fire onCreate transitions for a withStatus factory value", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em, { withStatus: AdvanceStatus.Paid });
    await em.flush();
    expect(ba.transientFields.transitions).toEqual([]);
  });

  it("sets the status from a withStatus factory value", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em, { withStatus: AdvanceStatus.Paid });
    await em.flush();
    expect(ba.status).toBe(AdvanceStatus.Paid);
  });

  it("fires onTransition for changes after a withStatus factory value", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em, { withStatus: AdvanceStatus.Pending });
    await em.flush();
    ba.status = AdvanceStatus.Signed;
    await em.flush();
    expect(ba.transientFields.transitions).toEqual([AdvanceStatus.Signed]);
  });

  it("does not fire onTransition for a change its guard rejects", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em, { status: AdvanceStatus.Signed, book: { title: "Unpublished" } });
    await em.flush();
    ba.status = AdvanceStatus.Paid;
    await expect(em.flush()).rejects.toThrow("Cannot pay an advance for an unpublished book");
    expect(ba.transientFields.transitions).toEqual([AdvanceStatus.Signed]);
  });

  it("keeps the current state when the transitions table rejects a transition", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em, { status: AdvanceStatus.Paid });
    await em.flush();
    expect(() => {
      ba.status = AdvanceStatus.Pending;
    }).toThrow();
    expect(ba.status).toBe(AdvanceStatus.Paid);
  });

  it("does not fire onTransition with onCreate: false when created", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em, { status: AdvanceStatus.Paid });
    await em.flush();
    expect(ba.transientFields.onPaidCommitInvoked).toBe(0);
  });

  it("does not fire onTransition with a from value when created", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em, { status: AdvanceStatus.Signed });
    await em.flush();
    expect(ba.transientFields.signedTitle).toBeUndefined();
  });

  it("fires onTransition for each transition when the state cycles back before the flush", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em);
    await em.flush();
    ba.status = AdvanceStatus.Signed;
    ba.status = AdvanceStatus.Pending;
    await em.flush();
    expect(ba.transientFields.transitions).toEqual([
      AdvanceStatus.Pending,
      AdvanceStatus.Signed,
      AdvanceStatus.Pending,
    ]);
  });

  it("allows each transition when the field is set several times before the flush", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em);
    await em.flush();
    ba.status = AdvanceStatus.Signed;
    ba.status = AdvanceStatus.Paid;
    await em.flush();
    expect(ba.transientFields.transitions).toEqual([AdvanceStatus.Pending, AdvanceStatus.Signed, AdvanceStatus.Paid]);
  });

  it("passes onTransition the transition it handles, even after the state moved on", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em);
    await em.flush();
    ba.status = AdvanceStatus.Signed;
    ba.status = AdvanceStatus.Paid;
    await em.flush();
    expect(ba.transientFields.signedTransition).toEqual({
      from: AdvanceStatus.Pending,
      to: AdvanceStatus.Signed,
      current: AdvanceStatus.Paid,
    });
  });

  it("runs a guard for a transition the state has already moved past", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em, { book: { title: "Unpublished" } });
    await em.flush();
    ba.status = AdvanceStatus.Signed;
    ba.status = AdvanceStatus.Paid;
    await expect(em.flush()).rejects.toThrow("Cannot pay an advance for an unpublished book");
  });

  it("treats assignments to a new entity before its first flush as its creation", async () => {
    const em = newEntityManager();
    // Pending -> Paid isn't in the table, but the advance hasn't been seen yet, so this is just its creation
    const ba = newBookAdvance(em);
    ba.status = AdvanceStatus.Paid;
    await em.flush();
    expect(ba.transientFields.transitions).toEqual([AdvanceStatus.Paid]);
  });

  it("records transitions of a new entity once reactions have seen it", async () => {
    const em = newEntityManager();
    const ba = newBookAdvance(em);
    ba.transientFields.signWhenPending = true;
    await em.flush();
    expect(ba.transientFields.transitions).toEqual([AdvanceStatus.Pending, AdvanceStatus.Signed]);
  });

  it("rejects an unapproved signature even when it is revoked before flush", async () => {
    // Given a Pending advance for a book that is not approved
    const em = newEntityManager();
    const ba = newBookAdvance(em, { book: { title: "Unapproved" } });
    await em.flush();
    // When the advance is signed and its signature is revoked before flush
    ba.status = AdvanceStatus.Signed;
    ba.status = AdvanceStatus.Pending;
    // Then the signing guard rejects the transition despite no net status change
    await expect(em.flush()).rejects.toThrow("Cannot sign an advance for an unapproved book");
  });

  it("rejects a revoked signature when the book's approval also changes", async () => {
    // Given a Pending advance for an approved book
    const em = newEntityManager();
    const ba = newBookAdvance(em, { book: { title: "Approved" } });
    await em.flush();
    // And the book's approval is withdrawn
    ba.book.get.title = "Unapproved";
    // When the advance is signed and its signature is revoked before flush
    ba.status = AdvanceStatus.Signed;
    ba.status = AdvanceStatus.Pending;
    // Then the signing guard rejects the advance even though its status is clean again
    await expect(em.flush()).rejects.toThrow("Cannot sign an advance for an unapproved book");
  });

  it("allows an approved signature to be revoked without writing an unchanged advance", async () => {
    // Given a Pending advance for an approved book
    const em = newEntityManager();
    const ba = newBookAdvance(em, { book: { title: "Approved" } });
    await em.flush();
    // When the advance is signed and its signature is revoked before flush
    ba.status = AdvanceStatus.Signed;
    ba.status = AdvanceStatus.Pending;
    const flushed = await em.flush();
    // Then both transitions are allowed without persisting an unchanged advance
    expect(flushed).toEqual([]);
  });

  it("forgets an approved signature after its revocation is flushed", async () => {
    // Given an approved signature whose revocation has been flushed
    const em = newEntityManager();
    const ba = newBookAdvance(em, { book: { title: "Approved" } });
    await em.flush();
    // And the advance is signed and its signature is revoked
    ba.status = AdvanceStatus.Signed;
    ba.status = AdvanceStatus.Pending;
    await em.flush();
    // When the book's approval is withdrawn after the revocation
    ba.book.get.title = "Unapproved";
    await em.flush();
    // Then the old signature doesn't prevent withdrawing approval
    expect(ba.book.get.title).toBe("Unapproved");
  });

  it("records an image type configured only through a named transition callback", async () => {
    // Given an author image whose type has only a named transition callback
    const em = newEntityManager();
    const image = newImage(em, { type: ImageType.AuthorImage, author: newAuthor(em) });
    // When the image is created
    await em.flush();
    // Then its named callback has handled the generated enum accessor match
    expect(image.transientFields.typeTransitions).toEqual([ImageType.AuthorImage]);
  });

  it("generates trusted image type factory options for a named-only transition config", async () => {
    // Given an author image with a trusted initial type
    const em = newEntityManager();
    const image = newImage(em, { withType: ImageType.AuthorImage, author: newAuthor(em) });
    // When the image is created
    await em.flush();
    // Then its trusted type does not trigger the named creation callback
    expect(image.transientFields.typeTransitions).toEqual([]);
  });

  it("checks a transition table inherited from Publisher", async () => {
    // Given an Active LargePublisher with a spotlight author
    const em = newEntityManager();
    const p = newLargePublisher(em, { status: PublisherStatus.Active, spotlightAuthor: {} });
    await em.flush();
    // When its status is cleared
    // Then the base Publisher table rejects entering an unset state
    expect(() => {
      p.status = undefined;
    }).toThrow("Cannot change status from Active to unset");
  });

  it("checks subtype restrictions as well as the inherited transition table", async () => {
    // Given an Active SmallPublisher
    const em = newEntityManager();
    const p = newSmallPublisher(em, { status: PublisherStatus.Active });
    await em.flush();
    // When it returns to Draft, which the base Publisher table allows
    // Then the subtype's terminal Active state still rejects the change
    expect(() => {
      p.status = PublisherStatus.Draft;
    }).toThrow("Cannot change status from Active to Draft");
  });

  it("fires an inherited creation callback on a Publisher subtype", async () => {
    // Given a new Draft LargePublisher with a spotlight author
    const em = newEntityManager();
    const p = newLargePublisher(em, { status: PublisherStatus.Draft, spotlightAuthor: {} });
    // When the publisher is created
    await em.flush();
    // Then its base Publisher creation callback runs
    expect(p.transientFields.statusTransitions).toBe(1);
  });

  it("accepts an inherited trusted status factory option", async () => {
    // Given a LargePublisher factory with a trusted initial Active status and a spotlight author
    const em = newEntityManager();
    const p = newLargePublisher(em, { withStatus: PublisherStatus.Active, spotlightAuthor: {} });
    // When the publisher is created
    await em.flush();
    // Then its inherited creation callback is suppressed by the trusted status
    expect(p.transientFields.statusTransitions).toBe(0);
  });

  it("fires an inherited commit callback when a Publisher subtype is activated", async () => {
    // Given a Draft LargePublisher with a spotlight author
    const em = newEntityManager();
    const p = newLargePublisher(em, { status: PublisherStatus.Draft, spotlightAuthor: {} });
    await em.flush();
    // When it is activated
    p.status = PublisherStatus.Active;
    await em.flush();
    // Then its base Publisher commit callback handles the activation
    expect(p.transientFields.activeStatusCommitTransitions).toBe(1);
  });

  it("keeps inherited callbacks queued when a Publisher's status returns to its original value", async () => {
    // Given a Draft LargePublisher with a spotlight author
    const em = newEntityManager();
    const p = newLargePublisher(em, { status: PublisherStatus.Draft, spotlightAuthor: {} });
    await em.flush();
    // When it is activated and returned to Draft before the next flush
    p.status = PublisherStatus.Active;
    p.status = PublisherStatus.Draft;
    await em.flush();
    // Then its inherited callback has handled creation, activation, and return to Draft
    expect(p.transientFields.statusTransitions).toBe(3);
  });

  it("validates an inherited guard on a Publisher subtype", async () => {
    // Given a Draft LargePublisher with a spotlight author, blocked by the base Publisher guard
    const em = newEntityManager();
    const p = newLargePublisher(em, { name: "BlockedByBaseType", status: PublisherStatus.Draft, spotlightAuthor: {} });
    await em.flush();
    // When it is activated
    p.status = PublisherStatus.Active;
    // Then the base Publisher guard rejects its activation
    await expect(em.flush()).rejects.toThrow("Cannot activate an unapproved publisher");
  });

  it("skips a subtype callback when an inherited guard rejects activation", async () => {
    // Given a Draft SmallPublisher blocked by the base Publisher guard
    const em = newEntityManager();
    const p = newSmallPublisher(em, { name: "BlockedByBaseType", status: PublisherStatus.Draft });
    await em.flush();
    // When it is activated
    p.status = PublisherStatus.Active;
    await em.flush().catch((error: unknown) => {
      if (!(error instanceof ValidationErrors)) throw error;
    });
    // Then its subtype callback does not handle the rejected activation
    expect(p.transientFields.activeStatusTransitions).toBe(0);
  });

  it("skips an inherited callback when a subtype guard rejects activation", async () => {
    // Given a Draft SmallPublisher blocked by its own subtype guard
    const em = newEntityManager();
    const p = newSmallPublisher(em, { city: "BlockedBySubType", status: PublisherStatus.Draft });
    await em.flush();
    // When it is activated
    p.status = PublisherStatus.Active;
    await em.flush().catch((error: unknown) => {
      if (!(error instanceof ValidationErrors)) throw error;
    });
    // Then its base Publisher callback has only handled creation
    expect(p.transientFields.statusTransitions).toBe(1);
  });

  it("fires subtype callbacks when both base and subtype restrictions allow activation", async () => {
    // Given a Draft SmallPublisher approved for activation in an unrestricted city
    const em = newEntityManager();
    const p = newSmallPublisher(em, { status: PublisherStatus.Draft });
    await em.flush();
    // When it is activated
    p.status = PublisherStatus.Active;
    await em.flush();
    // Then its subtype activation callback runs alongside the inherited configuration
    expect(p.transientFields.activeStatusTransitions).toBe(1);
  });

  it("keeps an advance's transitions when another EntityManager flushes", async () => {
    // Given a Pending advance owned by one EntityManager
    const em = newEntityManager();
    const ba = newBookAdvance(em);
    await em.flush();
    // And another EntityManager owns a new advance
    const otherEm = newEntityManager();
    newBookAdvance(otherEm);
    // When the first advance is signed and the other EntityManager flushes first
    ba.status = AdvanceStatus.Signed;
    await otherEm.flush();
    await em.flush();
    // Then the first EntityManager handles its own recorded signature
    expect(ba.transientFields.transitions).toEqual([AdvanceStatus.Pending, AdvanceStatus.Signed]);
  });

  it("checks a payment guard once before its flush and commit callbacks", async () => {
    // Given a Signed advance for a published book
    const em = newEntityManager();
    const ba = newBookAdvance(em, { status: AdvanceStatus.Signed, book: { title: "Published" } });
    await em.flush();
    // When the advance is paid
    ba.status = AdvanceStatus.Paid;
    await em.flush();
    // Then payment eligibility is checked once for both callback phases
    expect(ba.transientFields.paidGuardInvoked).toBe(1);
  });

  it("does not recheck a payment guard after its callback changes the book", async () => {
    // Given a Signed advance for a published book
    const em = newEntityManager();
    const ba = newBookAdvance(em, { status: AdvanceStatus.Signed, book: { title: "Published" } });
    await em.flush();
    // And its payment callback withdraws the book from publication
    ba.transientFields.unpublishWhenPaid = true;
    // When the advance is paid while its book is still published
    ba.status = AdvanceStatus.Paid;
    await em.flush();
    // Then the callback's later change is persisted without revisiting payment eligibility
    expect(ba.book.get.title).toBe("Unpublished");
  });

  it("rejects a guarded derived state that has no transition callbacks", async () => {
    // Given an author who cannot enter the Lot book range
    const em = newEntityManager();
    const author = newAuthor(em, { firstName: "BlockedByGuard" });
    await em.flush();
    // When eleven books move the author from Few to Lot
    for (let i = 0; i < 11; i++) newBook(em, { author });
    // Then its guard rejects the derived state without any onTransition callback
    await expect(em.flush()).rejects.toThrow("Cannot give a blocked author a lot of books");
  });

  it("runs a commit callback even when activation is undone before flush", async () => {
    // Given a Draft LargePublisher with a spotlight author
    const em = newEntityManager();
    const p = newLargePublisher(em, { status: PublisherStatus.Draft, spotlightAuthor: {} });
    await em.flush();
    // When activation and return to Draft leave no net status change
    p.status = PublisherStatus.Active;
    p.status = PublisherStatus.Draft;
    await em.flush();
    // Then its queued activation callback still runs in the commit phase
    expect(p.transientFields.activeStatusCommitTransitions).toBe(1);
  });

  it("stops callbacks that repeatedly sign and revoke the same advance", async () => {
    // Given an advance whose callbacks sign and revoke each other's changes
    const em = newEntityManager();
    const ba = newBookAdvance(em);
    await em.flush();
    // And both automatic signature changes are enabled
    ba.transientFields.signWhenPending = true;
    ba.transientFields.revokeWhenSigned = true;
    // When the advance is signed
    ba.status = AdvanceStatus.Signed;
    // Then repeated transitions hit the existing reaction-loop limit
    await expect(em.flush()).rejects.toThrow("recalc looped too many times");
  });

  it("handles creation during explicit recalculation before flush", async () => {
    // Given a new Pending advance
    const em = newEntityManager();
    const ba = newBookAdvance(em);
    // When reactions are recalculated before the advance is flushed
    await em.recalc(ba);
    // Then its creation callback handles Pending
    expect(ba.transientFields.transitions).toEqual([AdvanceStatus.Pending]);
  });

  it("handles transitions produced by creation callbacks during explicit recalculation", async () => {
    // Given a new Pending advance whose opening callback signs it
    const em = newEntityManager();
    const ba = newBookAdvance(em);
    // And automatic signing is enabled
    ba.transientFields.signWhenPending = true;
    // When reactions are recalculated before flush
    await em.recalc(ba);
    // Then creation and the resulting signature are both handled
    expect(ba.transientFields.transitions).toEqual([AdvanceStatus.Pending, AdvanceStatus.Signed]);
  });

  it("evaluates guard-only transitions during explicit recalculation", async () => {
    // Given an author who cannot enter the Lot book range
    const em = newEntityManager();
    const author = newAuthor(em, { firstName: "BlockedByGuard" });
    await em.flush();
    // When eleven books move the author to Lot during recalculation
    for (let i = 0; i < 11; i++) newBook(em, { author });
    // Then its guard rejects Lot before any SQL flush
    await expect(em.recalc(author)).rejects.toThrow("Cannot give a blocked author a lot of books");
  });

  it("does not run commit callbacks during explicit recalculation", async () => {
    // Given a Signed advance
    const em = newEntityManager();
    const ba = newBookAdvance(em, { status: AdvanceStatus.Signed });
    await em.flush();
    // When payment is handled by recalculation without flushing
    ba.status = AdvanceStatus.Paid;
    await em.recalc(ba);
    // Then its payment commit callback is still deferred
    expect(ba.transientFields.onPaidCommitInvoked).toBe(0);
  });

  it("retains commit callbacks queued by explicit recalculation until flush", async () => {
    // Given a Signed advance
    const em = newEntityManager();
    const ba = newBookAdvance(em, { status: AdvanceStatus.Signed });
    await em.flush();
    // And payment has been handled by recalculation
    ba.status = AdvanceStatus.Paid;
    await em.recalc(ba);
    // When the advance is flushed
    await em.flush();
    // Then its previously queued payment commit callback runs once
    expect(ba.transientFields.onPaidCommitInvoked).toBe(1);
  });

  it("batches hinted books across payment guards on different advances", async () => {
    // Given three Signed advances for different books
    await insertAuthor({ first_name: "a1" });
    await insertPublisher({ name: "p1" });
    for (let i = 1; i <= 3; i++) {
      await insertBook({ title: `b${i}`, author_id: 1 });
      await insertBookAdvance({ book_id: i, publisher_id: 1, status_id: 2 });
    }
    // And the advances are loaded without their books
    const em = newEntityManager();
    const advances = await em.find(BookAdvance, {});
    // When all three advances are paid together
    for (const advance of advances) advance.status = AdvanceStatus.Paid;
    resetQueryCount();
    await em.recalc(advances);
    // Then the guards load their books with one batched query
    expect(queries).toHaveLength(1);
  });

  it("batches hinted books across callbacks when no matching guard loads them", async () => {
    // Given three Signed advances for different books
    await insertAuthor({ first_name: "a1" });
    await insertPublisher({ name: "p1" });
    for (let i = 1; i <= 3; i++) {
      await insertBook({ title: `b${i}`, author_id: 1 });
      await insertBookAdvance({ book_id: i, publisher_id: 1, status_id: 2 });
    }
    // And the advances are loaded without their books
    const em = newEntityManager();
    const advances = await em.find(BookAdvance, {});
    // When all three signatures are revoked together
    for (const advance of advances) advance.status = AdvanceStatus.Pending;
    resetQueryCount();
    await em.recalc(advances);
    // Then the callbacks load their books with one batched query
    expect(queries).toHaveLength(1);
  });

  it("preserves each advance's transition order across waves of different lengths", async () => {
    // Given two existing Pending advances
    const em = newEntityManager();
    const advances = [newBookAdvance(em), newBookAdvance(em)];
    await em.flush();
    // When one advance cycles through three changes and the other is signed and paid
    advances[0].status = AdvanceStatus.Signed;
    advances[0].status = AdvanceStatus.Pending;
    advances[0].status = AdvanceStatus.Signed;
    advances[1].status = AdvanceStatus.Signed;
    advances[1].status = AdvanceStatus.Paid;
    await em.flush();
    // Then each advance's callbacks keep its own recorded order
    expect(advances[0].transientFields.transitions).toEqual([
      AdvanceStatus.Pending,
      AdvanceStatus.Signed,
      AdvanceStatus.Pending,
      AdvanceStatus.Signed,
    ]);
    expect(advances[1].transientFields.transitions).toEqual([
      AdvanceStatus.Pending,
      AdvanceStatus.Signed,
      AdvanceStatus.Paid,
    ]);
  });

  it("batches hinted publishers across payment commit callbacks", async () => {
    // Given three Signed advances for different publishers
    await insertAuthor({ first_name: "a1" });
    for (let i = 1; i <= 3; i++) {
      await insertPublisher({ id: i, name: `p${i}` });
      await insertBook({ title: `b${i}`, author_id: 1 });
      await insertBookAdvance({ book_id: i, publisher_id: i, status_id: 2 });
    }
    // And payment is handled before commit without loading the publishers
    const em = newEntityManager();
    const advances = await em.find(BookAdvance, {});
    for (const advance of advances) advance.status = AdvanceStatus.Paid;
    await em.recalc(advances);
    // When the payment commit callbacks run
    resetQueryCount();
    await em.flush();
    // Then the commit callbacks load their publishers with one batched query
    expect(queries.filter((sql) => sql.startsWith("SELECT"))).toHaveLength(1);
  });

  it("lets a commit callback read a new advance's id", async () => {
    // Given an advance created as Paid
    const em = newEntityManager();
    const ba = newBookAdvance(em, { status: AdvanceStatus.Paid });
    // And its payment commit callback reads its id
    ba.transientFields.readPaidIdAtCommit = true;
    // When the advance is flushed
    await em.flush();
    // Then the commit callback has the assigned id
    expect(ba.transientFields.paidId).toBe("ba:1");
  });
});
