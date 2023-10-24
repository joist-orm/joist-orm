import {newEntityManager} from "@src/setupDbTests";
import {Publisher, SmallPublisher} from "@src/entities";
import {alias} from "joist-orm";

describe('EntityManager cti queries', () => {

  it('finds against child with simple parent filter', async () => {
    const em = newEntityManager();

    em.create(SmallPublisher, {
      name: 'p1',
      city: 'location'
    });

    await em.flush();

    const res = await em.find(SmallPublisher, { name: 'p1' })

    expect(res.length).toBe(1);
  });

  it('finds against parent with simple parent filter', async () => {
    const em = newEntityManager();

    em.create(SmallPublisher, {
      name: 'p1',
      city: 'location'
    });

    await em.flush();

    const res = await em.find(Publisher, { name: 'p1' })

    expect(res.length).toBe(1);
  });

  it('finds against child with simple child filter', async () => {
    const em = newEntityManager();

    em.create(SmallPublisher, {
      name: 'p1',
      city: 'location'
    });

    await em.flush();

    const res = await em.find(SmallPublisher, { city: 'location' })

    expect(res.length).toBe(1);
  });

  it('finds against child with simple child & parent filter', async () => {
    const em = newEntityManager();

    em.create(SmallPublisher, {
      name: 'p1',
      city: 'location'
    });

    await em.flush();

    const res = await em.find(SmallPublisher, { name: 'p1', city: 'location' })

    expect(res.length).toBe(1);
  });

  it('finds against child with complex child & parent filter, alias child', async () => {
    const em = newEntityManager();

    em.create(SmallPublisher, {
      name: 'p1',
      city: 'location'
    });

    await em.flush();

    const sp = alias(SmallPublisher);
    const res = await em.find(SmallPublisher, { as: sp }, { conditions: { and: [sp.name.eq('p1')]}})

    expect(res.length).toBe(1);
  });

  it.only('finds against child with simple child & parent filter', async () => {
    const em = newEntityManager();

    em.create(SmallPublisher, {
      name: 'p1',
      city: 'location'
    });

    await em.flush();

    const sp = alias(Publisher);
    const res = await em.find(SmallPublisher, { as: sp }, { conditions: { and: [sp.name.eq('p1')]}})

    expect(res.length).toBe(1);
  });
});