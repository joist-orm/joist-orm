import { type InstanceData, type TaggedId, failNoIdYet, getField, getInstanceData, getMetadata } from "joist-orm";

import { Author, AuthorCodegen } from "./src/entities";

type ReadState = InstanceData & { benchmarkReadFields: number };

const fields = [
  "firstName",
  "lastName",
  "age",
  "isFunny",
  "isPopular",
  "favoriteShape",
  "id",
  "idMaybe",
  "idTagged",
  "idTaggedMaybe",
] as const;
const idFields = ["id", "idMaybe", "idTagged", "idTaggedMaybe"] as const;
const unread = Symbol("unread");
const ownerSlot = Symbol("owner");
const firstNameSlot = Symbol("firstName");
const lastNameSlot = Symbol("lastName");
const ageSlot = Symbol("age");
const isFunnySlot = Symbol("isFunny");
const isPopularSlot = Symbol("isPopular");
const favoriteShapeSlot = Symbol("favoriteShape");
const idSlot = Symbol("id");
const valueSlots = {
  firstName: firstNameSlot,
  lastName: lastNameSlot,
  age: ageSlot,
  isFunny: isFunnySlot,
  isPopular: isPopularSlot,
  favoriteShape: favoriteShapeSlot,
  id: idSlot,
};
type SlotOwner = Author & Record<symbol, unknown>;
type SlotData = { [ownerSlot]: SlotOwner };
const valuesSlot = Symbol("values");
const readMaskSlot = Symbol("readMask");
type ObservedData = InstanceData["data"] & { [readMaskSlot]: number };

const slots = Object.values(valueSlots);
// Shared accessors keep ORM mutations and refreshes writing to the same slots as application getters.
const slotDescriptors = buildSlotDescriptors();

/**
 * Installs benchmark-only equivalents of specialized generated getters.
 *
 * Each field has a first-read bit, independent of whether hydration already cached its value.
 * The cold path uses the real getField; warm reads use constant keys and current storage.
 * This is not a production implementation: only persisted, tagged-ID Authors are supported,
 * and the benchmark never flushes, so sticky read-set changes are intentionally out of scope.
 */
export function installFirstReadPrototype(): void {
  if (getMetadata(Author).idType !== "tagged-string") throw new Error("Prototype requires tagged-string IDs");
  for (const field of fields) {
    const original = Object.getOwnPropertyDescriptor(AuthorCodegen.prototype, field)!;
    const replacement = Object.getOwnPropertyDescriptor(FirstReadGetters.prototype, field)!;
    Object.defineProperty(AuthorCodegen.prototype, field, { ...original, get: replacement.get });
  }
}

/** Adds one consistently shaped first-read mask without consuming any application reads. */
export function initializeFirstReadPrototype(authors: readonly Author[]): void {
  for (const author of authors) {
    (getInstanceData(author) as ReadState).benchmarkReadFields = 0;
  }
}

/**
 * Replaces each cold getter with a shared own getter after its first successful read.
 *
 * Unlike the bitmask prototype, warm reads have no first-read branch. Own accessor
 * properties can change V8 object layouts, so mixed read orders must be measured too.
 */
export function installSelfReplacingPrototype(): void {
  const descriptors: PropertyDescriptorMap = {};
  for (const field of fields) {
    const original = Object.getOwnPropertyDescriptor(AuthorCodegen.prototype, field)!;
    const replacement = Object.getOwnPropertyDescriptor(WarmGetters.prototype, field)!;
    descriptors[field] = { ...original, get: replacement.get };
  }
  const idDescriptors = Object.fromEntries(idFields.map((field) => [field, descriptors[field]]));
  for (const field of fields) {
    const descriptor = descriptors[field];
    const isId = (idFields as readonly string[]).includes(field);
    Object.defineProperty(AuthorCodegen.prototype, field, {
      ...descriptor,
      get: function coldRead(this: Author): unknown {
        getField(this, isId ? "id" : field);
        if (isId) {
          Object.defineProperties(this, idDescriptors);
        } else {
          Object.defineProperty(this, field, descriptor);
        }
        return descriptor.get!.call(this);
      },
    });
  }
}

