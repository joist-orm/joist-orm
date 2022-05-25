import { Entity } from "./EntityManager";

/**
 * Return type of a `ValidationRule`.
 *
 * Consumers can extend `GenericError` to add fields relevant for their application.
 */
export type ValidationRuleResult<E extends GenericError> = string | E | E[] | undefined;

/** Entity validation errors; if `entity` is invalid, throw a `ValidationError`. */
export type ValidationRule<T extends Entity> = (entity: T) => MaybePromise<ValidationRuleResult<any>>;

export type MaybePromise<T> = T | PromiseLike<T>;

/** A generic error which contains only a message field */
export type GenericError = { message: string };

/** An extension to GenericError which associates the error to a specific entity */
export type ValidationError = { entity: Entity } & GenericError;

export class ValidationErrors extends Error {
  constructor(public errors: ValidationError[]) {
    super(errorMessage(errors));
  }
}

export function newRequiredRule<T extends Entity>(key: keyof T & string): ValidationRule<T> {
  return (entity) => (entity.__orm.data[key] === undefined ? `${key} is required` : undefined);
}

function errorMessage(errors: ValidationError[]): string {
  if (errors.length === 1) {
    return `Validation error: ${errors[0].message}`;
  } else {
    return `Validation errors (${errors.length}): ${errors.map((e) => e.message).join(", ")}`;
  }
}
