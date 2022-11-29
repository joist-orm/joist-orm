import { Changes, EntityChanges } from "./changes";
import { Entity } from "./Entity";
import { ReactiveHint } from "./reactiveHints";
import { groupBy, MaybePromise, maybePromiseThen } from "./utils";

/**
 * The return type of `ValidationRule`.
 *
 * Consumers can extend `GenericError` to add fields relevant for their application.
 */
export type ValidationRuleResult<E extends GenericError> = string | E | E[] | undefined;

/** An entity validation rule. */
export type ValidationRule<T extends Entity> = (entity: T) => MaybePromise<ValidationRuleResult<any>>;

/** Internal metadata for an async/reactive validation rule. */
export type ValidationRuleInternal<T extends Entity> = {
  name: string;
  hint: ReactiveHint<T> | undefined;
  fn: ValidationRule<T>;
};

/** Internal metadata for an async derived field. */
export type AsyncDerivedFieldInternal<T extends Entity> = {
  name: string;
  hint: ReactiveHint<T>;
  fn: (entity: T) => Promise<void>;
};

/** A generic error which contains only a message field */
export type GenericError = { message: string };

/** An extension to GenericError which associates the error to a specific entity */
export type ValidationError = { entity: Entity } & GenericError;

export class ValidationErrors extends Error {
  constructor(public errors: ValidationError[]) {
    super(errorMessage(errors));
  }
}

/**
 * Creates a validation rule for required fields.
 *
 * This is added automatically by codegen to entities based on FK not-nulls.
 */
export function newRequiredRule<T extends Entity>(key: keyof T & string): ValidationRule<T> {
  return (entity) => (entity.__orm.data[key] === undefined ? `${key} is required` : undefined);
}

/**
 * Creates a validation rule that a field cannot be updated; it can only be set on creation.
 *
 * If the optional `unless` function returns true, then the update is allowed.
 */
export function cannotBeUpdated<T extends Entity & EntityChanges<T>, K extends keyof Changes<T> & string>(
  field: K,
  unless?: (entity: T) => MaybePromise<boolean>,
): CannotBeUpdatedRule<T> {
  const fn = async (entity: T) => {
    if (entity.changes[field].hasUpdated) {
      return maybePromiseThen(unless ? unless(entity) : false, (result) => {
        if (!result) {
          return `${field} cannot be updated`;
        }
        return undefined;
      });
    }
    return undefined;
  };
  return Object.assign(fn, { field, immutable: unless === undefined });
}

type CannotBeUpdatedRule<T extends Entity> = ValidationRule<T> & { field: string; immutable: boolean };

export function isCannotBeUpdatedRule(rule: Function): rule is CannotBeUpdatedRule<any> {
  return "field" in rule && "immutable" in rule;
}

function errorMessage(errors: ValidationError[]): string {
  if (errors.length === 1) {
    return `Validation error: ${errors[0].entity.toString()} ${errors[0].message}`;
  } else {
    const message = [...groupBy(errors, (e) => e.entity.toString()).entries()]
      .map(([entityToString, errors]) => `${entityToString} ${errors.map((e) => e.message).join(", ")}`)
      .join(", ");
    return `Validation errors (${errors.length}): ${message}`;
  }
}

/**
 * Creates a validation rule that a field value cannot be smaller than a
 * certain value.
 *
 * @param field The field to validate
 * @param minValue The inclusive minimum value. e.g 0 range is [0, Infinity]
 *
 * @example
 * // Age cannot be smaller than 0
 * config.addRule(minValueRule("age", 0));
 */
export function minValueRule<T extends Entity, K extends keyof T & string>(
  field: K,
  minValue: number,
): ValidationRule<T> {
  return (entity) => {
    const value = entity[field];

    // Ignore undefined and null values
    if (value === undefined || value === null) return;

    // Show an error when the value type is not a number
    if (typeof value !== "number") {
      return `${field} must be a number`;
    }

    // Show an error when the value is smaller than the minimum value
    if (value < minValue) {
      return `${field} must be greater than or equal to ${minValue}`;
    }

    return;
  };
}

/**
 * Creates a validation rule that a field value cannot be greater than a
 * certain value.
 *
 * @param field The field to validate
 * @param maxValue The include maximum value. e.g 10 range is [-Infinity, 10]
 *
 * @example
 * // Age cannot be greater than 150
 * config.addRule(maxValueRule("age", 150));
 */
export function maxValueRule<T extends Entity, K extends keyof T & string>(
  field: K,
  maxValue: number,
): ValidationRule<T> {
  return (entity) => {
    const value = entity[field];

    // Ignore undefined and null values
    if (value === undefined || value === null) return;

    // Show an error when the value type is not a number
    if (typeof value !== "number") {
      return `${field} must be a number`;
    }

    // Show an error when the value is smaller than the minimum value
    if (value > maxValue) {
      return `${field} must be smaller than or equal to ${maxValue}`;
    }

    return;
  };
}

/**
 * Creates a validation rule that a field value must be within a range of
 * certain values
 *
 * @param field The field to validate
 * @param minValue The inclusive minimum value. e.g  0 [0,   Infinity]
 * @param maxValue The include maximum value.   e.g 10 [-Infinity, 10]
 *
 * @example
 * // Age must be between 0 and 150
 * config.addRule(rangeValueRule("age", 0, 150));
 */
export function rangeValueRule<T extends Entity, K extends keyof T & string>(
  field: K,
  minValue: number,
  maxValue: number,
): ValidationRule<T> {
  return (entity) => {
    // Check min and max value rules
    const minValueResult = minValueRule<T, K>(field, minValue)(entity);
    const maxValueResult = maxValueRule<T, K>(field, maxValue)(entity);

    // Return any errors or nothing
    if (minValueResult) return minValueResult;
    if (maxValueResult) return maxValueResult;
    return;
  };
}
