import { OneToManyCollection } from "./collections/OneToManyCollection";
import { ManyToManyCollection } from "./collections/ManyToManyCollection";
import { ManyToOneReference } from "./collections/ManyToOneReference";
import { Entity, EntityManager } from "./EntityManager";
import * as util from "util";
import { BaseEntity } from "./BaseEntity";
import { type } from "os";

// These proxies are passed into hooks during a flush to enable changes mid flush

type FlushProxy<T> = T & { __flushSecret: number; __proxyTarget: T };

export function isFlushProxy<T>(objectOrProxy: T): objectOrProxy is FlushProxy<T> {
  return util.types.isProxy(objectOrProxy) && (objectOrProxy as any).__flushSecret !== undefined;
}

export function deproxyMaybeFlushProxy<T>(objectOrProxy: T | FlushProxy<T>): T {
  return isFlushProxy(objectOrProxy) ? objectOrProxy.__proxyTarget : objectOrProxy;
}

export function deproxyMaybeFlushProxyArray<T>(
  arrayOrProxy: (T | FlushProxy<T>)[] | FlushProxy<(T | FlushProxy<T>)[]> | undefined,
): T[] | undefined {
  if (arrayOrProxy === undefined) {
    return undefined;
  }

  const array = deproxyMaybeFlushProxy(arrayOrProxy);

  array.forEach((value, i) => {
    array[i] = deproxyMaybeFlushProxy(value);
  });

  return array;
}

function maybeProxy<T extends any>(object: T, flushSecret: number): any {
  if (typeof object === "function" && !/^class\s/.test(object.toString())) {
    return function (this: any, ...args: any[]) {
      return maybeProxy(
        object.apply(
          this,
          args.map((arg) => deproxyMaybeFlushProxy(arg)),
        ),
        flushSecret,
      );
    };
  } else if (typeof object === "object" && object !== null) {
    if (object instanceof Promise) {
      return object.then((result) => maybeProxy(result, flushSecret));
    } else if (
      Array.isArray(object) ||
      object instanceof EntityManager ||
      object instanceof BaseEntity ||
      object instanceof OneToManyCollection ||
      object instanceof ManyToManyCollection ||
      object instanceof ManyToOneReference
    ) {
      return createFlushProxy(object, flushSecret);
    }
  }

  return object;
}

export function maybeFlushDeproxy(object: any, evaluated: any[] = []): any {
  object = deproxyMaybeFlushProxy(object);

  if (evaluated.includes(object)) {
    return object;
  }

  evaluated.push(object);

  for (var key in object) {
    const value = object[key];

    if (
      Array.isArray(value) ||
      value instanceof EntityManager ||
      value instanceof BaseEntity ||
      value instanceof OneToManyCollection ||
      value instanceof ManyToManyCollection ||
      value instanceof ManyToOneReference
    ) {
      object[key] = maybeFlushDeproxy(value, evaluated);
    }
  }

  return object;
}

export function createFlushProxy<T extends object>(target: T, flushSecret: number): FlushProxy<T> {
  if (isFlushProxy(target)) {
    // target.__flushSecret = flushSecret;
    return target;
  }

  return new Proxy(target, {
    get(target, property, receiver) {
      if (property === "__flushSecret") {
        return flushSecret;
      }

      if (property === "__proxyTarget") {
        return target;
      }

      // knex seems to really dislike being put through maybeProxy
      if (property === "knex") {
        return (target as any).knex;
      }

      return maybeProxy(Reflect.get(target, property, receiver), flushSecret);
    },
    set(target, property, value, receiver) {
      if (isFlushProxy(value) && typeof property === "string") {
        console.log(`set ${property} to FlushProxy`);
      }

      value = deproxyMaybeFlushProxy(value);

      if (property === "__flushSecret") {
        flushSecret = value;
        return true;
      }

      return Reflect.set(target, property, value, receiver);
    },
  }) as FlushProxy<T>;
}
