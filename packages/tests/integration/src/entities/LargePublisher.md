## Overview


## Fields

### favoriteAuthor

Subtype-specific override of `favoriteAuthor` that uses LargePublisher-only relations
(`critics`) in its reactive hint. This catches cross-CTI-subtype hint contamination,
since `critics` does not exist on `SmallPublisher` or the abstract `Publisher`.
