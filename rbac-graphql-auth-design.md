# RBAC GraphQL Auth Design Doc Plan

This plan tracks the current content and intent of `rbac-graphql-auth-design.html` so the single-file HTML/SVG design doc can stay up-to-date.

## Artifact

- File: `rbac-graphql-auth-design.html`
- Format: standalone HTML file with embedded CSS and inline SVG diagrams
- Audience: people outside the company/product context
- Domain language: say `our webapp`, not product-specific names
- Example model: Authors and Books
- Avoided terms: `Blueprint`, `CostCode`, `Cost Codes`, `Homebound`

## Core Message

The document explains how a mostly static frontend can adapt to dynamic authorization:

- Static GraphQL queries
- Static navigation layouts
- Static form layouts
- Dynamic per-user permissions
- Dynamic per-page permissions
- Dynamic per-field read/edit permissions
- Dynamic operation permissions such as create, edit, save, promote, archive, and delete

The UI needs enough backend-provided metadata to:

- Hide fields the user cannot view
- Disable fields the user can view but cannot edit
- Disable or hide operations the user cannot perform
- Avoid old static GraphQL screens failing when they query denied fields
- Avoid handwritten permission checks around every field, button, table column, and CTA

## Current Document Structure

### Hero

- Eyebrow: `Our Webapp RBAC Design Doc`
- Title: `Dynamic Field Permissions in a Mostly Static GraphQL UI`
- Summary: our webapp wants static GraphQL queries/navigation/forms, but auth is dynamic per user, page, operation, and field.
- Core problem callout: backend enforces reads/writes, frontend still needs metadata to render honest UX.
- Questions callout uses Authors/Books:
  - Can this user view `Author.name`?
  - Can this user edit `Author.email`?
  - Can this user see a private royalty field?
  - Can this user create a book?
  - Can this user click edit, save, promote, or archive?

### Mental Model

- Explains two permission categories:
  - Field permissions: `canView`, `canEdit`
  - Operation permissions: `canCreate`, `canSave`, `canEdit`, etc.
- SVG diagram currently shows:
  - `Frontend Screen`
  - `AuthorEditPage`
  - `AuthorForm`
  - `SaveButton`
  - `PrivateFieldsPanel`
  - `Field Permissions`
  - `Operation Permissions`
  - `Backend Auth`
- Three cards:
  - View: denied values should not render or leak through state/cache/network
  - Edit: read-only values render but inputs disable and save payloads avoid changes
  - Operate: page actions need their own permission signals

### Approach 1: Low-Level Permission Calls

Concept:

- Frontend separately queries entity data and raw permission strings.
- Frontend merges normal data with permissions.
- UI checks permission strings like `Author.name.edit`.

SVG labels:

- `AuthorEditPage`
- `author Query`
- `name, email, books`
- `permissions Query`
- `raw permission strings`
- `GraphQL API`
- `data resolvers`
- `auth policy service`

GraphQL examples:

```graphql
query AuthorEditPage($id: ID!) {
  author(id: $id) {
    id
    name
    email
    royaltyRate
    books { id title }
  }
}

query AuthorPermissions($id: ID!) {
  permissions(entityId: $id) {
    name
    allowed
  }
}
```

Example permissions response:

```json
{
  "permissions": [
    { "name": "Author.edit", "allowed": true },
    { "name": "Book.create", "allowed": false },
    { "name": "Author.name.view", "allowed": true },
    { "name": "Author.name.edit", "allowed": true },
    { "name": "Author.email.view", "allowed": true },
    { "name": "Author.email.edit", "allowed": false },
    { "name": "Author.royaltyRate.view", "allowed": false }
  ]
}
```

Frontend example shape:

```tsx
function AuthorEditPage(props) {
  const author = useAuthorQuery({ id: props.id });
  const permissions = useAuthorPermissionsQuery({ id: props.id });
  const can = createPermissionLookup(permissions.data?.permissions ?? []);

  return (
    <AuthorForm
      author={author.data?.author}
      canEditAuthor={can("Author.edit")}
      canEditName={can("Author.name.edit")}
      canViewRoyaltyRate={can("Author.royaltyRate.view")}
    />
  );
}

function AuthorForm(props) {
  return (
    <Form>
      <TextField name="name" disabled={!props.canEditName} />
      {props.canViewRoyaltyRate ? <RoyaltyRateField /> : null}
      <SaveButton disabled={!props.canEditAuthor} />
    </Form>
  );
}
```

