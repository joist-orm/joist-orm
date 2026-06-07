import { Employee } from "src/entities";
import type { EmployeeResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const employeeResolvers: EmployeeResolvers = { ...entityResolver(Employee) };
