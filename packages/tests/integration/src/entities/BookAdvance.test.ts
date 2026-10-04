import { AdvanceStatus, newBookAdvance } from "src/entities";
import { newEntityManager } from "src/testEm";

describe("BookAdvance", () => {
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
    expect(ba.transientFields.committedPaid).toBe(1);
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
    expect(ba.transientFields.committedPaid).toBe(0);
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
});
