## Overview


## Fields

### favoriteAuthor

Example of a ReactiveReference in an entity with subtypes.

### commentParentInfo

Subtype-specific override of `commentParentInfo` whose hint mentions SP-only relations.
Used to catch CTI-subtype reactive-hint contamination in `addRule`/`addReaction`'s
closure-cached `loadHint`.
