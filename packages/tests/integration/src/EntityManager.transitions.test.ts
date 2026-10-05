import { ValidationErrors } from "joist-orm";
import {
  AdvanceStatus,
  BookAdvance,
  ImageType,
  PublisherStatus,
  newAuthor,
  newBookAdvance,
  newImage,
  newLargePublisher,
  newSmallPublisher,
} from "src/entities";
import { newEntityManager } from "src/testEm";

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
    // When the same unapproved signature is retried
    // Then its recorded transition still fails the signing guard
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

  it("runs separately named payment callbacks registered through the same helper", async () => {
    // Given an advance created as Paid with two separately named payment callbacks
    const em = newEntityManager();
    const ba = newBookAdvance(em, { status: AdvanceStatus.Paid });
    // When the advance enters Paid by creation
    await em.flush();
    // Then both named payment callbacks have handled the advance
    expect(ba.transientFields.namedPayments.sort()).toEqual(["notifyAuthor", "recordPayment"]);
  });

  it("rejects duplicate unnamed payment callbacks during registration", () => {
    // Given a payment helper that registers two callbacks from the same source location
    // When the second callback is registered during entity boot
    const error = BookAdvance.reactionRegistrationErrors.unnamedTransition;
    // Then registration tells the caller to give the callbacks unique names
    expect(() => {
      throw error;
    }).toThrow(/Duplicate reaction name .*config.onTransition.*Pass a unique name/);
  });

  it("rejects duplicate explicit payment callback names during registration", () => {
    // Given a payment callback already named recordPayment
    // When another payment callback requests the same name during entity boot
    const error = BookAdvance.reactionRegistrationErrors.namedTransition;
    // Then registration rejects the duplicate name
    expect(() => {
      throw error;
    }).toThrow('Duplicate reaction name "recordPayment" in config.onTransition');
  });

  it("rejects a payment callback name already used by an ordinary reaction", () => {
    // Given an ordinary status reaction already named recordStatus
    // When a payment callback requests the same name during entity boot
    const error = BookAdvance.reactionRegistrationErrors.sharedName;
    // Then registration rejects the shared reaction identity
    expect(() => {
      throw error;
    }).toThrow('Duplicate reaction name "recordStatus" in config.onTransition');
  });

  it("rejects duplicate commit-phase payment callback names during registration", () => {
    // Given a commit-phase payment callback already named countPaidCommit
    // When another commit-phase callback requests the same name during entity boot
    const error = BookAdvance.reactionRegistrationErrors.commitTransition;
    // Then registration rejects the duplicate name before registering its hook
    expect(() => {
      throw error;
    }).toThrow('Duplicate reaction name "countPaidCommit" in config.onTransition');
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
    // Given a Draft LargePublisher with a spotlight author that has not been approved for activation
    const em = newEntityManager();
    const p = newLargePublisher(em, { name: "ActivationBlocked", status: PublisherStatus.Draft, spotlightAuthor: {} });
    await em.flush();
    // When it is activated
    p.status = PublisherStatus.Active;
    // Then the base Publisher guard rejects its activation
    await expect(em.flush()).rejects.toThrow("Cannot activate an unapproved publisher");
  });

  it("skips a subtype callback when an inherited guard rejects activation", async () => {
    // Given a Draft SmallPublisher that has not been approved for activation
    const em = newEntityManager();
    const p = newSmallPublisher(em, { name: "ActivationBlocked", status: PublisherStatus.Draft });
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
    // Given a Draft SmallPublisher in a city where activation is restricted
    const em = newEntityManager();
    const p = newSmallPublisher(em, { city: "Restricted", status: PublisherStatus.Draft });
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
});
