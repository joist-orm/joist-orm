const em = new EntityManager();
console.log(em.currentTxnKnex.query);
console.log(em.currentTxnKnex?.query);
