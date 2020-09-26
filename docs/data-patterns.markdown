
## Fields

* Primitives
  * First name / last name / birthday
* Derived fields
  * Derived from same-table / other-columns
  * Derived from a parent / grandparent / o2o entity
  * Derived from children / grand-children / o2m entities

## Reads

* Query based on primitives
* Query based on condition in parent / grandparent
  * Join up with ORM
  * Join up with SQL
  * Use a derived-from-parent field
* Query based on condition in children / grand-children
  * Sub-query with SQL
  * Populate sub-tree with ORM
  * Use a derived-from-children field

## Writes

## Validation Rules

* Validate on primitives
* Validate on same-table derived
* Validate on parent / grand-parent conditions
  * Similar to query
* Validate on child / grand-children conditions
