import { Changes, EntityChanges } from "./changes";
import { Entity } from "./Entity";
import { getEmInternalApi } from "./EntityManager";
import { getField } from "./fields";
import { ReactiveHint } from "./reactiveHints";
import { isLoadedReference, isReactiveQueryField, ManyToOneReferenceImpl } from "./relations";
import { FieldsOf } from "./typeMap";
import { groupBy, MaybePromise, maybePromiseThen } from "./utils";

export enum ValidationCode {
  required = "required",
  cannotBeUpdated = "not-updatable",
  numeric = "not-numeric",
  minValue = "under-min",
  maxValue = "over-max",
}

/**
 * The return type of `ValidationRule` lambdas.
 *
 * We're flexible and allow rules to return a variety of shapes, like just a string, string[], etc.
 *
 * Returning `undefined` means the rule passed.
 */
export type ValidationRuleResult = string | string[] | GenericError | GenericError[] | undefined | void;

/** An entity validation rule. */
export type ValidationRule<T extends Entity> = (entity: T) => MaybePromise<ValidationRuleResult>;

/** Internal metadata for an async/reactive validation rule. */
export type ValidationRuleInternal<T extends Entity> = {
  name: string;
  hint: ReactiveHint<T> | undefined;
  fn: ValidationRule<T>;
};

/** A generic error which contains a message, and optional field/codes. */
export type GenericError = { message: string; field?: string; code?: string };

/** Combines the GenericError with the `entity` that caused it. */
export type ValidationError = { entity: Entity } & GenericError;

export type ValidationRuleOptsFn<T extends Entity> = (entity: T) => MaybePromise<boolean>;
export type ValidationRuleOpts<T extends Entity> = {
  unless?: ValidationRuleOptsFn<T>;
  if?: ValidationRuleOptsFn<T>;
};

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

export class ValidationErrors extends Error {
  public errors: Array<GenericError | ValidationError>;
  public readonly toJSON: () => string;
  constructor(errors: ValidationError[]);
  constructor(message: string);
  constructor(messageOrErrors: ValidationError[] | string) {
    super(typeof messageOrErrors === "string" ? messageOrErrors : errorMessage(messageOrErrors));
    this.errors = typeof messageOrErrors === "string" ? [{ message: messageOrErrors }] : messageOrErrors;
    // Jest clones without prototype, so explictly setting this as a property rather than a class method
    // https://github.com/jestjs/jest/issues/11958
    this.toJSON = () => `ValidationErrors: ${this.message}`;
  }
}

function ruleWithOpts<T extends Entity>(
  opts: ValidationRuleOpts<T>,
  fn: (entity: T) => ValidationRuleResult,
): ValidationRule<T> {
  return (entity) => {
    // Since all of our rules are sync, we run the rule first, then check if we should have run it second since this
    // may be an async operation.  This way we can avoid running promises if we don't have to.
    const result = fn(entity);
    if (result === undefined) return;
    const { unless, if: _if } = opts;
    if (unless === undefined && _if === undefined) return result;
    const shouldRun = [unless ?? (() => false), _if ?? (() => true)].map((fn) => fn(entity));
    return maybePromiseThen(
      shouldRun.some((r) => r instanceof Promise) ? Promise.all(shouldRun) : (shouldRun as boolean[]),
      ([unless, _if]) => (!unless && _if ? result : undefined),
    );
  };
}

/**
 * Creates a validation rule for required fields.
 *
 * This is added automatically by codegen to entities based on FK not-nulls.
 */
export function newRequiredRule<T extends Entity>(
  key: keyof FieldsOf<T> & string,
  opts: ValidationRuleOpts<T> = {},
): ValidationRule<T> {
  return ruleWithOpts(opts, (entity) => {
    // Use getField so that we peer through relations
    if (getField(entity, key) === undefined) {
      // Sanity check for ReactiveQueryFields--this should be cheap to just always do; alternatively we could
      // have a RQF-specific `rqfRequiredRule` so that other `newRequiredRule` users don't pay the cost of these
      // two `if` checks`.
      if (entity.isNewEntity && isReactiveQueryField((entity as any)[key])) {
        throw new Error(
          `ReactiveQueryField ${entity.constructor.name}.${key} must have a default value, either in the database or with config.setDefault (see the 4th step in https://joist-orm.io/modeling/reactive-fields/#reactive-query-fields.`,
        );
      }
      return { field: key, code: ValidationCode.required, message: `${key} is required` };
    }
  });
}

/**
 * Creates a validation rule that a field cannot be updated; it can only be set on creation.
 *
 * If the optional `unless` function returns true, then the update is allowed.
 */
export function cannotBeUpdated<T extends Entity, K extends keyof Changes<T> & string>(
  field: K,
  opts?: ValidationRuleOpts<T>,
): CannotBeUpdatedRule<T>;
export function cannotBeUpdated<T extends Entity, K extends keyof Changes<T> & string>(
  field: K,
  unless?: ValidationRuleOptsFn<T>,
): CannotBeUpdatedRule<T>;
export function cannotBeUpdated<T extends Entity, K extends keyof Changes<T> & string>(
  field: K,
  optsOrUnless?: ValidationRuleOpts<T> | ValidationRuleOptsFn<T>,
): CannotBeUpdatedRule<T> {
  const opts = typeof optsOrUnless === "function" ? { unless: optsOrUnless } : (optsOrUnless ?? {});
  const fn = ruleWithOpts(opts, (entity: T) => {
    // For now putting the `EntityChanges` cast here to avoid breaking cannotBeUpdated rules
    // on base types, see Publisher.ts's `cannotBeUpdated("type")` repro.
    if ((entity as any as EntityChanges<T>).changes[field].hasUpdated) {
      const value = (entity as any)[field];
      // If we're being changed b/c of an em.merge, that is okay
      if (isLoadedReference(value) && getEmInternalApi(entity.em).isMerging(value.get)) return;
      return { field, code: ValidationCode.cannotBeUpdated, message: `${field} cannot be updated` };
    }
    return;
  });
  return Object.assign(fn, { field, immutable: opts.unless === undefined && opts.if === undefined });
}

