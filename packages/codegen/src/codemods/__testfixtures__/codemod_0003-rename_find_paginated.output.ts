async function run(em: EntityManager) {
  await em.find(Author, {}, { limit: 10, offset: 20 });
  await em.findGql(Author, { firstName: { eq: "a1" } }, { limit: 10 });
  await em.find(Author, {});
}
