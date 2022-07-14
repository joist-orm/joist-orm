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
  return (entity) => {
    return entity.__orm.data[key] === undefined ? `${key} is required` : undefined;
  };
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