type CannotBeUpdatedRule<T extends Entity> = ValidationRule<T> & { field: string; immutable: boolean };

export function isCannotBeUpdatedRule(rule: Function): rule is CannotBeUpdatedRule<any> {
  return "field" in rule && "immutable" in rule;
}

/** For STI, enforces subtype-specific relations/FKs at runtime. */
export function mustBeSubType<T extends Entity, K extends keyof Changes<T> & string>(
  relationName: K,
  opts: ValidationRuleOpts<T> = {},
): ValidationRule<T> {
  return ruleWithOpts(opts, (entity) => {
    const m2o = (entity as any)[relationName] as ManyToOneReferenceImpl<any, any, any>;
    const other = m2o.get;
    const otherCstr = m2o.otherMeta.cstr;
    if (other && !(other instanceof otherCstr)) {
      return `${relationName} must be a ${otherCstr.name} not ${other}`;
    }
  });
}

/**
 * Creates a validation rule that a field value cannot be smaller than a
 * certain value.
 *
 * @param field The field to validate
 * @param minValue The inclusive minimum value. e.g 0 range is [0, Infinity]
 * @param opts Optional validation rule options that control when the rule should run:
 *   - unless: Function that returns true to skip validation
 *   - if: Function that returns true to run validation
 *
 * @example
 * // Age cannot be smaller than 0
 * config.addRule(minValueRule("age", 0));
 */
export function minValueRule<T extends Entity, K extends keyof T & string>(
  field: K,
  minValue: number,
  opts: ValidationRuleOpts<T> = {},
): ValidationRule<T> {
  return ruleWithOpts(opts, (entity) => {
    const value = entity[field];
    // Ignore undefined and null values. These should be handled by required rules
    if (value === undefined || value === null) return;
    // Show an error when the value type is not a number
    if (typeof value !== "number") {
      return { field, code: ValidationCode.numeric, message: `${field} must be a number` };
    }
    // Show an error when the value is smaller than the minimum value
    if (value < minValue) {
      return {
        field,
        code: ValidationCode.minValue,
        message: `${field} must be greater than or equal to ${minValue}`,
      };
    }
    return;
  });
}

/**
 * Creates a validation rule that a field value cannot be greater than a
 * certain value.
 *
 * @param field The field to validate
 * @param maxValue The include maximum value. e.g 10 range is [-Infinity, 10]
 * @param opts Optional validation rule options that control when the rule should run:
 *   - unless: Function that returns true to skip validation
 *   - if: Function that returns true to run validation
 *
 * @example
 * // Age cannot be greater than 150
 * config.addRule(maxValueRule("age", 150));
 */
export function maxValueRule<T extends Entity, K extends keyof T & string>(
  field: K,
  maxValue: number,
  opts: ValidationRuleOpts<T> = {},
): ValidationRule<T> {
  return ruleWithOpts(opts, (entity) => {
    const value = entity[field];
    // Ignore undefined and null values. These should be handled by required rules
    if (value === undefined || value === null) return;
    // Show an error when the value type is not a number
    if (typeof value !== "number") {
      return { field, code: ValidationCode.numeric, message: `${field} must be a number` };
    }
    // Show an error when the value is smaller than the minimum value
    if (value > maxValue) {
      return {
        field,
        code: ValidationCode.maxValue,
        message: `${field} must be smaller than or equal to ${maxValue}`,
      };
    }
    return;
  });
}

/**
 * Creates a validation rule that a field value must be within a range of
 * certain values
 *
 * @param field The field to validate
 * @param minValue The inclusive minimum value. e.g  0 [0,   Infinity]
 * @param maxValue The include maximum value.   e.g 10 [-Infinity, 10]
 * @param opts Optional validation rule options that control when the rule should run:
 *   - unless: Function that returns true to skip validation
 *   - if: Function that returns true to run validation * @example
 *
 * // Age must be between 0 and 150
 * config.addRule(rangeValueRule("age", 0, 150));
 */
export function rangeValueRule<T extends Entity, K extends keyof T & string>(
  field: K,
  minValue: number,
  maxValue: number,
  opts: ValidationRuleOpts<T> = {},
): ValidationRule<T> {
  return ruleWithOpts(opts, (entity) => {
    // Check min and max value rules.  Because these are called without opts, it should be safe to treat them as sync.
    const minValueResult = minValueRule<T, K>(field, minValue)(entity) as ValidationRuleResult;
    const maxValueResult = maxValueRule<T, K>(field, maxValue)(entity) as ValidationRuleResult;
    // Return any errors or nothing
    if (minValueResult) return minValueResult;
    if (maxValueResult) return maxValueResult;
    return;
  });
}