/** Installs an optimistic floor: branch-free getters after eagerly running all cold work in setup. */
export function installWarmGetterFloor(): void {
  for (const field of fields) {
    const original = Object.getOwnPropertyDescriptor(AuthorCodegen.prototype, field)!;
    const replacement = Object.getOwnPropertyDescriptor(WarmGetters.prototype, field)!;
    Object.defineProperty(AuthorCodegen.prototype, field, { ...original, get: replacement.get });
  }
}

/** Runs the real cold path outside the timer for the explicitly labeled warm-only floor. */
export function initializeWarmGetterFloor(authors: readonly Author[]): void {
  for (const author of authors) {
    for (const field of ["firstName", "lastName", "age", "isFunny", "isPopular", "favoriteShape", "id"]) {
      getField(author, field);
    }
  }
}

/**
 * Stores field values in fixed entity slots, removing the __data.data pointer chain.
 *
 * A sentinel distinguishes unread from cached undefined. The cold path redirects the
 * ORM data bag to those same slots; values are not copied into an independent cache.
 */
export function installInlineSlotsPrototype(): void {
  for (const field of fields) {
    const original = Object.getOwnPropertyDescriptor(AuthorCodegen.prototype, field)!;
    const replacement = Object.getOwnPropertyDescriptor(InlineSlotGetters.prototype, field)!;
    Object.defineProperty(AuthorCodegen.prototype, field, { ...original, get: replacement.get });
  }
}

/** Allocates slots in a fixed order, even when applications later read fields in different orders. */
export function initializeInlineSlotsPrototype(authors: readonly Author[]): void {
  for (const author of authors) {
    const owner = author as SlotOwner;
    for (const slot of slots) owner[slot] = unread;
    (getInstanceData(author).data as SlotData)[ownerSlot] = owner;
  }
}

/** Installs getters that reach the existing data bag through one entity pointer, without forwarding accessors. */
export function installDirectDataPrototype(): void {
  for (const field of fields) {
    const original = Object.getOwnPropertyDescriptor(AuthorCodegen.prototype, field)!;
    const replacement = Object.getOwnPropertyDescriptor(DirectDataGetters.prototype, field)!;
    Object.defineProperty(AuthorCodegen.prototype, field, { ...original, get: replacement.get });
  }
}

/** Shares the ORM's existing data bag; core currently never replaces it after InstanceData construction. */
export function initializeDirectDataPrototype(authors: readonly Author[]): void {
  for (const author of authors) {
    const data = getInstanceData(author).data as ObservedData;
    data[readMaskSlot] = 0;
    (author as DirectDataGetters)[valuesSlot] = data;
  }
}

/** Supplies literal-key getters without changing entity construction or setter behavior. */
class FirstReadGetters extends Author {
  declare protected readonly __data: ReadState;

  override get firstName(): string {
    const state = this.__data;
    if (!(state.benchmarkReadFields & 1)) firstRead(this, "firstName", 1);
    return state.data.firstName;
  }

  override get lastName(): string | undefined {
    const state = this.__data;
    if (!(state.benchmarkReadFields & 2)) firstRead(this, "lastName", 2);
    return state.data.lastName;
  }

  override get age(): number | undefined {
    const state = this.__data;
    if (!(state.benchmarkReadFields & 4)) firstRead(this, "age", 4);
    return state.data.age;
  }

  override get isFunny(): boolean {
    const state = this.__data;
    if (!(state.benchmarkReadFields & 8)) firstRead(this, "isFunny", 8);
    return state.data.isFunny;
  }

