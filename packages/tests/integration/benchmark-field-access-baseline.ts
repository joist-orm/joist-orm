import {
  type EntityMetadata,
  type TaggedId,
  failNoIdYet,
  getEmInternalApi,
  getInstanceData,
  getMetadata,
  toIdOf,
} from "joist-orm";

import { Author, AuthorCodegen, authorMeta } from "./src/entities";

type BaselineMetadata = EntityMetadata & { hasAssertUnchangedFields: boolean };
// The original getField lived in a built ESM module with direct bindings. Capture these
// once so tsx's CommonJS export getters do not add module-lookup work to every baseline read.
const baselineGetApi = getEmInternalApi;
const baselineGetData = getInstanceData;

/**
 * Reproduces the pre-first-read getters/getField on current fixture entities.
 *
 * Keeping this path frozen lets the benchmark compare the production implementation
 * after regeneration, rather than accidentally benchmarking new Joist against itself.
 * Entity allocation still uses the current runtime; this is a read-path baseline only.
 */
export function installFieldAccessBaseline(): void {
  const meta = getMetadata(Author) as BaselineMetadata;
  meta.hasAssertUnchangedFields = Object.values(meta.allFields).some((field) => field.assertUnchanged);
  for (const field of [
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
  ]) {
    const original = Object.getOwnPropertyDescriptor(AuthorCodegen.prototype, field)!;
    const baseline = Object.getOwnPropertyDescriptor(BaselineGetters.prototype, field)!;
    Object.defineProperty(AuthorCodegen.prototype, field, { ...original, get: baseline.get });
  }
}

/** Uses the original generated literal-key calls and public ID getter chain. */
class BaselineGetters extends Author {
  override get firstName(): string {
    return baselineGetField(this, "firstName");
  }

  override get lastName(): string | undefined {
    return baselineGetField(this, "lastName");
  }

  override get age(): number | undefined {
    return baselineGetField(this, "age");
  }

  override get isFunny(): boolean {
    return baselineGetField(this, "isFunny");
  }

  override get isPopular(): boolean | undefined {
    return baselineGetField(this, "isPopular");
  }

  override get favoriteShape(): Author["favoriteShape"] {
    return baselineGetField(this, "favoriteShape");
  }

  override get id(): Author["id"] {
    return this.idMaybe || failNoIdYet("Author");
  }

  override get idMaybe(): Author["idMaybe"] {
    return toIdOf(authorMeta, this.idTaggedMaybe);
  }

  override get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("Author");
  }

  override get idTaggedMaybe(): TaggedId | undefined {
    return baselineGetField(this, "id");
  }
}

/** Preserves the getField read path from 85b955fa, before plugin/read-protection amortization. */
function baselineGetField<K extends keyof Author & string>(entity: Author, fieldName: K): Author[K] {
  const { em } = entity;
  const api = baselineGetApi(em);
  api.pluginManager.beforeGetField(entity, fieldName);
  const instanceData = baselineGetData(entity);
  const metadata = instanceData.metadata as BaselineMetadata;
  if (metadata.hasAssertUnchangedFields && metadata.allFields[fieldName]?.assertUnchanged) em.assertUnchanged(entity);

  const { data } = instanceData;
  if (fieldName === "id" && data.id !== undefined) return data.id;
  if (!(fieldName in data) && !entity.isNewEntity) {
    const serde = metadata.allFields[fieldName]?.serde;
    if (!serde) throw new Error(`Missing serde for ${fieldName}`);
    data[fieldName] = serde.fromRow(instanceData.rowData, instanceData.rowIndex);
  }
  return data[fieldName];
}
