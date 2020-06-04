import { OneToManyCollection } from "./collections/OneToManyCollection";
import { ManyToManyCollection } from "./collections/ManyToManyCollection";
import { ManyToOneReference } from "./collections/ManyToOneReference";
import { Entity, EntityManager } from "./EntityManager";
import * as util from "util";

// These proxies are passed into hooks during a flush to enable changes mid flush

type FlushProxy<T> = T & { __flushSecret: number; __proxyTarget: T };
type Loader = OneToManyCollection<any, any> | ManyToManyCollection<any, any> | ManyToOneReference<any, any, any>;

export function isFlushProxy<T>(objectOrProxy: T): objectOrProxy is FlushProxy<T> {
  return util.types.isProxy(objectOrProxy) && (objectOrProxy as any).__flushSecret !== undefined;
}

export function getTargetFromMaybeFlushProxy<T>(objectOrProxy: T | FlushProxy<T>): T {
  return isFlushProxy(objectOrProxy) ? objectOrProxy.__proxyTarget : objectOrProxy;
}

function proxyLoaderResult(result: any, flushSecret: number) {
  if (Array.isArray(result)) {
    return result.map((entity) => proxyEntity(entity, flushSecret));
  } else if (typeof result === "object") {
    return proxyEntity(result, flushSecret);
  }

  return result;
}

function createFlushProxy<T extends object>(
  target: T,
  flushSecret: number,
  block: (target: T, property: PropertyKey, receiver: any) => any,
): FlushProxy<T> {
  if (isFlushProxy(target)) {
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

      return block(target, property, receiver);
    },
  }) as FlushProxy<T>;
}

function proxyLoader(loader: Loader, entity: Entity, flushSecret: number): FlushProxy<Loader> {
  return createFlushProxy(loader, flushSecret, (loader, property, receiver) => {
    if (property === "load") {
      return function () {
        return loader.load().then((result) => proxyLoaderResult(result, flushSecret));
      };
    }

    if (property === "get") {
      return proxyLoaderResult(loader.get, flushSecret);
    }

    if (property === "entity") {
      return proxyEntity(entity, flushSecret);
    }

    return Reflect.get(loader, property, receiver);
  });
}

export function proxyEntityManager(em: EntityManager, flushSecret: number): FlushProxy<EntityManager> {
  return createFlushProxy(em, flushSecret, (em, property, receiver) => {
    const value = Reflect.get(em, property, receiver);

    // async functions that return entities
    if (
      typeof property === "string" &&
      ["load", "loadAll", "loadFromQuery", "find", "findOne", "findOneOrFail", "findOrCreate"].includes(property)
    ) {
      return function (...args: any[]) {
        return value.apply(receiver, args).then((result: any) => proxyLoaderResult(result, flushSecret));
      };
    }

    // sync functions that return entities
    if (typeof property === "string" && ["create", "createUnsafe"].includes(property)) {
      return function (...args: any[]) {
        const result = value.apply(receiver, args);
        return proxyLoaderResult(result, flushSecret);
      };
    }

    return value;
  });
}

export function proxyEntity(entity: Entity, flushSecret: number): FlushProxy<Entity> {
  const loaderCache: any = {};

  return createFlushProxy(entity, flushSecret, (entity, property, receiver) => {
    const value = Reflect.get(entity, property, receiver);

    if (
      value instanceof OneToManyCollection ||
      value instanceof ManyToManyCollection ||
      value instanceof ManyToOneReference
    ) {
      if (loaderCache[property] === undefined) {
        loaderCache[property] = proxyLoader(value, entity, flushSecret);
      }

      return loaderCache[property];
    }

    return value;
  });
}