Pros:

- Maximum frontend flexibility
- Raw permission names visible for debugging and advanced UI decisions
- Can be introduced without reshaping every entity field

Cons:

- Frontend couples to low-level backend permission names
- Separate data and permission queries must be merged
- Does not solve denied static field queries by itself
- Permission checks can spread across many components

### Approach 2: Graph-Embedded Auth

Concept:

- GraphQL schema exposes decorated field objects and operation objects.
- Instead of querying `name`, page queries `nameField { value canView canEdit }`.
- Reusable form components understand a standard field permission fragment.

SVG labels:

- `AuthorEditPage`
- `EditableField UI`
- `renders by canView/canEdit`
- `GraphQL Entity`
- `nameField { value canEdit }`
- `emailField { value canEdit }`
- `canSave { allowed reason }`
- `canEdit { allowed reason }`
- `Backend`
- `resolves values`
- `resolves permission flags`
- `keeps policy names private`

GraphQL examples:

```graphql
fragment EditableStringField on EditableStringField {
  value
  canView
  canEdit
  deniedReason
}

fragment OperationPermission on OperationPermission {
  allowed
  deniedReason
}

query AuthorEditPage($id: ID!) {
  author(id: $id) {
    id
    nameField { ...EditableStringField }
    emailField { ...EditableStringField }
    royaltyRateField { ...EditableStringField }
    books { id titleField { ...EditableStringField } }
    canEdit { ...OperationPermission }
    canSave { ...OperationPermission }
  }
}
```

Example response:

```json
{
  "author": {
    "id": "a:1",
    "nameField": {
      "value": "Octavia Butler",
      "canView": true,
      "canEdit": true,
      "deniedReason": null
    },
    "emailField": {
      "value": "octavia@example.com",
      "canView": true,
      "canEdit": false,
      "deniedReason": "Role cannot edit author email"
    },
    "royaltyRateField": {
      "value": null,
      "canView": false,
      "canEdit": false,
      "deniedReason": "Royalty fields are restricted"
    },
    "canEdit": { "allowed": true, "deniedReason": null },
    "canSave": { "allowed": true, "deniedReason": null }
  }
}
```

Frontend example shape:

```tsx
function AuthorEditPage(props) {
  const result = useAuthorEditPageQuery({ id: props.id });
  const author = result.data?.author;

  return author ? <AuthorForm author={author} /> : null;
}

function AuthorForm(props) {
  return (
    <Form>
      <EditableTextField label="Name" field={props.author.nameField} name="name" />
      <EditableTextField label="Email" field={props.author.emailField} name="email" />
      <EditableTextField label="Royalty rate" field={props.author.royaltyRateField} name="royaltyRate" />
      <SaveButton disabled={!props.author.canSave.allowed} />
    </Form>
  );
}

function EditableTextField(props) {
  if (!props.field.canView) return null;
  return <TextField name={props.name} value={props.field.value ?? ""} disabled={!props.field.canEdit} />;
}
```

Pros:

- No separate permission bookkeeping query
- Backend can hide low-level permission names behind semantic booleans
- Standard fragments enable reusable components like `EditableTextField`
- Denied values can safely resolve to `null` plus metadata instead of throwing

Cons:

- Every screen and query must migrate from raw fields to decorated fields
- Form state maps from `nameField.value` to mutation input `name`, adding boilerplate
- If UI needs raw policy details, API must expose new semantic flags
- Schema surface area grows substantially

### Approach 3: Tagged Values

Concept:

- Client opts in to tagged scalar values.
- Existing fields can still be queried.
- String values return permission prefixes:
  - `rw:Octavia Butler`
  - `r:octavia@example.com`
  - `d:none`
- Beam components interpret tags by stripping values, hiding denied fields, or disabling read-only fields.

SVG labels:

- `Existing Screen`
- `queries title/name`
- `minimal query changes`
- `Tagged Response`
- `rw:value, r:value, d:none`
- `Beam Components`
- `strip tags, disable fields`
- `Type Boundary`
- `strings only work cleanly`
- `numbers/dates/references break`

GraphQL example:

```graphql
query AuthorEditPage($id: ID!) {
  author(id: $id) {
    id
    name
    email
    royaltyRate
  }
}
```

Header:

```text
X-Tagged-Permission-Values: true
```

