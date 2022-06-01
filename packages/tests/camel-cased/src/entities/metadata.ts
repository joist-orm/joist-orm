import { BaseEntity, configureMetadata, EntityManager as EntityManager1, EntityMetadata, KeySerde, PrimitiveSerde } from "joist-orm";
import { Context } from "src/context";
import { Author, authorConfig, BlogPost, blogPostConfig, newAuthor, newBlogPost } from "./entities";

export class EntityManager extends EntityManager1<Context> {}

export function getEm(e: BaseEntity): EntityManager {
  return e.em as EntityManager;
}

export const authorMeta: EntityMetadata<Author> = {
  cstr: Author,
  type: "Author",
  idType: "uuid",
  tagName: "a",
  tableName: "authors",
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("a", "id", "id", "uuid") },
    firstName: { kind: "primitive", fieldName: "firstName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("firstName", "firstName", "character varying") },
    lastName: { kind: "primitive", fieldName: "lastName", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("lastName", "lastName", "character varying") },
    createdAt: { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("createdAt", "createdAt", "timestamp without time zone") },
    updatedAt: { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("updatedAt", "updatedAt", "timestamp without time zone") },
    blogPosts: { kind: "o2m", fieldName: "blogPosts", fieldIdName: "blogPostIds", required: false, otherMetadata: () => blogPostMeta, otherFieldName: "author", serde: undefined },
  },
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt" },
  config: authorConfig,
  factory: newAuthor,
};

(Author as any).metadata = authorMeta;

export const blogPostMeta: EntityMetadata<BlogPost> = {
  cstr: BlogPost,
  type: "BlogPost",
  idType: "uuid",
  tagName: "bp",
  tableName: "blogPosts",
  fields: {
    id: { kind: "primaryKey", fieldName: "id", fieldIdName: undefined, required: true, serde: new KeySerde("bp", "id", "id", "uuid") },
    title: { kind: "primitive", fieldName: "title", fieldIdName: undefined, derived: false, required: true, protected: false, type: "string", serde: new PrimitiveSerde("title", "title", "character varying") },
    createdAt: { kind: "primitive", fieldName: "createdAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("createdAt", "createdAt", "timestamp without time zone") },
    updatedAt: { kind: "primitive", fieldName: "updatedAt", fieldIdName: undefined, derived: "orm", required: false, protected: false, type: "Date", serde: new PrimitiveSerde("updatedAt", "updatedAt", "timestamp without time zone") },
    author: { kind: "m2o", fieldName: "author", fieldIdName: "authorId", required: true, otherMetadata: () => authorMeta, otherFieldName: "blogPosts", serde: new KeySerde("a", "author", "authorId", "uuid") },
  },
  timestampFields: { createdAt: "createdAt", updatedAt: "updatedAt" },
  config: blogPostConfig,
  factory: newBlogPost,
};

(BlogPost as any).metadata = blogPostMeta;

export const allMetadata = [authorMeta, blogPostMeta];
configureMetadata(allMetadata);