  override get isPopular(): boolean | undefined {
    const state = this.__data;
    if (!(state.benchmarkReadFields & 16)) firstRead(this, "isPopular", 16);
    return state.data.isPopular;
  }

  override get favoriteShape(): Author["favoriteShape"] {
    const state = this.__data;
    if (!(state.benchmarkReadFields & 32)) firstRead(this, "favoriteShape", 32);
    return state.data.favoriteShape;
  }

  override get id(): Author["id"] {
    return (this.idTaggedMaybe as Author["id"]) || failNoIdYet("Author");
  }

  override get idMaybe(): Author["idMaybe"] {
    return this.idTaggedMaybe as Author["idMaybe"];
  }

  override get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("Author");
  }

  override get idTaggedMaybe(): TaggedId | undefined {
    const state = this.__data;
    if (!(state.benchmarkReadFields & 64)) firstRead(this, "id", 64);
    return state.data.id;
  }
}

/** Isolates the cost of current storage indirection without a first-read branch or ID getter chains. */
class WarmGetters extends Author {
  override get firstName(): string {
    return this.__data.data.firstName;
  }

  override get lastName(): string | undefined {
    return this.__data.data.lastName;
  }

  override get age(): number | undefined {
    return this.__data.data.age;
  }

  override get isFunny(): boolean {
    return this.__data.data.isFunny;
  }

  override get isPopular(): boolean | undefined {
    return this.__data.data.isPopular;
  }

  override get favoriteShape(): Author["favoriteShape"] {
    return this.__data.data.favoriteShape;
  }

  override get id(): Author["id"] {
    return this.__data.data.id || failNoIdYet("Author");
  }

  override get idMaybe(): Author["idMaybe"] {
    return this.__data.data.id;
  }

  override get idTagged(): TaggedId {
    return this.__data.data.id || failNoIdYet("Author");
  }

  override get idTaggedMaybe(): TaggedId | undefined {
    return this.__data.data.id;
  }
}

/** Reads one own slot and checks its sentinel without visiting InstanceData on the warm path. */
class InlineSlotGetters extends Author {
  declare [firstNameSlot]: string | typeof unread;
  declare [lastNameSlot]: string | undefined | typeof unread;
  declare [ageSlot]: number | undefined | typeof unread;
  declare [isFunnySlot]: boolean | typeof unread;
  declare [isPopularSlot]: boolean | undefined | typeof unread;
  declare [favoriteShapeSlot]: Author["favoriteShape"] | typeof unread;
  declare [idSlot]: TaggedId | undefined | typeof unread;

  override get firstName(): string {
    const value = this[firstNameSlot];
    return value === unread ? (initializeSlot(this, "firstName") as string) : value;
  }

  override get lastName(): string | undefined {
    const value = this[lastNameSlot];
    return value === unread ? (initializeSlot(this, "lastName") as string | undefined) : value;
  }

  override get age(): number | undefined {
    const value = this[ageSlot];
    return value === unread ? (initializeSlot(this, "age") as number | undefined) : value;
  }

  override get isFunny(): boolean {
    const value = this[isFunnySlot];
    return value === unread ? (initializeSlot(this, "isFunny") as boolean) : value;
  }

  override get isPopular(): boolean | undefined {
    const value = this[isPopularSlot];
    return value === unread ? (initializeSlot(this, "isPopular") as boolean | undefined) : value;
  }

  override get favoriteShape(): Author["favoriteShape"] {
    const value = this[favoriteShapeSlot];
    return value === unread ? (initializeSlot(this, "favoriteShape") as Author["favoriteShape"]) : value;
  }

  override get id(): Author["id"] {
    return (readSlotId(this) as Author["id"]) || failNoIdYet("Author");
  }

  override get idMaybe(): Author["idMaybe"] {
    return readSlotId(this) as Author["idMaybe"];
  }

  override get idTagged(): TaggedId {
    return readSlotId(this) || failNoIdYet("Author");
  }

