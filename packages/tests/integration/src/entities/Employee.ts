import { hasReactiveManyToMany, type ReactiveManyToMany } from "joist-orm";
import { EmployeeCodegen } from "./entities";

export class Employee extends EmployeeCodegen {
  /**
   * Tracks self and all recursive managers for the closure-table blog scenario.
   * @generated Employee.md
   */
  readonly managersClosure: ReactiveManyToMany<Employee, Employee> = hasReactiveManyToMany(
    "managersRecursive",
    function managersClosure(employee) {
      return [employee, ...employee.managersRecursive.get];
    },
  );
}
