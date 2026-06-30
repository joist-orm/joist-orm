import { type DeepNew, type FactoryOpts, newTestInstance } from "joist-orm";
import { Employee, type EntityManager } from "../entities";

export function newEmployee(em: EntityManager, opts: FactoryOpts<Employee> = {}): DeepNew<Employee> {
  return newTestInstance(em, Employee, opts, {});
}
