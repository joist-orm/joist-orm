async function run(em: EntityManager) {
  await em.findPaginated(Author, {}, { limit: 10, offset: 20 });
  await em.findGqlPaginated(Author, { firstName: { eq: "a1" } }, { limit: 10 });
  await em.find(Author, {});
}