  override get idTaggedMaybe(): TaggedId | undefined {
    return readSlotId(this);
  }
}

/** Keeps both first-read state and literal-key values behind one shared data pointer. */
class DirectDataGetters extends Author {
  declare [valuesSlot]: ObservedData;

  override get firstName(): string {
    const data = this[valuesSlot];
    if (!(data[readMaskSlot] & 1)) firstDataRead(this, "firstName", 1);
    return data.firstName;
  }

  override get lastName(): string | undefined {
    const data = this[valuesSlot];
    if (!(data[readMaskSlot] & 2)) firstDataRead(this, "lastName", 2);
    return data.lastName;
  }

  override get age(): number | undefined {
    const data = this[valuesSlot];
    if (!(data[readMaskSlot] & 4)) firstDataRead(this, "age", 4);
    return data.age;
  }

  override get isFunny(): boolean {
    const data = this[valuesSlot];
    if (!(data[readMaskSlot] & 8)) firstDataRead(this, "isFunny", 8);
    return data.isFunny;
  }

  override get isPopular(): boolean | undefined {
    const data = this[valuesSlot];
    if (!(data[readMaskSlot] & 16)) firstDataRead(this, "isPopular", 16);
    return data.isPopular;
  }

  override get favoriteShape(): Author["favoriteShape"] {
    const data = this[valuesSlot];
    if (!(data[readMaskSlot] & 32)) firstDataRead(this, "favoriteShape", 32);
    return data.favoriteShape;
  }

  override get id(): Author["id"] {
    return (readDirectId(this) as Author["id"]) || failNoIdYet("Author");
  }

  override get idMaybe(): Author["idMaybe"] {
    return readDirectId(this) as Author["idMaybe"];
  }

  override get idTagged(): TaggedId {
    return readDirectId(this) || failNoIdYet("Author");
  }

  override get idTaggedMaybe(): TaggedId | undefined {
    return readDirectId(this);
  }
}

/** Runs the cold field path before consuming its observation bit. */
function firstDataRead(author: DirectDataGetters, field: string, bit: number): void {
  getField(author, field);
  author[valuesSlot][readMaskSlot] |= bit;
}

/** Shares the tagged ID slot without walking the public getter chain. */
function readDirectId(author: DirectDataGetters): TaggedId | undefined {
  const data = author[valuesSlot];
  if (!(data[readMaskSlot] & 64)) firstDataRead(author, "id", 64);
  return data.id;
}

/** Initializes the real field before redirecting the ORM's data property to the entity slot. */
function initializeSlot(author: Author, field: keyof typeof valueSlots): unknown {
  const value = getField(author, field);
  (author as SlotOwner)[valueSlots[field]] = value;
  Object.defineProperty(getInstanceData(author).data, field, slotDescriptors[field]);
  return value;
}

/** Shares one cold-ID state across all four public ID forms without chaining their getters. */
function readSlotId(author: InlineSlotGetters): TaggedId | undefined {
  const value = author[idSlot];
  return value === unread ? (initializeSlot(author, "id") as TaggedId | undefined) : value;
}

/** Runs callbacks before marking the read complete, so throwing hooks do not consume initialization. */
function firstRead(author: Author, field: string, bit: number): void {
  getField(author, field);
  (getInstanceData(author) as ReadState).benchmarkReadFields |= bit;
}

/** Creates one set of forwarding accessors shared by all entity data bags, not closures per entity. */
function buildSlotDescriptors(): PropertyDescriptorMap {
  const descriptors: PropertyDescriptorMap = {};
  for (const [field, slot] of Object.entries(valueSlots)) {
    descriptors[field] = {
      configurable: true,
      enumerable: true,
      get: function readSlot(this: SlotData): unknown {
        return this[ownerSlot][slot];
      },
      set: function writeSlot(this: SlotData, value: unknown): void {
        this[ownerSlot][slot] = value;
      },
    };
  }
  return descriptors;
}
