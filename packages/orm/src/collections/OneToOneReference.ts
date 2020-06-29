import { ensureNotDeleted, fail, getEm, IdOf, OneToManyCollection, Reference } from "../";
import { Entity, EntityMetadata, getMetadata } from "../EntityManager";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { ManyToOneReference } from "./ManyToOneReference";

export class OneToOneReference<T extends Entity, U extends Entity> extends AbstractRelationImpl<U>
  implements Reference<T, U, undefined> {
  private loaded: U | undefined;
  private isLoaded: boolean = false;
  private isCascadeDelete: boolean;

  constructor(
    // These are public to our internal implementation but not exposed in the Collection API
    public entity: T,
    public otherMeta: EntityMetadata<U>,
    public fieldName: keyof T,
    public otherFieldName: keyof U,
  ) {
    super();
    this.isCascadeDelete = getMetadata(entity).config.__data.cascadeDeleteFields.includes(fieldName as any);
  }

  get id(): IdOf<U> | undefined {
    if (this.isLoaded) {
      return this.loaded?.id as IdOf<U>;
    }
    // TODO Should fail if not loaded?
    return undefined;
  }

  get idOrFail(): IdOf<U> {
    return this.id || fail("Entity has no id yet");
  }

  isSet(): boolean {
    // TODO This will be inaccurate if not loaded?
    return this.id !== undefined;
  }

  // opts is an internal parameter
  async load(opts?: { withDeleted?: boolean }): Promise<U | undefined> {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    if (!this.isLoaded) {
      if (this.entity.id !== undefined) {
        this.loaded = (
          await getEm(this.entity).find(this.otherMeta.cstr, {
            [this.otherFieldName]: this.entity,
          } as any)
        )[0];
      }
      // this.maybeAppendAddedBeforeLoaded();
      this.isLoaded = true;
    }
    return this.filterDeleted(this.loaded, opts);
  }

  set(other: U): void {
    ensureNotDeleted(this.entity);
    if (other === this.loaded) {
      return;
    }
    if (this.isLoaded) {
      if (this.loaded) {
        this.getOtherRelation(this.loaded).set(undefined);
      }
    }
    this.loaded = other;
    this.isLoaded = true;
    // This will no-op and mark other dirty if necessary
    if (other) {
      this.getOtherRelation(other).set(this.entity);
    }
  }

  get getWithDeleted(): U | undefined {
    return this.filterDeleted(this.doGet(), { withDeleted: true });
  }

  get get(): U | undefined {
    return this.filterDeleted(this.doGet(), { withDeleted: false });
  }

  private doGet(): U | undefined {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    if (!this.isLoaded) {
      // This should only be callable in the type system if we've already resolved this to an instance
      throw new Error("get was called when not preloaded");
    }
    return this.loaded;
  }

  // internal impl

  setFromOpts(other: U): void {
    this.set(other);
  }

  initializeForNewEntity(): void {
    this.isLoaded = true;
  }

  async refreshIfLoaded(): Promise<void> {
    if (this.isLoaded) {
      this.isLoaded = false;
      await this.load();
    }
  }

  onEntityDelete(): void {
    // if (this.isCascadeDelete) {
    //   this.current({ withDeleted: true }).forEach(getEm(this.entity).delete);
    // }
  }

  async onEntityDeletedAndFlushing(): Promise<void> {}

  public toString(): string {
    return `OneToOneReference(entity: ${this.entity}, fieldName: ${this.fieldName}, otherType: ${this.otherMeta.type}, otherFieldName: ${this.otherFieldName})`;
  }

  private filterDeleted(entity: U | undefined, opts?: { withDeleted?: boolean }): U | undefined {
    return opts?.withDeleted === true || entity === undefined || !entity.isDeletedEntity ? entity : undefined;
  }

  /** Returns the other relation that points back at us, i.e. we're `Author.image` and this is `Image.author_id`. */
  private getOtherRelation(other: U): ManyToOneReference<U, T, any> {
    return (other as U)[this.otherFieldName] as any;
  }
}
