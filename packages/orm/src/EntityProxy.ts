import { OneToManyCollection } from "./collections/OneToManyCollection";
import { ManyToManyCollection } from "./collections/ManyToManyCollection";
import { ManyToOneReference } from "./collections/ManyToOneReference";
import { Entity } from "./EntityManager";

// These proxies are passed into hooks during a flush to enable changes mid flush

type Loader = OneToManyCollection<any, any> | ManyToManyCollection<any, any> | ManyToOneReference<any, any, any>;

function isPlainFunction(obj: any) {
  // This is absolutely gross, but there's seemingly no other way to figure out if a function is really a class
  return typeof obj === "function" && !/^class\s/.test(obj.toString());
}

function proxyLoaderResult(result: any, flushSecret: number) {
  if (Array.isArray(result)) {
    return result.map((entity) => proxyEntity(entity, flushSecret));
  } else if (typeof result === "object") {
    return proxyEntity(result, flushSecret);
  }

  return result;
}

function proxyLoader(loader: Loader, entity: Entity, flushSecret: number) {
  const prototype = Object.getPrototypeOf(loader);

  return new Proxy(loader, {
    get: (loader, property, receiver) => {
      if (property === "flushSecret") {
        return flushSecret;
      }

      if (property === "load") {
        return function () {
          return loader
            .load({ beingDeleted: entity.__orm.deleted === "pending" })
            .then((result) => proxyLoaderResult(result, flushSecret));
        };
      }

      if (property === "get") {
        return proxyLoaderResult(loader.get, flushSecret);
      }

      if (property === "entity") {
        // this should be a proxied entity already
        return entity;
      }

      let value: any;
      const getter = prototype.__lookupGetter__(property);
      if (getter !== undefined) {
        value = getter.apply(receiver);
      } else {
        value = (loader as any)[property];
      }

      if (isPlainFunction(value)) {
        return function (...args: any[]) {
          return value.apply(receiver, ...args);
        };
      }

      return value;
    },
  });
}

export function proxyEntity(entity: Entity, flushSecret: number): Entity {
  const prototype = Object.getPrototypeOf(entity);
  const loaderCache: any = {};

  return new Proxy(entity, {
    get(entity, property, receiver) {
      if (property === "flushSecret") {
        return flushSecret;
      }

      if (property === "proxyTarget") {
        return entity;
      }

      let value: any;
      const getter = prototype.__lookupGetter__(property);
      if (getter !== undefined) {
        value = getter.apply(receiver);
      } else {
        value = (entity as any)[property];
      }

      if (isPlainFunction(value)) {
        return function (...args: any[]) {
          return value.apply(receiver, ...args);
        };
      }

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
    },
    set(entity, property, value, receiver) {
      const setter = prototype.__lookupSetter__(property);
      if (setter !== undefined) {
        setter.apply(receiver, value);
      } else {
        (entity as any)[property] = value;
      }

      return true;
    },
  });
}