Example response:

```json
{
  "author": {
    "id": "a:1",
    "name": "rw:Octavia Butler",
    "email": "r:octavia@example.com",
    "royaltyRate": "d:none"
  }
}
```

Frontend example shape:

```tsx
function AuthorForm(props) {
  return (
    <Form>
      <BeamTextField name="name" value={props.author.name} />
      <BeamTextField name="email" value={props.author.email} />
      <BeamTextField name="royaltyRate" value={props.author.royaltyRate} />
    </Form>
  );
}

function BeamTextField(props) {
  const tagged = parsePermissionTaggedString(props.value);
  if (tagged.access === "denied") return null;

  return (
    <TextField
      name={props.name}
      value={tagged.value}
      disabled={tagged.access === "read"}
    />
  );
}
```

Pros:

- Least disruption to existing GraphQL query shapes
- Can reduce risk of old screens failing on denied fields
- Centralized Beam components can interpret tags once

Cons:

- Only works naturally for strings
- Numbers, dates, booleans, collections, and references need separate mechanisms
- Pollutes scalar values with transport metadata
- Easy to forget to strip or reapply tags in form state, validation, and mutations
- Does not model operation permissions like create, save, edit, or promote

### Comparison Matrix

Rows currently covered:

- API shape
- Frontend coupling
- Migration cost
- Safety for denied fields
- Component reuse
- Operation permissions

Columns:

- Low-Level Permission Calls
- Graph-Embedded Auth
- Tagged Values

Key comparison points:

- Low-level permission calls are flexible but couple frontend to raw permission strings.
- Graph-embedded auth is the cleanest semantic model but has the highest migration cost.
- Tagged values reduce string-field migration disruption but are fragile and incomplete for non-string fields and operations.

### Recommended Direction

Current recommendation:

- Prefer `Approach 2: Graph-Embedded Auth` as the clean long-term model.
- Optionally pair it with a narrow compatibility bridge inspired by Approach 1 for page-level operations and migration diagnostics.
- Do not use tagged values as the primary model because our webapp fields are not only strings.

Recommendation cards:

- `1. Standardize Field Wrappers`
- `2. Standardize Operations`
- `3. Hide Boilerplate in Components`

Recommended architecture SVG labels:

- `Static Page`
- `stable layout`
- `static fragments`
- `semantic fields`
- `Auth-Aware Beam`
- `EditableTextField`
- `EditableDateField`
- `PermissionButton`
- `GraphQL Entity`
- `field wrappers`
- `operation wrappers`
- `denied reasons`
- `RBAC`
- `policy`

### Open Decisions

Current open decision cards:

- Schema Granularity: generic field wrapper interface, type-specific wrappers, or both?
- Mutation Semantics: disabled fields omitted by client, rejected by server, or both? Current doc says safest is both.
- Denied Reasons: human-readable reasons, machine-readable codes, or both?
- Migration Strategy: which screens first, and do old screens fail closed, fail soft, or use temporary compatibility mode?

## Maintenance Checklist

When updating `rbac-graphql-auth-design.html`, check all of these:

- Keep the artifact single-file: no external CSS, JS, images, fonts, or SVG files.
- Keep examples in the Authors/Books domain unless explicitly changing the whole doc's domain model.
- Use `our webapp`, not product-specific names.
- Keep SVG diagrams synchronized with surrounding copy and examples.
- Keep GraphQL queries, JSON responses, and frontend component names aligned.
- If adding a new field to one approach, decide whether equivalent examples should appear in the other approaches.
- If changing the recommendation, update the recommendation prose, comparison matrix, and relevant pros/cons.
- If changing any product-specific wording, run a search for `Blueprint`, `CostCode`, `Cost Code`, `cost code`, `costCode`, and `Homebound`.
- If changing domain examples, run a search for stale fields such as `privateNotes`, `numberField`, `Concrete`, `03-100`, `quantity`, and `projectItems`.

## Last Known Verification

- `rbac-graphql-auth-design.html` exists at the repo root.
- It is approximately 35 KB.
- Search for stale product/domain terms found no remaining matches for:
  - `Blueprint`
  - `CostCode`
  - `Cost Code`
  - `cost code`
  - `costCode`
  - `privateNotes`
  - `numberField`
  - `Concrete`
  - `03-100`
  - `quantity`
  - `projectItems`
  - `Homebound`
