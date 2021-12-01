import { EntityDbMetadata } from "EntityDbMetadata";
import { groupBy } from "joist-utils";

// Aggregate root detection
export function configureAggregateRoots(entities: EntityDbMetadata[]) {
  // TODO Use keyBy
  const entitiesByName = groupBy(entities, (e) => e.name);

  // 0. Do an initial pass at "what entities are aggregate roots", based on root convention + config.
  entities.forEach((entity) => {
    entity.manyToOnes
      .filter((m2o) => m2o.aggregateRoot)
      .filter(({ columnName, fieldName, otherEntity }) => {
        const other = entitiesByName[otherEntity.name][0]!;
        other.aggregateChildren.add(entity.name);
      });
  });

  // 0.5 Now that we know our roots, we can do a 2nd pass looking for non-`root_` prefixed keys
  entities.forEach((entity) => {
    entity.manyToOnes
      .filter((m2o) => !m2o.aggregateRoot && m2o.notNull)
      .filter((m2o) => {
        const other = entitiesByName[m2o.otherEntity.name][0]!;
        // TODO Look for `aggregateRoot: false` in the config
        if (other.isAggregateRoot) {
          m2o.aggregateRoot = true;
          other.aggregateChildren.add(entity.name);
        }
      });
  });

  // 1. Mark each entity has part of each given aggregate root
  entities.forEach((e) => {
    e.manyToOnes
      .filter((m2o) => m2o.aggregateRoot)
      .forEach((m2o) => {
        e.aggregateRoots.add(m2o.otherEntity.name);
      });
  });

  // 2. Try to hook up to where the aggregate root can come from
  entities.forEach((e) => {
    e.manyToOnes
      .filter((m2o) => m2o.aggregateRoot)
      .forEach((m2o) => {
        // Look for other m2os that could point to the aggregate root
        e.manyToOnes
          .filter((o) => o !== m2o)
          .forEach((other) => {
            // I.e. a book_id that has our Author root
            const otherEntity = entitiesByName[other.otherEntity.name][0];
            const hasOurRoot = otherEntity.aggregateRoots.has(m2o.otherEntity.name);
            if (hasOurRoot) {
              m2o.aggregateRootFrom.push(other.fieldName);
              other.aggregateRootTo.push(m2o.fieldName);
              if (other.notNull) {
                m2o.aggregateRootDerivable = true;
              }
            }
          });
        // TODO Look for polys that could point to the aggregate root
      });
  });
}
