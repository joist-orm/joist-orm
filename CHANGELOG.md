# [1.104.0](https://github.com/stephenh/joist-ts/compare/v1.103.0...v1.104.0) (2023-09-14)


### Features

* Add async method ([#784](https://github.com/stephenh/joist-ts/issues/784)) ([0c2a032](https://github.com/stephenh/joist-ts/commit/0c2a0327f946227797b35b65137f635575a8fe60))

# [1.103.0](https://github.com/stephenh/joist-ts/compare/v1.102.3...v1.103.0) (2023-09-13)


### Features

* Codegen - Delayed throw on non-deferred FK Found ([#782](https://github.com/stephenh/joist-ts/issues/782)) ([743b85f](https://github.com/stephenh/joist-ts/commit/743b85f06eaa3d30936125e44c042b93a6081068))

## [1.102.3](https://github.com/stephenh/joist-ts/compare/v1.102.2...v1.102.3) (2023-09-12)


### Bug Fixes

* Allow query by deep poly o2m field ([#783](https://github.com/stephenh/joist-ts/issues/783)) ([38c8ca1](https://github.com/stephenh/joist-ts/commit/38c8ca11d3431f2b7dde0b828cfc7ae5979f6f31))

## [1.102.2](https://github.com/stephenh/joist-ts/compare/v1.102.1...v1.102.2) (2023-09-06)


### Bug Fixes

* use left outer join for nested required fields ([#778](https://github.com/stephenh/joist-ts/issues/778)) ([b8cd022](https://github.com/stephenh/joist-ts/commit/b8cd022ed82333e47f8466d405088bac45d832c3))

## [1.102.1](https://github.com/stephenh/joist-ts/compare/v1.102.0...v1.102.1) (2023-09-05)


### Bug Fixes

* CTI BaseEntity.toJSON skipping parent fields ([#775](https://github.com/stephenh/joist-ts/issues/775)) ([9bdcd66](https://github.com/stephenh/joist-ts/commit/9bdcd66db946c6bcafe63c50077b244c9f27933b))

# [1.102.0](https://github.com/stephenh/joist-ts/compare/v1.101.6...v1.102.0) (2023-08-30)


### Features

* Use `const` keyword instead of Const utility type. ([#766](https://github.com/stephenh/joist-ts/issues/766)) ([a179691](https://github.com/stephenh/joist-ts/commit/a1796917cf4a7cfd6745184c318cfe6ae1dec64a))

## [1.101.6](https://github.com/stephenh/joist-ts/compare/v1.101.5...v1.101.6) (2023-08-30)


### Bug Fixes

* Fail on overlapping field names. ([#764](https://github.com/stephenh/joist-ts/issues/764)) ([b0555ad](https://github.com/stephenh/joist-ts/commit/b0555adc571cdd59d6f5c5c51086915ab8692857)), closes [#762](https://github.com/stephenh/joist-ts/issues/762)

## [1.101.5](https://github.com/stephenh/joist-ts/compare/v1.101.4...v1.101.5) (2023-08-26)


### Bug Fixes

* Fix derived field populate ([#761](https://github.com/stephenh/joist-ts/issues/761)) ([6602bd8](https://github.com/stephenh/joist-ts/commit/6602bd8b5e366fe24243f74c577356232d15bb07))

## [1.101.4](https://github.com/stephenh/joist-ts/compare/v1.101.3...v1.101.4) (2023-08-26)


### Bug Fixes

* Don't fail on restricted reactive hints. ([#760](https://github.com/stephenh/joist-ts/issues/760)) ([98dfb94](https://github.com/stephenh/joist-ts/commit/98dfb944c2f19af5434dccf0adc144d33c95c8f5))

## [1.101.3](https://github.com/stephenh/joist-ts/compare/v1.101.2...v1.101.3) (2023-08-26)


### Bug Fixes

* Transitively load derived values when the entities are new. ([#759](https://github.com/stephenh/joist-ts/issues/759)) ([ba53e7e](https://github.com/stephenh/joist-ts/commit/ba53e7eb8909fc3fd2c2ccfd75dce2cbcba0bc47))

## [1.101.2](https://github.com/stephenh/joist-ts/compare/v1.101.1...v1.101.2) (2023-08-25)


### Bug Fixes

* Dedupe relations before calling load. ([#758](https://github.com/stephenh/joist-ts/issues/758)) ([0ab3c38](https://github.com/stephenh/joist-ts/commit/0ab3c38ce4da7769a8974ebef38119d09f6b8aa4))

## [1.101.1](https://github.com/stephenh/joist-ts/compare/v1.101.0...v1.101.1) (2023-08-16)


### Bug Fixes

* outer join on non required m2o ([#754](https://github.com/stephenh/joist-ts/issues/754)) ([e614226](https://github.com/stephenh/joist-ts/commit/e6142262375b37531e2314382bbf4fdf5746efe9))

# [1.101.0](https://github.com/stephenh/joist-ts/compare/v1.100.0...v1.101.0) (2023-08-12)


### Features

* Output warnings for stale/invalid config keys. ([#752](https://github.com/stephenh/joist-ts/issues/752)) ([5a45b4a](https://github.com/stephenh/joist-ts/commit/5a45b4ad4bb34af32d3bae099b7b77f668572654)), closes [#740](https://github.com/stephenh/joist-ts/issues/740)

# [1.100.0](https://github.com/stephenh/joist-ts/compare/v1.99.0...v1.100.0) (2023-08-07)


### Features

* Add reactivity for m2m relations ([#748](https://github.com/stephenh/joist-ts/issues/748)) ([9282427](https://github.com/stephenh/joist-ts/commit/9282427c05f1c23b5d10c4183966e94df836540a))

# [1.99.0](https://github.com/stephenh/joist-ts/compare/v1.98.0...v1.99.0) (2023-08-06)


### Features

* Add forceReload to PersistedAsyncProperty. ([#750](https://github.com/stephenh/joist-ts/issues/750)) ([7aa51d2](https://github.com/stephenh/joist-ts/commit/7aa51d2a782e4c40a09b159934eed9f1664b93ff))

# [1.98.0](https://github.com/stephenh/joist-ts/compare/v1.97.0...v1.98.0) (2023-08-04)


### Features

* Add changes field to Reacted. ([#744](https://github.com/stephenh/joist-ts/issues/744)) ([d5eacc8](https://github.com/stephenh/joist-ts/commit/d5eacc81338bb864ccd5d62cf076814968c6095d))

# [1.97.0](https://github.com/stephenh/joist-ts/compare/v1.96.0...v1.97.0) (2023-08-04)


### Features

* Add transientFields convention to Reacted. ([#745](https://github.com/stephenh/joist-ts/issues/745)) ([f809ec0](https://github.com/stephenh/joist-ts/commit/f809ec0153f1a8d9f42972719917d7eba5a58dcc))

# [1.96.0](https://github.com/stephenh/joist-ts/compare/v1.95.0...v1.96.0) (2023-08-02)


### Features

* Map bigints as BigInts. ([#742](https://github.com/stephenh/joist-ts/issues/742)) ([c594c3a](https://github.com/stephenh/joist-ts/commit/c594c3a097c51dd8010590587be6a0e2a3af2a7c))

# [1.95.0](https://github.com/stephenh/joist-ts/compare/v1.94.0...v1.95.0) (2023-07-31)


### Features

* Rename entity to fullNonReactiveAccess. ([#741](https://github.com/stephenh/joist-ts/issues/741)) ([0abc17d](https://github.com/stephenh/joist-ts/commit/0abc17d9d6bb33bee0c31a1f5475136bda5faa02))

# [1.94.0](https://github.com/stephenh/joist-ts/compare/v1.93.0...v1.94.0) (2023-07-26)


### Features

* Include enum name into enum details object ([#739](https://github.com/stephenh/joist-ts/issues/739)) ([a8ad3ca](https://github.com/stephenh/joist-ts/commit/a8ad3cab64c49a37909cde12f975c986b7dd7999))

# [1.93.0](https://github.com/stephenh/joist-ts/compare/v1.92.4...v1.93.0) (2023-07-14)


### Features

* Batch findCount queries. ([#730](https://github.com/stephenh/joist-ts/issues/730)) ([54f3e5a](https://github.com/stephenh/joist-ts/commit/54f3e5a17993bcb0cccda1fae7d042b77c276926))

## [1.92.4](https://github.com/stephenh/joist-ts/compare/v1.92.3...v1.92.4) (2023-07-13)


### Bug Fixes

* orderBy on cti base fields  ([#729](https://github.com/stephenh/joist-ts/issues/729)) ([e398cc6](https://github.com/stephenh/joist-ts/commit/e398cc6b660b5d4ac8ac5c9a386f1131c40d9d7a))

## [1.92.3](https://github.com/stephenh/joist-ts/compare/v1.92.2...v1.92.3) (2023-07-12)


### Bug Fixes

* Run beforeDelete hooks before entities are disconnected. ([#727](https://github.com/stephenh/joist-ts/issues/727)) ([716488b](https://github.com/stephenh/joist-ts/commit/716488b82fcbd57e99561047300e585db09937d8))

## [1.92.2](https://github.com/stephenh/joist-ts/compare/v1.92.1...v1.92.2) (2023-07-11)


### Bug Fixes

* Refactor reactivity ([#724](https://github.com/stephenh/joist-ts/issues/724)) ([52e6ba8](https://github.com/stephenh/joist-ts/commit/52e6ba8ff2c83fdc607145c10b4ce7c795ff20d6))

## [1.92.1](https://github.com/stephenh/joist-ts/compare/v1.92.0...v1.92.1) (2023-07-06)


### Bug Fixes

* Use base type alias when filtering. ([#723](https://github.com/stephenh/joist-ts/issues/723)) ([8269d96](https://github.com/stephenh/joist-ts/commit/8269d96bd95dd23f1e5891dac22fe82f21d3742d))

# [1.92.0](https://github.com/stephenh/joist-ts/compare/v1.91.6...v1.92.0) (2023-06-30)


### Features

* Updated EntityId codegen to use actual type instead of a string ([#718](https://github.com/stephenh/joist-ts/issues/718)) ([4c9d808](https://github.com/stephenh/joist-ts/commit/4c9d808cacacde6ff25afe03fe641fdff22da635))

## [1.91.6](https://github.com/stephenh/joist-ts/compare/v1.91.5...v1.91.6) (2023-06-28)


### Bug Fixes

* Check tags/empty string when setting m2o.id. ([#717](https://github.com/stephenh/joist-ts/issues/717)) ([df11ec1](https://github.com/stephenh/joist-ts/commit/df11ec1e85bbd6a19d2dff4331275109e785c97e))

## [1.91.5](https://github.com/stephenh/joist-ts/compare/v1.91.4...v1.91.5) (2023-06-27)


### Bug Fixes

* Provide a nicer error with invalid hints. ([#713](https://github.com/stephenh/joist-ts/issues/713)) ([613749c](https://github.com/stephenh/joist-ts/commit/613749ccfecd57e6360fc1fb2625aad3508d88e3))

## [1.91.4](https://github.com/stephenh/joist-ts/compare/v1.91.3...v1.91.4) (2023-06-26)


### Bug Fixes

* Fix findOrCreate not hooking up both sides. ([#712](https://github.com/stephenh/joist-ts/issues/712)) ([0fb1c36](https://github.com/stephenh/joist-ts/commit/0fb1c36b31f382d1123fef77272baad0c3c292a2))

## [1.91.3](https://github.com/stephenh/joist-ts/compare/v1.91.2...v1.91.3) (2023-06-25)


### Bug Fixes

* Don't infinite recurse on required self-ref keys. ([#710](https://github.com/stephenh/joist-ts/issues/710)) ([6a16ac2](https://github.com/stephenh/joist-ts/commit/6a16ac2db4833c97fd556423cd57feb8a63b8ff9))

## [1.91.2](https://github.com/stephenh/joist-ts/compare/v1.91.1...v1.91.2) (2023-06-22)


### Bug Fixes

* move string/null cast to setter, herustic disable on default "" ([#705](https://github.com/stephenh/joist-ts/issues/705)) ([6ad8556](https://github.com/stephenh/joist-ts/commit/6ad855662059b8ee3ed33048f18e2ae2b4ad5e60))

## [1.91.1](https://github.com/stephenh/joist-ts/compare/v1.91.0...v1.91.1) (2023-06-21)


### Bug Fixes

* Fix multiple nested conditions. ([#703](https://github.com/stephenh/joist-ts/issues/703)) ([ff1e969](https://github.com/stephenh/joist-ts/commit/ff1e96930b8bbd9286fdb2f10b7ff96a50816392)), closes [#701](https://github.com/stephenh/joist-ts/issues/701)

# [1.91.0](https://github.com/stephenh/joist-ts/compare/v1.90.0...v1.91.0) (2023-06-19)


### Features

* add basic custom serde support ([#698](https://github.com/stephenh/joist-ts/issues/698)) ([36bdce6](https://github.com/stephenh/joist-ts/commit/36bdce6d86c12348aa3ee89e3cc19ed31c0390e7))

# [1.90.0](https://github.com/stephenh/joist-ts/compare/v1.89.3...v1.90.0) (2023-06-18)


### Features

* use NotFoundError in load & loadAll ([#697](https://github.com/stephenh/joist-ts/issues/697)) ([d2de239](https://github.com/stephenh/joist-ts/commit/d2de239581ed890e4a530c16248724bf2a36125f))

## [1.89.3](https://github.com/stephenh/joist-ts/compare/v1.89.2...v1.89.3) (2023-06-17)


### Bug Fixes

* ensure exclusive `or` or `and` in ExpressionFilter ([#695](https://github.com/stephenh/joist-ts/issues/695)) ([17b6f5c](https://github.com/stephenh/joist-ts/commit/17b6f5c03a18d6a77335beca39ead726aeef392c))

## [1.89.2](https://github.com/stephenh/joist-ts/compare/v1.89.1...v1.89.2) (2023-06-16)


### Bug Fixes

* add toJSON to ValidationErrors ([#693](https://github.com/stephenh/joist-ts/issues/693)) ([b3c49bd](https://github.com/stephenh/joist-ts/commit/b3c49bd552538acd63b8e93ea78d26cf4bd5ba8a))

## [1.89.1](https://github.com/stephenh/joist-ts/compare/v1.89.0...v1.89.1) (2023-06-16)


### Bug Fixes

* Fix join order in batch finds. ([#694](https://github.com/stephenh/joist-ts/issues/694)) ([07cc043](https://github.com/stephenh/joist-ts/commit/07cc043d89fe76f62bea533a11900caebd5c88a7)), closes [#689](https://github.com/stephenh/joist-ts/issues/689)

# [1.89.0](https://github.com/stephenh/joist-ts/compare/v1.88.6...v1.89.0) (2023-06-15)


### Features

* support zodSchema for jsonb columns ([#686](https://github.com/stephenh/joist-ts/issues/686)) ([ec6ab5a](https://github.com/stephenh/joist-ts/commit/ec6ab5a23c3d796e947eb5f0dc6c31b43e83df28))

## [1.88.6](https://github.com/stephenh/joist-ts/compare/v1.88.5...v1.88.6) (2023-06-15)


### Bug Fixes

* use meta.allFields for cloning ([#690](https://github.com/stephenh/joist-ts/issues/690)) ([0a78048](https://github.com/stephenh/joist-ts/commit/0a78048679ba68968c078ef0edcf19f0eae205e2))

## [1.88.5](https://github.com/stephenh/joist-ts/compare/v1.88.4...v1.88.5) (2023-06-13)


### Bug Fixes

* JsonSerde args within codegen ([#687](https://github.com/stephenh/joist-ts/issues/687)) ([36011f1](https://github.com/stephenh/joist-ts/commit/36011f1f74c946adee8891d0ef0df368c8fdb89a))

## [1.88.4](https://github.com/stephenh/joist-ts/compare/v1.88.3...v1.88.4) (2023-06-12)


### Bug Fixes

* jsonb top level array ([#685](https://github.com/stephenh/joist-ts/issues/685)) ([1cfa6f5](https://github.com/stephenh/joist-ts/commit/1cfa6f5d2decdc6ab9247168fc726c06b84f429d))

## [1.88.3](https://github.com/stephenh/joist-ts/compare/v1.88.2...v1.88.3) (2023-06-09)


### Bug Fixes

* Allow m2os to be used in filters. Fixes [#680](https://github.com/stephenh/joist-ts/issues/680). ([#683](https://github.com/stephenh/joist-ts/issues/683)) ([4c246fa](https://github.com/stephenh/joist-ts/commit/4c246fa855a1f22da5b5d5ec14e38d9f6e3f1c89))

## [1.88.2](https://github.com/stephenh/joist-ts/compare/v1.88.1...v1.88.2) (2023-06-07)


### Bug Fixes

* ignore PersistedAsyncReference on em refresh ([#679](https://github.com/stephenh/joist-ts/issues/679)) ([cb54511](https://github.com/stephenh/joist-ts/commit/cb54511e5ef4d31d13932a7d4b9f5aa99d658973))

## [1.88.1](https://github.com/stephenh/joist-ts/compare/v1.88.0...v1.88.1) (2023-06-06)


### Bug Fixes

* Add support namespaced packages within config imports ([#677](https://github.com/stephenh/joist-ts/issues/677)) ([af7a344](https://github.com/stephenh/joist-ts/commit/af7a344f4cdfc98d170c85d180d55b52a8afe3e2))

# [1.88.0](https://github.com/stephenh/joist-ts/compare/v1.87.0...v1.88.0) (2023-06-05)


### Features

* add `PersistedAsyncReference` ([#639](https://github.com/stephenh/joist-ts/issues/639)) ([8bd9e5b](https://github.com/stephenh/joist-ts/commit/8bd9e5b6aeb3a05adc637c227fc0fd8857875fde))

# [1.87.0](https://github.com/stephenh/joist-ts/compare/v1.86.0...v1.87.0) (2023-06-05)


### Features

* Add custom type override to config & codegen ([#676](https://github.com/stephenh/joist-ts/issues/676)) ([5d90aae](https://github.com/stephenh/joist-ts/commit/5d90aaeaf7bf258fdafca281f399748f29e89339))

# [1.86.0](https://github.com/stephenh/joist-ts/compare/v1.85.2...v1.86.0) (2023-06-04)


### Features

* Bump TypeScript, misc deps. ([#675](https://github.com/stephenh/joist-ts/issues/675)) ([e3fcb70](https://github.com/stephenh/joist-ts/commit/e3fcb7053d0ffc85592dfeba65c145740e1ef4c3))

## [1.85.2](https://github.com/stephenh/joist-ts/compare/v1.85.1...v1.85.2) (2023-06-03)


### Bug Fixes

* Avoid using JS keywords. Fixes [#672](https://github.com/stephenh/joist-ts/issues/672). ([#673](https://github.com/stephenh/joist-ts/issues/673)) ([eee04fe](https://github.com/stephenh/joist-ts/commit/eee04fecc1fd3beb825bf27d83cd30166b42e105))

## [1.85.1](https://github.com/stephenh/joist-ts/compare/v1.85.0...v1.85.1) (2023-06-01)


### Bug Fixes

* Fix syntax error when updating keyword-named columns. ([#671](https://github.com/stephenh/joist-ts/issues/671)) ([a6e820c](https://github.com/stephenh/joist-ts/commit/a6e820caf2da2113ca4f2a6bc1c09f3fcd84cc6c))

# [1.85.0](https://github.com/stephenh/joist-ts/compare/v1.84.0...v1.85.0) (2023-06-01)


### Features

* Add Ops AST/EntityWriter for writes ([#670](https://github.com/stephenh/joist-ts/issues/670)) ([8ff2937](https://github.com/stephenh/joist-ts/commit/8ff29373cd7325fe1858fdd0873df58173febab7))

# [1.84.0](https://github.com/stephenh/joist-ts/compare/v1.83.4...v1.84.0) (2023-05-29)


### Features

* Warn on misconfigured foreign keys. ([#669](https://github.com/stephenh/joist-ts/issues/669)) ([aa882fa](https://github.com/stephenh/joist-ts/commit/aa882fa764c16fe2c3fceb64a8519fd90729b86d))

## [1.83.4](https://github.com/stephenh/joist-ts/compare/v1.83.3...v1.83.4) (2023-05-26)


### Bug Fixes

* Fix findOrCreate incorrectly matching new entities. ([#666](https://github.com/stephenh/joist-ts/issues/666)) ([73135a3](https://github.com/stephenh/joist-ts/commit/73135a328e77d44cd93e32e016f9ab2998a7928c))

## [1.83.3](https://github.com/stephenh/joist-ts/compare/v1.83.2...v1.83.3) (2023-05-25)


### Bug Fixes

* Fix tags using the idType instead of just int. ([#665](https://github.com/stephenh/joist-ts/issues/665)) ([3c96feb](https://github.com/stephenh/joist-ts/commit/3c96feb7b33ccc1153890a9347aedb4a7d9cb175))

## [1.83.2](https://github.com/stephenh/joist-ts/compare/v1.83.1...v1.83.2) (2023-05-25)


### Bug Fixes

* Fix using -1 as a null condition for uuid columns. ([#664](https://github.com/stephenh/joist-ts/issues/664)) ([7aca764](https://github.com/stephenh/joist-ts/commit/7aca7644e4a89c7934879f86b45970ec87c84d89))

## [1.83.1](https://github.com/stephenh/joist-ts/compare/v1.83.0...v1.83.1) (2023-05-25)


### Bug Fixes

* Skip em.find queries if a param is new. ([#663](https://github.com/stephenh/joist-ts/issues/663)) ([c0f45b0](https://github.com/stephenh/joist-ts/commit/c0f45b04e0c224c5f68b5750faab1399a04b7ed1))

# [1.83.0](https://github.com/stephenh/joist-ts/compare/v1.82.0...v1.83.0) (2023-05-24)


### Features

* Teach em.findOrCreate to look for newly-created/updated entities ([#661](https://github.com/stephenh/joist-ts/issues/661)) ([28bd591](https://github.com/stephenh/joist-ts/commit/28bd5915a24510df30c63d36655659cc3b69e71a))

# [1.82.0](https://github.com/stephenh/joist-ts/compare/v1.81.5...v1.82.0) (2023-05-24)


### Features

* Dedupe em.findOrCreates that are called in a loop. ([#660](https://github.com/stephenh/joist-ts/issues/660)) ([e7b3cd3](https://github.com/stephenh/joist-ts/commit/e7b3cd3eddc39797daf96660b5399fde7202b135))

## [1.81.5](https://github.com/stephenh/joist-ts/compare/v1.81.4...v1.81.5) (2023-05-23)


### Bug Fixes

* Support for polys in aliases. ([#659](https://github.com/stephenh/joist-ts/issues/659)) ([31614ef](https://github.com/stephenh/joist-ts/commit/31614ef5dde1593d09d6a91813c005ad93918048))

## [1.81.4](https://github.com/stephenh/joist-ts/compare/v1.81.3...v1.81.4) (2023-05-19)


### Bug Fixes

* Provide a GraphQLFilterAndSettings. ([#658](https://github.com/stephenh/joist-ts/issues/658)) ([fc6aa40](https://github.com/stephenh/joist-ts/commit/fc6aa408e8f1bf69556a55990b34881a580c9317))

## [1.81.3](https://github.com/stephenh/joist-ts/compare/v1.81.2...v1.81.3) (2023-05-19)


### Bug Fixes

* Allow GQL input on limit/offset. ([#657](https://github.com/stephenh/joist-ts/issues/657)) ([a6422a4](https://github.com/stephenh/joist-ts/commit/a6422a45146fde85746c449a3beaa0d9d868ca7a))

## [1.81.2](https://github.com/stephenh/joist-ts/compare/v1.81.1...v1.81.2) (2023-05-19)


### Bug Fixes

* Fix findCount with o2m conditions. ([#656](https://github.com/stephenh/joist-ts/issues/656)) ([7a2eb6d](https://github.com/stephenh/joist-ts/commit/7a2eb6d87fd0a517a1be1f1f034dbebad606f3a9))

## [1.81.1](https://github.com/stephenh/joist-ts/compare/v1.81.0...v1.81.1) (2023-05-19)


### Bug Fixes

* Fix gatherEntities looping on cycles. ([#655](https://github.com/stephenh/joist-ts/issues/655)) ([e504271](https://github.com/stephenh/joist-ts/commit/e50427142c4c2900454e6e1d62b7f7690d319c3b))

# [1.81.0](https://github.com/stephenh/joist-ts/compare/v1.80.0...v1.81.0) (2023-05-19)


### Features

* Add EntityManager-level caching for em.findCount. ([#654](https://github.com/stephenh/joist-ts/issues/654)) ([d7a469b](https://github.com/stephenh/joist-ts/commit/d7a469b194ea8c62b3c7a59f63cd16206cde57ea))

# [1.80.0](https://github.com/stephenh/joist-ts/compare/v1.79.0...v1.80.0) (2023-05-19)


### Features

* Add Entity.tagName/metadata as static fields. ([#652](https://github.com/stephenh/joist-ts/issues/652)) ([a9cab9e](https://github.com/stephenh/joist-ts/commit/a9cab9ea35166f88132467488eb28a5ec2d249ec))

# [1.79.0](https://github.com/stephenh/joist-ts/compare/v1.78.3...v1.79.0) (2023-05-19)


### Features

* Add em.findCount. ([#651](https://github.com/stephenh/joist-ts/issues/651)) ([dcf361c](https://github.com/stephenh/joist-ts/commit/dcf361ce022bcee853d7fe714a96cd681185e358))

## [1.78.3](https://github.com/stephenh/joist-ts/compare/v1.78.2...v1.78.3) (2023-05-19)


### Bug Fixes

* Allow primitive conditions to do is/is not null. ([#650](https://github.com/stephenh/joist-ts/issues/650)) ([995d871](https://github.com/stephenh/joist-ts/commit/995d871c95f378892e221dbdd85721bd7036a12d)), closes [#649](https://github.com/stephenh/joist-ts/issues/649)

## [1.78.2](https://github.com/stephenh/joist-ts/compare/v1.78.1...v1.78.2) (2023-05-17)


### Bug Fixes

* Fix ValueGraphQLFilter's op/value type. ([#646](https://github.com/stephenh/joist-ts/issues/646)) ([de57182](https://github.com/stephenh/joist-ts/commit/de57182e1a5ed479959b7ad31692a6e9a335343d))

## [1.78.1](https://github.com/stephenh/joist-ts/compare/v1.78.0...v1.78.1) (2023-05-17)


### Bug Fixes

* Fix typing of enum GQL filters. ([#645](https://github.com/stephenh/joist-ts/issues/645)) ([a71783f](https://github.com/stephenh/joist-ts/commit/a71783f7be405bcdff7994fd5b2950e7f01db70f))

# [1.78.0](https://github.com/stephenh/joist-ts/compare/v1.77.3...v1.78.0) (2023-05-17)


### Features

* Add more array operators. ([#644](https://github.com/stephenh/joist-ts/issues/644)) ([3b0775d](https://github.com/stephenh/joist-ts/commit/3b0775d0f414edf0b112a78df014853ba1190f11)), closes [#643](https://github.com/stephenh/joist-ts/issues/643)

## [1.77.3](https://github.com/stephenh/joist-ts/compare/v1.77.2...v1.77.3) (2023-05-16)


### Bug Fixes

* Allow 'as' in FilterAndSettings.where. ([#642](https://github.com/stephenh/joist-ts/issues/642)) ([089f625](https://github.com/stephenh/joist-ts/commit/089f6256e3491213dc532d787e198e014787de14))

## [1.77.2](https://github.com/stephenh/joist-ts/compare/v1.77.1...v1.77.2) (2023-05-16)


### Bug Fixes

* Fix caching bug in new em.find code. ([#641](https://github.com/stephenh/joist-ts/issues/641)) ([dbc1fdd](https://github.com/stephenh/joist-ts/commit/dbc1fddca678fad1c497fc5febcd39eab532d367))

## [1.77.1](https://github.com/stephenh/joist-ts/compare/v1.77.0...v1.77.1) (2023-05-16)


### Bug Fixes

* Fix limit/offset can be undefined. ([#640](https://github.com/stephenh/joist-ts/issues/640)) ([4a618f3](https://github.com/stephenh/joist-ts/commit/4a618f33f356ceabb3e1a2adcb87f436b04bd0f9))

# [1.77.0](https://github.com/stephenh/joist-ts/compare/v1.76.3...v1.77.0) (2023-05-16)


### Features

* Use CTEs instead of UNIONs to batch queries.  ([#638](https://github.com/stephenh/joist-ts/issues/638)) ([b37f61a](https://github.com/stephenh/joist-ts/commit/b37f61afd2fb93fa5ea3600d836935149b19309d))

## [1.76.3](https://github.com/stephenh/joist-ts/compare/v1.76.2...v1.76.3) (2023-05-05)


### Bug Fixes

* Fix batch em.finds when using uuids. ([#634](https://github.com/stephenh/joist-ts/issues/634)) ([2e8d8ba](https://github.com/stephenh/joist-ts/commit/2e8d8bae418817c4d44cf43a3cd52e50072d8f97))

## [1.76.2](https://github.com/stephenh/joist-ts/compare/v1.76.1...v1.76.2) (2023-05-05)


### Bug Fixes

* Fix o2m-find typo. ([#633](https://github.com/stephenh/joist-ts/issues/633)) ([b9ca4b9](https://github.com/stephenh/joist-ts/commit/b9ca4b98892e36920b79270d49677dbbc8558262))

## [1.76.1](https://github.com/stephenh/joist-ts/compare/v1.76.0...v1.76.1) (2023-05-03)


### Bug Fixes

* Null check info for unit tests. ([#632](https://github.com/stephenh/joist-ts/issues/632)) ([957b330](https://github.com/stephenh/joist-ts/commit/957b330a87e32191ebbfd931728d592af5255fd7))

# [1.76.0](https://github.com/stephenh/joist-ts/compare/v1.75.0...v1.76.0) (2023-05-03)


### Features

* Refactor get loader ([#631](https://github.com/stephenh/joist-ts/issues/631)) ([d9171c8](https://github.com/stephenh/joist-ts/commit/d9171c8890695da86be0bfe104df39fa03ef5542))

# [1.75.0](https://github.com/stephenh/joist-ts/compare/v1.74.4...v1.75.0) (2023-05-03)


### Features

* Optimize returning only m2o ids. ([#630](https://github.com/stephenh/joist-ts/issues/630)) ([825bff9](https://github.com/stephenh/joist-ts/commit/825bff9b9c444f1101bc5d78cc3e2f483b56b56c))

## [1.74.4](https://github.com/stephenh/joist-ts/compare/v1.74.3...v1.74.4) (2023-04-27)


### Bug Fixes

* Using m2m aliases should use an outer join. ([#627](https://github.com/stephenh/joist-ts/issues/627)) ([b8d7fe6](https://github.com/stephenh/joist-ts/commit/b8d7fe6cacf92ff542cf8b1c9f5147fc75673948))

## [1.74.3](https://github.com/stephenh/joist-ts/compare/v1.74.2...v1.74.3) (2023-04-25)


### Bug Fixes

* Fix merging overlapping reactive hints. ([#624](https://github.com/stephenh/joist-ts/issues/624)) ([1efb74d](https://github.com/stephenh/joist-ts/commit/1efb74dccaf91f506856bfb335f65aeb9da3944c))

## [1.74.2](https://github.com/stephenh/joist-ts/compare/v1.74.1...v1.74.2) (2023-04-21)


### Bug Fixes

* Make a copy of opts. ([#623](https://github.com/stephenh/joist-ts/issues/623)) ([24c62b6](https://github.com/stephenh/joist-ts/commit/24c62b6c61873dce120bcf185609dd1b90e14037))

## [1.74.1](https://github.com/stephenh/joist-ts/compare/v1.74.0...v1.74.1) (2023-04-19)


### Bug Fixes

* add lazy conversion of reactive load hints in async props to avoid infinite recursion on entity creation ([#621](https://github.com/stephenh/joist-ts/issues/621)) ([d3ec321](https://github.com/stephenh/joist-ts/commit/d3ec32101ab97515d4747954bd72aab3b8dce873))

# [1.74.0](https://github.com/stephenh/joist-ts/compare/v1.73.2...v1.74.0) (2023-04-17)


### Features

* Add hasReactiveAsyncProperty to fix reactivity on properties. ([#619](https://github.com/stephenh/joist-ts/issues/619)) ([350ef63](https://github.com/stephenh/joist-ts/commit/350ef63221ad1ce4de55b246bdb6606e8d1c846a))

## [1.73.2](https://github.com/stephenh/joist-ts/compare/v1.73.1...v1.73.2) (2023-04-16)


### Bug Fixes

* Fix not pushing new tags into EntityDbMetadata. ([#618](https://github.com/stephenh/joist-ts/issues/618)) ([69cc23a](https://github.com/stephenh/joist-ts/commit/69cc23a948443c9928f63490d7f8c201220a53cd))

## [1.73.1](https://github.com/stephenh/joist-ts/compare/v1.73.0...v1.73.1) (2023-04-15)


### Bug Fixes

* Ignore template in the `migrations/` directory. ([#617](https://github.com/stephenh/joist-ts/issues/617)) ([07adbee](https://github.com/stephenh/joist-ts/commit/07adbee790957d18adc6280bf07fbf0369e41f8f))

# [1.73.0](https://github.com/stephenh/joist-ts/compare/v1.72.5...v1.73.0) (2023-04-13)


### Features

* Allow defining a default sort to entities/collections. ([#612](https://github.com/stephenh/joist-ts/issues/612)) ([416fa3d](https://github.com/stephenh/joist-ts/commit/416fa3d37aa75a5ad7e49e862172cb4b5cb36726))

## [1.72.5](https://github.com/stephenh/joist-ts/compare/v1.72.4...v1.72.5) (2023-04-13)


### Bug Fixes

* Provide default generics for EntityFilter. ([#616](https://github.com/stephenh/joist-ts/issues/616)) ([bfafcb7](https://github.com/stephenh/joist-ts/commit/bfafcb7284a58e289b9c79ff8b75578717c4b748))

## [1.72.4](https://github.com/stephenh/joist-ts/compare/v1.72.3...v1.72.4) (2023-04-13)


### Bug Fixes

* Allow undefined expressions. ([#615](https://github.com/stephenh/joist-ts/issues/615)) ([68dedee](https://github.com/stephenh/joist-ts/commit/68dedeeddc7b7d7dec89aa1ebf01bbfeb4b09e9b))

## [1.72.3](https://github.com/stephenh/joist-ts/compare/v1.72.2...v1.72.3) (2023-04-12)


### Bug Fixes

* Add id to fields type. ([#614](https://github.com/stephenh/joist-ts/issues/614)) ([9cca93d](https://github.com/stephenh/joist-ts/commit/9cca93db3f7331aef626bb187ff713925ad39e80))

## [1.72.2](https://github.com/stephenh/joist-ts/compare/v1.72.1...v1.72.2) (2023-04-07)


### Bug Fixes

* Fix m2o.id when the value is still a string. ([#611](https://github.com/stephenh/joist-ts/issues/611)) ([26f8162](https://github.com/stephenh/joist-ts/commit/26f816286712522fb516f5ba427db8388b3113cd))

## [1.72.1](https://github.com/stephenh/joist-ts/compare/v1.72.0...v1.72.1) (2023-04-07)


### Bug Fixes

* Fix m2o.id can return untagged ids. ([#608](https://github.com/stephenh/joist-ts/issues/608)) ([7b5247a](https://github.com/stephenh/joist-ts/commit/7b5247ac845878fa784ef60081c4b7f738dedd5b)), closes [#607](https://github.com/stephenh/joist-ts/issues/607)

# [1.72.0](https://github.com/stephenh/joist-ts/compare/v1.71.1...v1.72.0) (2023-04-02)


### Features

* Make test uuids more cute. ([#602](https://github.com/stephenh/joist-ts/issues/602)) ([38c203e](https://github.com/stephenh/joist-ts/commit/38c203e1bb0f65284dda3cd266080bcf9cf02aaf))

## [1.71.1](https://github.com/stephenh/joist-ts/compare/v1.71.0...v1.71.1) (2023-04-02)


### Bug Fixes

* Fix setting m2os with an untagged id. ([#601](https://github.com/stephenh/joist-ts/issues/601)) ([b725f0a](https://github.com/stephenh/joist-ts/commit/b725f0a97244f9496b18c48057201857030ea3bc))

# [1.71.0](https://github.com/stephenh/joist-ts/compare/v1.70.1...v1.71.0) (2023-04-01)


### Features

* use column comments instead of joist-config for relation renames ([#600](https://github.com/stephenh/joist-ts/issues/600)) ([6767af1](https://github.com/stephenh/joist-ts/commit/6767af1c07d75e6ab77ccc0a4810862dd33fe792))

## [1.70.1](https://github.com/stephenh/joist-ts/compare/v1.70.0...v1.70.1) (2023-03-31)


### Bug Fixes

* Use a negative testIndex value for good measure. ([#599](https://github.com/stephenh/joist-ts/issues/599)) ([3ed80f2](https://github.com/stephenh/joist-ts/commit/3ed80f2993c9c99f618e69563319ad743bd7ca2a))

# [1.70.0](https://github.com/stephenh/joist-ts/compare/v1.69.1...v1.70.0) (2023-03-31)


### Features

* Allow using testIndex for numberic fields like order. ([#598](https://github.com/stephenh/joist-ts/issues/598)) ([6d841df](https://github.com/stephenh/joist-ts/commit/6d841df5b472b3ef0362221d6f42c578472bd10b))

## [1.69.1](https://github.com/stephenh/joist-ts/compare/v1.69.0...v1.69.1) (2023-03-30)


### Bug Fixes

* Fix DELETEs bumping oplocks for UPDATEs. ([#593](https://github.com/stephenh/joist-ts/issues/593)) ([5817469](https://github.com/stephenh/joist-ts/commit/581746935aabe1622aaf8b4544f7a6fdc2e5b607)), closes [#591](https://github.com/stephenh/joist-ts/issues/591)

# [1.69.0](https://github.com/stephenh/joist-ts/compare/v1.68.0...v1.69.0) (2023-03-28)


### Features

* Generate a const for enum details. ([#590](https://github.com/stephenh/joist-ts/issues/590)) ([13f2a8e](https://github.com/stephenh/joist-ts/commit/13f2a8ebb2f4247272892cec644bcc3e4708bfd0))

# [1.68.0](https://github.com/stephenh/joist-ts/compare/v1.67.0...v1.68.0) (2023-03-28)


### Features

* Implement oneToOneDataLoader with executeFind. ([#589](https://github.com/stephenh/joist-ts/issues/589)) ([c4df890](https://github.com/stephenh/joist-ts/commit/c4df890f2a11120c270d235db8a18ee95a2f6773))

# [1.67.0](https://github.com/stephenh/joist-ts/compare/v1.66.1...v1.67.0) (2023-03-26)


### Features

* Support creating `flush_database` in multiple databases. ([#588](https://github.com/stephenh/joist-ts/issues/588)) ([b51c4d0](https://github.com/stephenh/joist-ts/commit/b51c4d0680ebc02523e30586f709b9758a5c1312)), closes [#585](https://github.com/stephenh/joist-ts/issues/585)

## [1.66.1](https://github.com/stephenh/joist-ts/compare/v1.66.0...v1.66.1) (2023-03-26)


### Bug Fixes

* Wrap aliases that might be keywords. ([#587](https://github.com/stephenh/joist-ts/issues/587)) ([240eccd](https://github.com/stephenh/joist-ts/commit/240eccd927a29bb6937d5fe433d1212fd3770b5f))

# [1.66.0](https://github.com/stephenh/joist-ts/compare/v1.65.1...v1.66.0) (2023-03-25)


### Features

* Implement oneToManyDataLoader with executeFind. ([#584](https://github.com/stephenh/joist-ts/issues/584)) ([cdaba25](https://github.com/stephenh/joist-ts/commit/cdaba25f3a56d1b3d728eee06d4f171e4439f516))

## [1.65.1](https://github.com/stephenh/joist-ts/compare/v1.65.0...v1.65.1) (2023-03-25)


### Bug Fixes

* Fix m2o.set when using untagged ids. ([#583](https://github.com/stephenh/joist-ts/issues/583)) ([fac523b](https://github.com/stephenh/joist-ts/commit/fac523b5e48e7a387207fd34a732fa30b1ecce12))

# [1.65.0](https://github.com/stephenh/joist-ts/compare/v1.64.2...v1.65.0) (2023-03-25)


### Features

* Add findByUnique. ([#581](https://github.com/stephenh/joist-ts/issues/581)) ([de3c261](https://github.com/stephenh/joist-ts/commit/de3c26172541829296d249266a5cc323205c5953)), closes [#380](https://github.com/stephenh/joist-ts/issues/380)

## [1.64.2](https://github.com/stephenh/joist-ts/compare/v1.64.1...v1.64.2) (2023-03-24)


### Bug Fixes

* Fix missing semi-colon after poly fields. ([#580](https://github.com/stephenh/joist-ts/issues/580)) ([809ca3e](https://github.com/stephenh/joist-ts/commit/809ca3e128b3ac68405a5120577144d1607e4da7))

## [1.64.1](https://github.com/stephenh/joist-ts/compare/v1.64.0...v1.64.1) (2023-03-22)


### Bug Fixes

* Drop unnecessary soft-deleted conditions. ([#579](https://github.com/stephenh/joist-ts/issues/579)) ([21670b3](https://github.com/stephenh/joist-ts/commit/21670b388303d726f97326656ea63032a7eb8d60))

# [1.64.0](https://github.com/stephenh/joist-ts/compare/v1.63.4...v1.64.0) (2023-03-22)


### Features

* added assertLoaded and ensureWithLoaded, repurposed ensureLoaded, renamed ensureLoadedThen to maybePopulateThen ([#578](https://github.com/stephenh/joist-ts/issues/578)) ([b3eb908](https://github.com/stephenh/joist-ts/commit/b3eb908301554c3962e5aa9c849da3f91d615b6a))

## [1.63.4](https://github.com/stephenh/joist-ts/compare/v1.63.3...v1.63.4) (2023-03-22)


### Bug Fixes

* Fix forceReload with o2ms. ([#577](https://github.com/stephenh/joist-ts/issues/577)) ([13c57d0](https://github.com/stephenh/joist-ts/commit/13c57d0a768db4fb361e7295b94cd34d0e5b54b9))

## [1.63.3](https://github.com/stephenh/joist-ts/compare/v1.63.2...v1.63.3) (2023-03-22)


### Bug Fixes

* Fix m2m reload failing up on new entities. ([#576](https://github.com/stephenh/joist-ts/issues/576)) ([6bbcfe1](https://github.com/stephenh/joist-ts/commit/6bbcfe1e2ce6870770eadac4a92e67628aaff8cf))

## [1.63.2](https://github.com/stephenh/joist-ts/compare/v1.63.1...v1.63.2) (2023-03-21)


### Bug Fixes

* Set declarationMap. ([#575](https://github.com/stephenh/joist-ts/issues/575)) ([e299201](https://github.com/stephenh/joist-ts/commit/e299201a3ba00ebcfd7089ebf97c17eb651506fb))

## [1.63.1](https://github.com/stephenh/joist-ts/compare/v1.63.0...v1.63.1) (2023-03-21)


### Bug Fixes

* Add softDeletes option to findOrCreate. ([#574](https://github.com/stephenh/joist-ts/issues/574)) ([9841226](https://github.com/stephenh/joist-ts/commit/98412261ec31302d1b08ece2cac798c81276e621))

# [1.63.0](https://github.com/stephenh/joist-ts/compare/v1.62.0...v1.63.0) (2023-03-19)


### Features

* Teach em.find to filter soft deletes. ([#572](https://github.com/stephenh/joist-ts/issues/572)) ([2e9b270](https://github.com/stephenh/joist-ts/commit/2e9b2701e7ad84ac30d0366e1feec641b6187461))

# [1.62.0](https://github.com/stephenh/joist-ts/compare/v1.61.1...v1.62.0) (2023-03-19)


### Features

* Support loading lens via SQL joins ([#568](https://github.com/stephenh/joist-ts/issues/568)) ([9869a1f](https://github.com/stephenh/joist-ts/commit/9869a1fa5667669d793f2596bd77f6020cb52f2d))

## [1.61.1](https://github.com/stephenh/joist-ts/compare/v1.61.0...v1.61.1) (2023-03-14)


### Bug Fixes

* Align EntityGraphQL filter with EntityFilter. ([#565](https://github.com/stephenh/joist-ts/issues/565)) ([28ceb83](https://github.com/stephenh/joist-ts/commit/28ceb830ea441929f8474d704ff368e2ea9f0464))

# [1.61.0](https://github.com/stephenh/joist-ts/compare/v1.60.1...v1.61.0) (2023-03-13)


### Features

* Add EntityManager.loadFromRows. ([#564](https://github.com/stephenh/joist-ts/issues/564)) ([e1e2aba](https://github.com/stephenh/joist-ts/commit/e1e2aba1edf6915825319c921925039ab82557be))

## [1.60.1](https://github.com/stephenh/joist-ts/compare/v1.60.0...v1.60.1) (2023-03-11)


### Bug Fixes

* Allow pruning complex conditions if any are undefined. ([#563](https://github.com/stephenh/joist-ts/issues/563)) ([72205b2](https://github.com/stephenh/joist-ts/commit/72205b22f785655fdd73c450e6fb59364e931430))

# [1.60.0](https://github.com/stephenh/joist-ts/compare/v1.59.0...v1.60.0) (2023-03-11)


### Features

* Add pruning to complex conditions. ([#562](https://github.com/stephenh/joist-ts/issues/562)) ([6fe8cb2](https://github.com/stephenh/joist-ts/commit/6fe8cb203be42e6030c9e4193a8bc5b67330c9b8))

# [1.59.0](https://github.com/stephenh/joist-ts/compare/v1.58.3...v1.59.0) (2023-03-11)


### Features

* Add m2m support to em.find. ([#561](https://github.com/stephenh/joist-ts/issues/561)) ([119ed02](https://github.com/stephenh/joist-ts/commit/119ed02be5c0ef06861063995743be02f23bcefc))

## [1.58.3](https://github.com/stephenh/joist-ts/compare/v1.58.2...v1.58.3) (2023-03-08)


### Bug Fixes

* Fix bad import that led to 'any' typing. ([#560](https://github.com/stephenh/joist-ts/issues/560)) ([9d24a5c](https://github.com/stephenh/joist-ts/commit/9d24a5ca302b7343dcf7a1cb6d7803291cad0f3d))

## [1.58.2](https://github.com/stephenh/joist-ts/compare/v1.58.1...v1.58.2) (2023-03-06)


### Bug Fixes

* Allow non-GQL find queries to use pruning. ([#559](https://github.com/stephenh/joist-ts/issues/559)) ([4fd67bd](https://github.com/stephenh/joist-ts/commit/4fd67bda8628f3816867a0bbf552b7381e714010))

## [1.58.1](https://github.com/stephenh/joist-ts/compare/v1.58.0...v1.58.1) (2023-03-06)


### Bug Fixes

* Forgot to add o2ms to the GraphQL filters. ([#558](https://github.com/stephenh/joist-ts/issues/558)) ([345ca11](https://github.com/stephenh/joist-ts/commit/345ca118950b2c00846ca81c874f7ef26d724d53))

# [1.58.0](https://github.com/stephenh/joist-ts/compare/v1.57.2...v1.58.0) (2023-03-06)


### Features

* Add nin filter. ([#557](https://github.com/stephenh/joist-ts/issues/557)) ([d8fe13b](https://github.com/stephenh/joist-ts/commit/d8fe13be7428eecb59b5a6068d4066c86b55417f))

## [1.57.2](https://github.com/stephenh/joist-ts/compare/v1.57.1...v1.57.2) (2023-03-06)


### Bug Fixes

* Allow `in` values to be undefined. ([#555](https://github.com/stephenh/joist-ts/issues/555)) ([b3ddaec](https://github.com/stephenh/joist-ts/commit/b3ddaecbb355a548f34e4e1389d16232c1b4966b))

## [1.57.1](https://github.com/stephenh/joist-ts/compare/v1.57.0...v1.57.1) (2023-03-04)


### Bug Fixes

* utils import ([#554](https://github.com/stephenh/joist-ts/issues/554)) ([1ae25ca](https://github.com/stephenh/joist-ts/commit/1ae25ca59d3d46cce56e932c1baba68b9e5968e4))

# [1.57.0](https://github.com/stephenh/joist-ts/compare/v1.56.4...v1.57.0) (2023-03-03)


### Features

* Allow aliases to be entity filters. ([#553](https://github.com/stephenh/joist-ts/issues/553)) ([5815d0c](https://github.com/stephenh/joist-ts/commit/5815d0cf38d6ff64956bcef03dfb8ba7707c68fe))

## [1.56.4](https://github.com/stephenh/joist-ts/compare/v1.56.3...v1.56.4) (2023-03-03)


### Bug Fixes

* Allow keeping only explicit aliases. ([#552](https://github.com/stephenh/joist-ts/issues/552)) ([8f290ab](https://github.com/stephenh/joist-ts/commit/8f290ab4c3043ebc13ce0204e680401848835ae3))

## [1.56.3](https://github.com/stephenh/joist-ts/compare/v1.56.2...v1.56.3) (2023-03-03)


### Bug Fixes

* Allow buildQuery to keep joins. ([#551](https://github.com/stephenh/joist-ts/issues/551)) ([659f4d6](https://github.com/stephenh/joist-ts/commit/659f4d6e24d39b657960f141852163bb54ff307f))

## [1.56.2](https://github.com/stephenh/joist-ts/compare/v1.56.1...v1.56.2) (2023-03-03)


### Bug Fixes

* Fix date filtering. ([#550](https://github.com/stephenh/joist-ts/issues/550)) ([f577e80](https://github.com/stephenh/joist-ts/commit/f577e80d1ceedbf90a18668f0463b66d612088d2))

## [1.56.1](https://github.com/stephenh/joist-ts/compare/v1.56.0...v1.56.1) (2023-03-03)


### Bug Fixes

* Allow many aliases to `aliases`. ([#549](https://github.com/stephenh/joist-ts/issues/549)) ([82e6702](https://github.com/stephenh/joist-ts/commit/82e6702c897fc461b4922170aa1559ebff6b673f))

# [1.56.0](https://github.com/stephenh/joist-ts/compare/v1.55.6...v1.56.0) (2023-03-03)


### Features

* Prune unused joins. ([#548](https://github.com/stephenh/joist-ts/issues/548)) ([060a80e](https://github.com/stephenh/joist-ts/commit/060a80e096eaafba1563ff8e6ecea48c100790f7))

## [1.55.6](https://github.com/stephenh/joist-ts/compare/v1.55.5...v1.55.6) (2023-03-02)


### Bug Fixes

* Fix batching order bys shouldn't distinct. ([#546](https://github.com/stephenh/joist-ts/issues/546)) ([0ea8f86](https://github.com/stephenh/joist-ts/commit/0ea8f867c2a89cee48ca13aba565a15783dbaf1c))

## [1.55.5](https://github.com/stephenh/joist-ts/compare/v1.55.4...v1.55.5) (2023-03-01)


### Bug Fixes

* Fix originalValue on dates. ([#545](https://github.com/stephenh/joist-ts/issues/545)) ([03a2c7d](https://github.com/stephenh/joist-ts/commit/03a2c7db3d46aaa35cc92737bcafc6d654ecdb56))

## [1.55.4](https://github.com/stephenh/joist-ts/compare/v1.55.3...v1.55.4) (2023-03-01)


### Bug Fixes

* Restore behavior of id: undefined is skipped. ([#544](https://github.com/stephenh/joist-ts/issues/544)) ([30c857a](https://github.com/stephenh/joist-ts/commit/30c857aa966b2664eb752b7b5c095b2ecdab406b))

## [1.55.3](https://github.com/stephenh/joist-ts/compare/v1.55.2...v1.55.3) (2023-03-01)


### Bug Fixes

* Fix multiple order bys. ([#543](https://github.com/stephenh/joist-ts/issues/543)) ([63b34c3](https://github.com/stephenh/joist-ts/commit/63b34c3858bf0412b57f2b185f2b3297bec7f715))

## [1.55.2](https://github.com/stephenh/joist-ts/compare/v1.55.1...v1.55.2) (2023-02-28)


### Bug Fixes

* Quote aliases for keywords like do. ([#542](https://github.com/stephenh/joist-ts/issues/542)) ([604bd17](https://github.com/stephenh/joist-ts/commit/604bd174cd5ea67a15171b9688bc2002e664c23f))

## [1.55.1](https://github.com/stephenh/joist-ts/compare/v1.55.0...v1.55.1) (2023-02-28)


### Bug Fixes

* Fix originalValue sometimes returning an entity. ([#541](https://github.com/stephenh/joist-ts/issues/541)) ([95162ff](https://github.com/stephenh/joist-ts/commit/95162fff0ece9d32bb25ab5554f1dd567afddb3a))

# [1.55.0](https://github.com/stephenh/joist-ts/compare/v1.54.0...v1.55.0) (2023-02-28)


### Features

* Support ands/ors in em.find. ([#540](https://github.com/stephenh/joist-ts/issues/540)) ([11830fb](https://github.com/stephenh/joist-ts/commit/11830fbd037f83dfd0d94921157f351b238be598))

# [1.54.0](https://github.com/stephenh/joist-ts/compare/v1.53.0...v1.54.0) (2023-02-27)


### Features

* Support multiple conditions in a single filter ([#538](https://github.com/stephenh/joist-ts/issues/538)) ([25ffd19](https://github.com/stephenh/joist-ts/commit/25ffd1981a92ff5c0db3b97f595bb6d93fb6dfba))

# [1.53.0](https://github.com/stephenh/joist-ts/compare/v1.52.1...v1.53.0) (2023-02-27)


### Features

* Support filtering o2ms. ([#537](https://github.com/stephenh/joist-ts/issues/537)) ([bd594a5](https://github.com/stephenh/joist-ts/commit/bd594a55682b30c02ade3c3e457f2e0c71daea0e))

## [1.52.1](https://github.com/stephenh/joist-ts/compare/v1.52.0...v1.52.1) (2023-02-24)


### Bug Fixes

* Don't skip derived fields in the FieldsOf type. ([#535](https://github.com/stephenh/joist-ts/issues/535)) ([5f4f8fe](https://github.com/stephenh/joist-ts/commit/5f4f8feeb58f1b1fda9136240c699569f13f9e2e))

# [1.52.0](https://github.com/stephenh/joist-ts/compare/v1.51.0...v1.52.0) (2023-02-22)


### Features

* Support filtering on base fields ([#534](https://github.com/stephenh/joist-ts/issues/534)) ([8cb64b0](https://github.com/stephenh/joist-ts/commit/8cb64b09615d58b6ca264a30a34485d73dbbc68c))

# [1.51.0](https://github.com/stephenh/joist-ts/compare/v1.50.6...v1.51.0) (2023-02-22)


### Features

* Refactor QueryBuilder to use QueryParser ([#531](https://github.com/stephenh/joist-ts/issues/531)) ([61ca6ce](https://github.com/stephenh/joist-ts/commit/61ca6ce5bf43e7835ef6d066a9c4b6af6ce68921))

## [1.50.6](https://github.com/stephenh/joist-ts/compare/v1.50.5...v1.50.6) (2023-02-18)


### Bug Fixes

* treat tsvector columns as text ([#532](https://github.com/stephenh/joist-ts/issues/532)) ([f3e6c44](https://github.com/stephenh/joist-ts/commit/f3e6c445e0c5d39daed8316356affebc9eb1fc05))

## [1.50.5](https://github.com/stephenh/joist-ts/compare/v1.50.4...v1.50.5) (2023-02-16)


### Bug Fixes

* Fix originalValue to return the value if unchanged. ([#529](https://github.com/stephenh/joist-ts/issues/529)) ([b44de59](https://github.com/stephenh/joist-ts/commit/b44de5969b58aab0b5eea2b5e606474c28d0365c))

## [1.50.4](https://github.com/stephenh/joist-ts/compare/v1.50.3...v1.50.4) (2023-02-14)


### Bug Fixes

* Add missing Const to loadFromQuery. ([#528](https://github.com/stephenh/joist-ts/issues/528)) ([2943c98](https://github.com/stephenh/joist-ts/commit/2943c98efa5a0d535f9861143d330975af91389e))

## [1.50.3](https://github.com/stephenh/joist-ts/compare/v1.50.2...v1.50.3) (2023-02-13)


### Bug Fixes

* Fix nested load hints on async properties. ([#527](https://github.com/stephenh/joist-ts/issues/527)) ([81836ef](https://github.com/stephenh/joist-ts/commit/81836efd982442dbb6caa6ef41994ea86f6a38e3))

## [1.50.2](https://github.com/stephenh/joist-ts/compare/v1.50.1...v1.50.2) (2023-02-10)


### Bug Fixes

* Fix getLens not filtering undefined references. ([#526](https://github.com/stephenh/joist-ts/issues/526)) ([91ec7b1](https://github.com/stephenh/joist-ts/commit/91ec7b1f74738a8816c88adaafabcffcb3d39f5b))

## [1.50.1](https://github.com/stephenh/joist-ts/compare/v1.50.0...v1.50.1) (2023-02-05)


### Bug Fixes

* Re-fixes the o2m loading issue w/o a scan. ([#522](https://github.com/stephenh/joist-ts/issues/522)) ([94de9c6](https://github.com/stephenh/joist-ts/commit/94de9c67968d3358716b99d88855a13eb4706a2d))

# [1.50.0](https://github.com/stephenh/joist-ts/compare/v1.49.9...v1.50.0) (2023-02-03)


### Features

* include inherited fields in graphql files ([#520](https://github.com/stephenh/joist-ts/issues/520)) ([ed2b0d0](https://github.com/stephenh/joist-ts/commit/ed2b0d065a12a4582b58561df66a3bf80e347d33))

## [1.49.9](https://github.com/stephenh/joist-ts/compare/v1.49.8...v1.49.9) (2023-01-25)


### Bug Fixes

* Fix defaults for polys looking for all parent types. ([#518](https://github.com/stephenh/joist-ts/issues/518)) ([f9c0dfc](https://github.com/stephenh/joist-ts/commit/f9c0dfc9bbc369d03ba95ac9e4940d7297f66bec))

## [1.49.8](https://github.com/stephenh/joist-ts/compare/v1.49.7...v1.49.8) (2023-01-25)


### Bug Fixes

* Fix setPartial a collection to undefined should be ignored. ([#517](https://github.com/stephenh/joist-ts/issues/517)) ([3cc2f81](https://github.com/stephenh/joist-ts/commit/3cc2f813a8091dca522f28d67d30bc2c1edbe10c))

## [1.49.7](https://github.com/stephenh/joist-ts/compare/v1.49.6...v1.49.7) (2023-01-24)


### Bug Fixes

* Optimize em.register. ([#516](https://github.com/stephenh/joist-ts/issues/516)) ([1bbabf2](https://github.com/stephenh/joist-ts/commit/1bbabf2e4a85ad9419784b087378a42f42c3938e))

## [1.49.6](https://github.com/stephenh/joist-ts/compare/v1.49.5...v1.49.6) (2023-01-24)


### Bug Fixes

* Fix repeatedly converting load hints ([#515](https://github.com/stephenh/joist-ts/issues/515)) ([f9d16c1](https://github.com/stephenh/joist-ts/commit/f9d16c1240a40b79c731897d49d4a507522221d6))

## [1.49.5](https://github.com/stephenh/joist-ts/compare/v1.49.4...v1.49.5) (2023-01-24)


### Bug Fixes

* Lazy init cascadeDelete and addedBeforeLoaded. ([#513](https://github.com/stephenh/joist-ts/issues/513)) ([2ef2313](https://github.com/stephenh/joist-ts/commit/2ef23137b847e255c46b33a7ba759d9ed3e43e1d))

## [1.49.4](https://github.com/stephenh/joist-ts/compare/v1.49.3...v1.49.4) (2023-01-24)


### Bug Fixes

* Fix performance issue into o2m.addedBeforeLoaded handling. ([#511](https://github.com/stephenh/joist-ts/issues/511)) ([dd86e03](https://github.com/stephenh/joist-ts/commit/dd86e03390adc86283dc21c65cf5ecbba3362d46))

## [1.49.3](https://github.com/stephenh/joist-ts/compare/v1.49.2...v1.49.3) (2023-01-24)


### Bug Fixes

* Fix default values for fields in base types. ([#510](https://github.com/stephenh/joist-ts/issues/510)) ([d0ddc2e](https://github.com/stephenh/joist-ts/commit/d0ddc2e38953df47c47d180008ab2c2418962be0))

## [1.49.2](https://github.com/stephenh/joist-ts/compare/v1.49.1...v1.49.2) (2023-01-23)


### Bug Fixes

* Fix initial calc of subtype-only derived values. ([#509](https://github.com/stephenh/joist-ts/issues/509)) ([f939746](https://github.com/stephenh/joist-ts/commit/f9397461dca75628dd48dabd2b90cf32502099fe))

## [1.49.1](https://github.com/stephenh/joist-ts/compare/v1.49.0...v1.49.1) (2023-01-22)


### Bug Fixes

* Fix hard deletes showing up in toMatchEntity. ([#508](https://github.com/stephenh/joist-ts/issues/508)) ([f1fc186](https://github.com/stephenh/joist-ts/commit/f1fc186c2bf29e292d25d3854e9c228f75a97d20))

# [1.49.0](https://github.com/stephenh/joist-ts/compare/v1.48.2...v1.49.0) (2023-01-22)


### Features

* Add useFactoryDefaults escape hatch. ([#507](https://github.com/stephenh/joist-ts/issues/507)) ([5ef5000](https://github.com/stephenh/joist-ts/commit/5ef500024c72d9b73c813f7442d327170edc5101))

## [1.48.2](https://github.com/stephenh/joist-ts/compare/v1.48.1...v1.48.2) (2023-01-22)


### Bug Fixes

* Fix reactive rules on subtypes. ([#506](https://github.com/stephenh/joist-ts/issues/506)) ([7dca97a](https://github.com/stephenh/joist-ts/commit/7dca97a30d7a3c79ce9c4a110b34da6b46121581))

## [1.48.1](https://github.com/stephenh/joist-ts/compare/v1.48.0...v1.48.1) (2023-01-22)


### Bug Fixes

* Fix derived fields on subtypes. ([#505](https://github.com/stephenh/joist-ts/issues/505)) ([cafd95a](https://github.com/stephenh/joist-ts/commit/cafd95ae92101f91fda5b1b9d62b7214e8e5116c))

# [1.48.0](https://github.com/stephenh/joist-ts/compare/v1.47.3...v1.48.0) (2023-01-22)


### Features

* Bump TypeScript output to ES2022. ([#504](https://github.com/stephenh/joist-ts/issues/504)) ([e27bb32](https://github.com/stephenh/joist-ts/commit/e27bb324b7fbc8efa08ef5af2402d7c1b37c455b))

## [1.47.3](https://github.com/stephenh/joist-ts/compare/v1.47.2...v1.47.3) (2023-01-21)


### Bug Fixes

* Fix load hints on base properties. ([#503](https://github.com/stephenh/joist-ts/issues/503)) ([8d2d849](https://github.com/stephenh/joist-ts/commit/8d2d84961cb258c807420056492ee52a269664e0))

## [1.47.2](https://github.com/stephenh/joist-ts/compare/v1.47.1...v1.47.2) (2023-01-21)


### Bug Fixes

* Fixes for 'changes' when using inheritance. ([#501](https://github.com/stephenh/joist-ts/issues/501)) ([fbc8594](https://github.com/stephenh/joist-ts/commit/fbc85943ac664108452273e22f08f73c2c7ce302))

## [1.47.1](https://github.com/stephenh/joist-ts/compare/v1.47.0...v1.47.1) (2023-01-17)


### Bug Fixes

* Tests setting undefined should always win. ([#500](https://github.com/stephenh/joist-ts/issues/500)) ([9c90a37](https://github.com/stephenh/joist-ts/commit/9c90a37f48c68bf2037d857c26bd6f674a6aaf70))

# [1.47.0](https://github.com/stephenh/joist-ts/compare/v1.46.2...v1.47.0) (2023-01-16)


### Features

* Let newTestInstance deep merge opts. ([#499](https://github.com/stephenh/joist-ts/issues/499)) ([ebcb210](https://github.com/stephenh/joist-ts/commit/ebcb21003909f802b607f0e003b90acead393922))

## [1.46.2](https://github.com/stephenh/joist-ts/compare/v1.46.1...v1.46.2) (2023-01-11)


### Bug Fixes

* Run rules/hooks on subtypes. ([#496](https://github.com/stephenh/joist-ts/issues/496)) ([ff05b01](https://github.com/stephenh/joist-ts/commit/ff05b01ec072fe9abb32358a36e4bc593db32258))

## [1.46.1](https://github.com/stephenh/joist-ts/compare/v1.46.0...v1.46.1) (2023-01-09)


### Bug Fixes

* Fix o2m duplication in clone. ([#495](https://github.com/stephenh/joist-ts/issues/495)) ([d4f792d](https://github.com/stephenh/joist-ts/commit/d4f792d56c395696512f2b92c03598e3c586c880))

# [1.46.0](https://github.com/stephenh/joist-ts/compare/v1.45.0...v1.46.0) (2023-01-03)


### Features

* Remove the hash versions from codegen files. ([#493](https://github.com/stephenh/joist-ts/issues/493)) ([c596b5d](https://github.com/stephenh/joist-ts/commit/c596b5dfe12c330b39f34c685eb5b29530b7b9fa))

# [1.45.0](https://github.com/stephenh/joist-ts/compare/v1.44.3...v1.45.0) (2023-01-03)


### Features

* Support abstract base types. ([#492](https://github.com/stephenh/joist-ts/issues/492)) ([930873f](https://github.com/stephenh/joist-ts/commit/930873f77db5bbcea0cb5deaa2bab43fa3aaf675))

## [1.44.3](https://github.com/stephenh/joist-ts/compare/v1.44.2...v1.44.3) (2023-01-03)


### Bug Fixes

* Skip the suffix for the first abbreviation. ([#490](https://github.com/stephenh/joist-ts/issues/490)) ([555a425](https://github.com/stephenh/joist-ts/commit/555a4257fab205136eb79335ef1bf6fe0da008b7))

## [1.44.2](https://github.com/stephenh/joist-ts/compare/v1.44.1...v1.44.2) (2023-01-02)


### Bug Fixes

* Revert q&d attempt at cross-table em.find support. ([#488](https://github.com/stephenh/joist-ts/issues/488)) ([c26cbf7](https://github.com/stephenh/joist-ts/commit/c26cbf74ed67dda932740ff029c6007726b01884))

## [1.44.1](https://github.com/stephenh/joist-ts/compare/v1.44.0...v1.44.1) (2023-01-02)


### Bug Fixes

* Bump dependencies. ([#486](https://github.com/stephenh/joist-ts/issues/486)) ([3a5bfa0](https://github.com/stephenh/joist-ts/commit/3a5bfa0ec3159efcd463ae5859e204ecf0b42110))

# [1.44.0](https://github.com/stephenh/joist-ts/compare/v1.43.0...v1.44.0) (2023-01-02)


### Features

* Implement Class Table Inheritance ([#484](https://github.com/stephenh/joist-ts/issues/484)) ([5107267](https://github.com/stephenh/joist-ts/commit/5107267c7bdc05f2f12c8991d0e76425117419d9))

# [1.43.0](https://github.com/stephenh/joist-ts/compare/v1.42.4...v1.43.0) (2022-12-17)


### Features

* Support pretty-but-hard-coded messages for constraint failures. ([#483](https://github.com/stephenh/joist-ts/issues/483)) ([f1c954d](https://github.com/stephenh/joist-ts/commit/f1c954d154c5006c4f26515aec42ce907ae076f5)), closes [#243](https://github.com/stephenh/joist-ts/issues/243)

## [1.42.4](https://github.com/stephenh/joist-ts/compare/v1.42.3...v1.42.4) (2022-12-15)


### Bug Fixes

* Populate through soft-deleted collections. ([#482](https://github.com/stephenh/joist-ts/issues/482)) ([92158dc](https://github.com/stephenh/joist-ts/commit/92158dc5f2587ea923b53332dc1c87b6e2b2445b))

## [1.42.3](https://github.com/stephenh/joist-ts/compare/v1.42.2...v1.42.3) (2022-12-14)


### Bug Fixes

* Fix toMatchEntity in type union scenarios. ([#481](https://github.com/stephenh/joist-ts/issues/481)) ([a593b58](https://github.com/stephenh/joist-ts/commit/a593b58738dcf689df08c86e71a99b0bd783b869))

## [1.42.2](https://github.com/stephenh/joist-ts/compare/v1.42.1...v1.42.2) (2022-12-14)


### Bug Fixes

* Update toMatchEntity to include soft-deleted entities. ([#480](https://github.com/stephenh/joist-ts/issues/480)) ([8fafe4f](https://github.com/stephenh/joist-ts/commit/8fafe4fd51f3270c54de911e59f43c4714d6b69d))

## [1.42.1](https://github.com/stephenh/joist-ts/compare/v1.42.0...v1.42.1) (2022-12-14)


### Bug Fixes

* Don't skip soft-deleted entity in m2o.get. ([#478](https://github.com/stephenh/joist-ts/issues/478)) ([f0d6f2a](https://github.com/stephenh/joist-ts/commit/f0d6f2aaa01ea640324e5dcda5be3bf0a4c87832))

# [1.42.0](https://github.com/stephenh/joist-ts/compare/v1.41.0...v1.42.0) (2022-12-14)


### Features

* Automatically filter soft-deleted entities. ([#477](https://github.com/stephenh/joist-ts/issues/477)) ([a8f4131](https://github.com/stephenh/joist-ts/commit/a8f41319e4d1b36fd592944ee5111d8bcfb08c13))

# [1.41.0](https://github.com/stephenh/joist-ts/compare/v1.40.0...v1.41.0) (2022-12-06)


### Features

* Rename joist-codegen.json to joist-config.json. ([#475](https://github.com/stephenh/joist-ts/issues/475)) ([37ba4bb](https://github.com/stephenh/joist-ts/commit/37ba4bb6495d922bfba1164f96a776db2cd470e8))

# [1.40.0](https://github.com/stephenh/joist-ts/compare/v1.39.2...v1.40.0) (2022-11-29)


### Features

* Add minValueRule, maxValueRule and rangeValueRule ([#474](https://github.com/stephenh/joist-ts/issues/474)) ([3788191](https://github.com/stephenh/joist-ts/commit/37881915ae0085c5c7e22e3ebdf15a31f8c192bd))

## [1.39.2](https://github.com/stephenh/joist-ts/compare/v1.39.1...v1.39.2) (2022-11-27)


### Bug Fixes

* Bump ts-poet for perf improvements. ([#473](https://github.com/stephenh/joist-ts/issues/473)) ([eca6fd9](https://github.com/stephenh/joist-ts/commit/eca6fd98c917704f015577ed3da889b3453f4721))

## [1.39.1](https://github.com/stephenh/joist-ts/compare/v1.39.0...v1.39.1) (2022-11-19)


### Bug Fixes

* Forgot to export withLoaded. ([63820bf](https://github.com/stephenh/joist-ts/commit/63820bf06b5657ca030883d507f02c5d884de850))

# [1.39.0](https://github.com/stephenh/joist-ts/compare/v1.38.0...v1.39.0) (2022-11-19)


### Features

* Upstream withLoaded utility. ([#472](https://github.com/stephenh/joist-ts/issues/472)) ([d4cddec](https://github.com/stephenh/joist-ts/commit/d4cddec0d4812678388a084c80a60511fe78fba0))

# [1.38.0](https://github.com/stephenh/joist-ts/compare/v1.37.10...v1.38.0) (2022-11-17)


### Features

* Bump typescript. ([#471](https://github.com/stephenh/joist-ts/issues/471)) ([942dbef](https://github.com/stephenh/joist-ts/commit/942dbef0173bf0756f46528af48e2d4a4802f4a8))

## [1.37.10](https://github.com/stephenh/joist-ts/compare/v1.37.9...v1.37.10) (2022-11-15)


### Bug Fixes

* Corrctly handle partial unique indexes ([#469](https://github.com/stephenh/joist-ts/issues/469)) ([4f7d2ee](https://github.com/stephenh/joist-ts/commit/4f7d2ee4c35c86b2aa9badf88636ddcb62843278))

## [1.37.9](https://github.com/stephenh/joist-ts/compare/v1.37.8...v1.37.9) (2022-11-12)


### Bug Fixes

* Make metadata inaccessible via Object.keys enumeration. ([#466](https://github.com/stephenh/joist-ts/issues/466)) ([6ca81c0](https://github.com/stephenh/joist-ts/commit/6ca81c098dc3a3106a1e1bb2965c72b6532d55d3))

## [1.37.8](https://github.com/stephenh/joist-ts/compare/v1.37.7...v1.37.8) (2022-11-11)


### Bug Fixes

* Fix passing different length arrays to toMatchEntity. ([#465](https://github.com/stephenh/joist-ts/issues/465)) ([1daa131](https://github.com/stephenh/joist-ts/commit/1daa131ed5fa1920df246f646652e63bb2dd5cc5))

## [1.37.7](https://github.com/stephenh/joist-ts/compare/v1.37.6...v1.37.7) (2022-11-03)


### Bug Fixes

* Fix isDeletedEntity in afterCommit hooks. ([#463](https://github.com/stephenh/joist-ts/issues/463)) ([81abe98](https://github.com/stephenh/joist-ts/commit/81abe9840bfddf6d9be459b3d8e49226c44ab9db))

## [1.37.6](https://github.com/stephenh/joist-ts/compare/v1.37.5...v1.37.6) (2022-10-30)


### Bug Fixes

* Issue where isLoaded does not correctly handle nullable loaded references ([#462](https://github.com/stephenh/joist-ts/issues/462)) ([6bb105e](https://github.com/stephenh/joist-ts/commit/6bb105ec7189a5e6b034e3151275c4c9e7b7da91))

## [1.37.5](https://github.com/stephenh/joist-ts/compare/v1.37.4...v1.37.5) (2022-10-29)


### Bug Fixes

* Fix hasOneThrough in tests. ([#461](https://github.com/stephenh/joist-ts/issues/461)) ([0cb9a49](https://github.com/stephenh/joist-ts/commit/0cb9a49403267bec5f7cde1f003b2e30821a014c))

## [1.37.4](https://github.com/stephenh/joist-ts/compare/v1.37.3...v1.37.4) (2022-10-29)


### Bug Fixes

* Fix accessing hasManyThroughs in tests. ([#460](https://github.com/stephenh/joist-ts/issues/460)) ([ae78236](https://github.com/stephenh/joist-ts/commit/ae7823694436dd3651ce959ed911a7b7f8ae2f79))

## [1.37.3](https://github.com/stephenh/joist-ts/compare/v1.37.2...v1.37.3) (2022-10-26)


### Bug Fixes

* Remove some unneeded lines. ([#459](https://github.com/stephenh/joist-ts/issues/459)) ([25bd3d9](https://github.com/stephenh/joist-ts/commit/25bd3d9cb3c181f77a3dd7f6df7c658eddb4756e))

## [1.37.2](https://github.com/stephenh/joist-ts/compare/v1.37.1...v1.37.2) (2022-10-24)


### Bug Fixes

* loadHints.isNew was checking for idTagged===undefined ([#458](https://github.com/stephenh/joist-ts/issues/458)) ([3d1fd96](https://github.com/stephenh/joist-ts/commit/3d1fd96a4b3416d435d48abae29925bf237a8625))

## [1.37.1](https://github.com/stephenh/joist-ts/compare/v1.37.0...v1.37.1) (2022-10-23)


### Bug Fixes

* Ensure that sameEntity works even if an ID has been assigned to a new entity ([#457](https://github.com/stephenh/joist-ts/issues/457)) ([8b20b04](https://github.com/stephenh/joist-ts/commit/8b20b04102e02f067c020e8edeacfccb8b7f9592))

# [1.37.0](https://github.com/stephenh/joist-ts/compare/v1.36.3...v1.37.0) (2022-10-23)


### Features

* Add EntityManager.assignNewIds capability ([#452](https://github.com/stephenh/joist-ts/issues/452)) ([4cd7362](https://github.com/stephenh/joist-ts/commit/4cd7362f7caa98e26fc09b50f9ba03401e5b774b))

## [1.36.3](https://github.com/stephenh/joist-ts/compare/v1.36.2...v1.36.3) (2022-10-21)


### Bug Fixes

* Fix getCallerName when running via tsx. ([#444](https://github.com/stephenh/joist-ts/issues/444)) ([6aeb2e9](https://github.com/stephenh/joist-ts/commit/6aeb2e963af32ba2ac4de9dc3e9505b30dcceb6f))

## [1.36.2](https://github.com/stephenh/joist-ts/compare/v1.36.1...v1.36.2) (2022-10-17)


### Bug Fixes

* Fix calling isLoaded with the wrong hint. ([#443](https://github.com/stephenh/joist-ts/issues/443)) ([38cf101](https://github.com/stephenh/joist-ts/commit/38cf101c6d6864cee523cbc18c0aaf05e529afec))

## [1.36.1](https://github.com/stephenh/joist-ts/compare/v1.36.0...v1.36.1) (2022-10-17)


### Bug Fixes

* Avoid errors when async properties are wip. ([#442](https://github.com/stephenh/joist-ts/issues/442)) ([344dcaf](https://github.com/stephenh/joist-ts/commit/344dcaf955eb1cf3af4964bedaf9e0ae1c972dcc))

# [1.36.0](https://github.com/stephenh/joist-ts/compare/v1.35.3...v1.36.0) (2022-10-14)


### Features

* Make toMatchEntity sync. ([#440](https://github.com/stephenh/joist-ts/issues/440)) ([4d082dd](https://github.com/stephenh/joist-ts/commit/4d082dd1686aeed8df2ab194d014aa4b9e2fdb84)), closes [#267](https://github.com/stephenh/joist-ts/issues/267)

## [1.35.3](https://github.com/stephenh/joist-ts/compare/v1.35.2...v1.35.3) (2022-10-13)


### Bug Fixes

* Fix toMatchEntity against undefined. ([#439](https://github.com/stephenh/joist-ts/issues/439)) ([969700b](https://github.com/stephenh/joist-ts/commit/969700b39557e1fc5fc4039171d6c418924923dd))

## [1.35.2](https://github.com/stephenh/joist-ts/compare/v1.35.1...v1.35.2) (2022-10-13)


### Bug Fixes

* Allow toMatchEntity to work on object literals. ([#438](https://github.com/stephenh/joist-ts/issues/438)) ([571fb65](https://github.com/stephenh/joist-ts/commit/571fb659f6095466a27c69adfc1347056f8c100e))

## [1.35.1](https://github.com/stephenh/joist-ts/compare/v1.35.0...v1.35.1) (2022-10-13)


### Bug Fixes

* Fix multiple em.flushes in tests with frozen time. ([#437](https://github.com/stephenh/joist-ts/issues/437)) ([5508439](https://github.com/stephenh/joist-ts/commit/5508439cb064c6399d7dbd394083d4a354f9c565))

# [1.35.0](https://github.com/stephenh/joist-ts/compare/v1.34.2...v1.35.0) (2022-10-04)


### Features

* Calling o2m.set(values) deletes owned children ([#435](https://github.com/stephenh/joist-ts/issues/435)) ([bd1f0b3](https://github.com/stephenh/joist-ts/commit/bd1f0b344843c2c094317207bc04806992562fa2))

## [1.34.2](https://github.com/stephenh/joist-ts/compare/v1.34.1...v1.34.2) (2022-10-04)


### Bug Fixes

* Keep deleted children createOrUpdatePartial. ([#434](https://github.com/stephenh/joist-ts/issues/434)) ([b7a0f29](https://github.com/stephenh/joist-ts/commit/b7a0f29e9aa5b5f1fd3c2cd855fb8271099de39a))

## [1.34.1](https://github.com/stephenh/joist-ts/compare/v1.34.0...v1.34.1) (2022-10-04)


### Bug Fixes

* Don't drop mid-string entity names. ([#433](https://github.com/stephenh/joist-ts/issues/433)) ([e17ade8](https://github.com/stephenh/joist-ts/commit/e17ade8ba66d07adf3b3b6b710c7706186224ec4))

# [1.34.0](https://github.com/stephenh/joist-ts/compare/v1.33.5...v1.34.0) (2022-10-03)


### Features

* Support async properties in reactive hints. ([#432](https://github.com/stephenh/joist-ts/issues/432)) ([57fd515](https://github.com/stephenh/joist-ts/commit/57fd5158839895bdc9178d1a57f9a8b6e1a58944))

## [1.33.5](https://github.com/stephenh/joist-ts/compare/v1.33.4...v1.33.5) (2022-09-30)


### Bug Fixes

* Fix PersistedAsyncProperties in DeepNew. ([#430](https://github.com/stephenh/joist-ts/issues/430)) ([4aa9bd9](https://github.com/stephenh/joist-ts/commit/4aa9bd99022ec5ee8ab59c519513121f3a38aab2)), closes [#371](https://github.com/stephenh/joist-ts/issues/371)

## [1.33.4](https://github.com/stephenh/joist-ts/compare/v1.33.3...v1.33.4) (2022-09-28)


### Bug Fixes

* Always populate to handle mutations in the graph. ([#429](https://github.com/stephenh/joist-ts/issues/429)) ([6faa7ac](https://github.com/stephenh/joist-ts/commit/6faa7ac2a4af567f53ea838e9338baaa895c331d))

## [1.33.3](https://github.com/stephenh/joist-ts/compare/v1.33.2...v1.33.3) (2022-09-27)


### Bug Fixes

* Fix EntityManager.populate not checking loadMany ([#418](https://github.com/stephenh/joist-ts/issues/418)) ([8c299f7](https://github.com/stephenh/joist-ts/commit/8c299f7a80d570bc35b4e821b0c187a2501563dd))

## [1.33.2](https://github.com/stephenh/joist-ts/compare/v1.33.1...v1.33.2) (2022-09-23)


### Bug Fixes

* Fix export import. ([#428](https://github.com/stephenh/joist-ts/issues/428)) ([15150bd](https://github.com/stephenh/joist-ts/commit/15150bd0668d61c3640659c2ba00f114006d5022))

## [1.33.1](https://github.com/stephenh/joist-ts/compare/v1.33.0...v1.33.1) (2022-09-23)


### Bug Fixes

* Add makeRun to allow custom newContext functions. ([#427](https://github.com/stephenh/joist-ts/issues/427)) ([4dd3739](https://github.com/stephenh/joist-ts/commit/4dd373909faf13b2395287f0c6fa955850699083))

# [1.33.0](https://github.com/stephenh/joist-ts/compare/v1.32.2...v1.33.0) (2022-09-23)


### Features

* Extract graphql-resolver-utils. ([#425](https://github.com/stephenh/joist-ts/issues/425)) ([f5686e1](https://github.com/stephenh/joist-ts/commit/f5686e1a6c85a9abcde8df273eb94b0608bab1ce))

## [1.32.2](https://github.com/stephenh/joist-ts/compare/v1.32.1...v1.32.2) (2022-09-22)


### Bug Fixes

* Do not reuse entities that have unique constraints. ([#424](https://github.com/stephenh/joist-ts/issues/424)) ([bc098e2](https://github.com/stephenh/joist-ts/commit/bc098e2feb2f7dfa2d4f1e37cf6f099698ad8304))

## [1.32.1](https://github.com/stephenh/joist-ts/compare/v1.32.0...v1.32.1) (2022-09-21)


### Bug Fixes

* Support PersistedAsyncProperties in toMatchEntity. ([#422](https://github.com/stephenh/joist-ts/issues/422)) ([f781ed7](https://github.com/stephenh/joist-ts/commit/f781ed731da4d8da5fd0f0721468f427d90c2aca))

# [1.32.0](https://github.com/stephenh/joist-ts/compare/v1.31.0...v1.32.0) (2022-09-21)


### Features

* Add ability to pass options when creating a many-to-many table ([#421](https://github.com/stephenh/joist-ts/issues/421)) ([fba7b4a](https://github.com/stephenh/joist-ts/commit/fba7b4ae8862def2a0c316de27d9494402edc4ee))

# [1.31.0](https://github.com/stephenh/joist-ts/compare/v1.30.2...v1.31.0) (2022-09-20)


### Features

* Support AsyncProperty in toMatchEntity. ([#420](https://github.com/stephenh/joist-ts/issues/420)) ([8d4415f](https://github.com/stephenh/joist-ts/commit/8d4415fc25b76e919c628498b8b68c17ab12aa00))

## [1.30.2](https://github.com/stephenh/joist-ts/compare/v1.30.1...v1.30.2) (2022-09-18)


### Bug Fixes

* Fix enums resolver w/no enums. ([#419](https://github.com/stephenh/joist-ts/issues/419)) ([eb34845](https://github.com/stephenh/joist-ts/commit/eb34845cc4522918daf049d1725d1c635a9af57c))

## [1.30.1](https://github.com/stephenh/joist-ts/compare/v1.30.0...v1.30.1) (2022-09-14)


### Bug Fixes

* Fix populate performance ([#417](https://github.com/stephenh/joist-ts/issues/417)) ([249e437](https://github.com/stephenh/joist-ts/commit/249e437d0fbc36398346ba77ea8e13c68ff02931))

# [1.30.0](https://github.com/stephenh/joist-ts/compare/v1.29.1...v1.30.0) (2022-09-08)


### Features

* Enhanced support for reversing polymorphic references and reacting to changes through them ([#414](https://github.com/stephenh/joist-ts/issues/414)) ([c653344](https://github.com/stephenh/joist-ts/commit/c653344441c942f2dca70298db7bd3ae2ae119e2))

## [1.29.1](https://github.com/stephenh/joist-ts/compare/v1.29.0...v1.29.1) (2022-09-03)


### Bug Fixes

* Don't include jsonb fields in GraphQL scaffolding. ([#412](https://github.com/stephenh/joist-ts/issues/412)) ([c291345](https://github.com/stephenh/joist-ts/commit/c291345123b5b09e425b3a1c8ab05c3ac04a4522))

# [1.29.0](https://github.com/stephenh/joist-ts/compare/v1.28.8...v1.29.0) (2022-09-02)


### Features

* Use ts-poet saveFiles for conditional formatting. ([#411](https://github.com/stephenh/joist-ts/issues/411)) ([652af21](https://github.com/stephenh/joist-ts/commit/652af21509ca3a99159f7087ef26a1783625697e))

## [1.28.8](https://github.com/stephenh/joist-ts/compare/v1.28.7...v1.28.8) (2022-08-27)


### Bug Fixes

* Bump ts-poet for more prettier-ish. ([#409](https://github.com/stephenh/joist-ts/issues/409)) ([52c9d30](https://github.com/stephenh/joist-ts/commit/52c9d3002fc6c2c29fcc7116135535778c07f9a6))

## [1.28.7](https://github.com/stephenh/joist-ts/compare/v1.28.6...v1.28.7) (2022-08-27)


### Bug Fixes

* Bump ts-poet to use @dprint/typescript directly. ([#408](https://github.com/stephenh/joist-ts/issues/408)) ([a52bb70](https://github.com/stephenh/joist-ts/commit/a52bb70666caed305597f2c37e113c8bebda3da2))

## [1.28.6](https://github.com/stephenh/joist-ts/compare/v1.28.5...v1.28.6) (2022-08-27)


### Bug Fixes

* Use @dprint/json for config and history files. ([#407](https://github.com/stephenh/joist-ts/issues/407)) ([72ef834](https://github.com/stephenh/joist-ts/commit/72ef83494f950a950b52e5db0d4a5644123ef198))

## [1.28.5](https://github.com/stephenh/joist-ts/compare/v1.28.4...v1.28.5) (2022-08-27)


### Bug Fixes

* Fix quoting column names like 'order'. ([#404](https://github.com/stephenh/joist-ts/issues/404)) ([f235bec](https://github.com/stephenh/joist-ts/commit/f235becd70ac72ae2529a6123413976d4ce072ab))

## [1.28.4](https://github.com/stephenh/joist-ts/compare/v1.28.3...v1.28.4) (2022-08-26)


### Bug Fixes

* Use dprint preferSingleLine. ([#403](https://github.com/stephenh/joist-ts/issues/403)) ([b4fa2e6](https://github.com/stephenh/joist-ts/commit/b4fa2e6ade1cea568a8b87a09e33c59d53a9a87b))

## [1.28.3](https://github.com/stephenh/joist-ts/compare/v1.28.2...v1.28.3) (2022-08-26)


### Bug Fixes

* Remove unnest approach to avoid txn conflicts. ([#402](https://github.com/stephenh/joist-ts/issues/402)) ([e0a775c](https://github.com/stephenh/joist-ts/commit/e0a775c16770cc28d35df85ab84228293b4d489b))

## [1.28.2](https://github.com/stephenh/joist-ts/compare/v1.28.1...v1.28.2) (2022-08-26)


### Bug Fixes

* Slightly change how we guess GraphQL types. ([#401](https://github.com/stephenh/joist-ts/issues/401)) ([6edffb9](https://github.com/stephenh/joist-ts/commit/6edffb96af94b0f3bce2216a83271aedc3c4ffb5))

## [1.28.1](https://github.com/stephenh/joist-ts/compare/v1.28.0...v1.28.1) (2022-08-26)


### Bug Fixes

* Re-codegen w/dprint. ([#400](https://github.com/stephenh/joist-ts/issues/400)) ([9f824ab](https://github.com/stephenh/joist-ts/commit/9f824abf1ada878051c0101088ccb6482e95c4d0))

# [1.28.0](https://github.com/stephenh/joist-ts/compare/v1.27.1...v1.28.0) (2022-08-26)


### Features

* Bump ts-poet for dprint. ([#399](https://github.com/stephenh/joist-ts/issues/399)) ([2c24cf8](https://github.com/stephenh/joist-ts/commit/2c24cf8d87a51e9beb77827368c4be40de759fb9))

## [1.27.1](https://github.com/stephenh/joist-ts/compare/v1.27.0...v1.27.1) (2022-08-26)


### Bug Fixes

* Allow nullable persisted fields. ([#398](https://github.com/stephenh/joist-ts/issues/398)) ([ed8604d](https://github.com/stephenh/joist-ts/commit/ed8604db536ea3d2f6a68e23ada0efc37a5fa364))

# [1.27.0](https://github.com/stephenh/joist-ts/compare/v1.26.0...v1.27.0) (2022-08-26)


### Features

* Add PersistedAsyncProperty for derived async fields. ([#397](https://github.com/stephenh/joist-ts/issues/397)) ([61e11d5](https://github.com/stephenh/joist-ts/commit/61e11d514a8ed4d9cf94e0c5a9097a3e1d5ae679))

# [1.26.0](https://github.com/stephenh/joist-ts/compare/v1.25.0...v1.26.0) (2022-08-19)


### Features

* Add EntityManager.loadLens. ([#396](https://github.com/stephenh/joist-ts/issues/396)) ([bd9e62c](https://github.com/stephenh/joist-ts/commit/bd9e62cb0145267dbf97b3d0f649aef5dc8aa36d))

# [1.25.0](https://github.com/stephenh/joist-ts/compare/v1.24.2...v1.25.0) (2022-08-18)


### Features

* Allow passing Loaded to functions that accept Reacted. ([#395](https://github.com/stephenh/joist-ts/issues/395)) ([6d1013f](https://github.com/stephenh/joist-ts/commit/6d1013f62f3b224066c7acd19ed9be74fe543e92))

## [1.24.2](https://github.com/stephenh/joist-ts/compare/v1.24.1...v1.24.2) (2022-08-16)


### Bug Fixes

* **release:** Include test-utils. ([6c2b564](https://github.com/stephenh/joist-ts/commit/6c2b564ffa3a0f960cd24b6f384b330ed49696b7))

## [1.24.1](https://github.com/stephenh/joist-ts/compare/v1.24.0...v1.24.1) (2022-08-16)


### Bug Fixes

* Fix em.deletes in beforeFlush. ([#394](https://github.com/stephenh/joist-ts/issues/394)) ([85652c6](https://github.com/stephenh/joist-ts/commit/85652c6ada6da6d1f019ba5c5b335cd7522b75a4)), closes [#393](https://github.com/stephenh/joist-ts/issues/393)
* Fix filtering on an entity list for IN. ([#391](https://github.com/stephenh/joist-ts/issues/391)) ([07b86af](https://github.com/stephenh/joist-ts/commit/07b86af5d43a6f9f657f6da7c7c9e91a6018f769))
* Fix release step. ([f4e09f9](https://github.com/stephenh/joist-ts/commit/f4e09f99eb0d735074b14d5336c78df47072c06b))

# [1.24.0](https://github.com/stephenh/joist-ts/compare/v1.23.0...v1.24.0) (2022-08-07)


### Features

* Add databaseUrl to joist-codegen ([#389](https://github.com/stephenh/joist-ts/issues/389)) ([e22081c](https://github.com/stephenh/joist-ts/commit/e22081c8ac923995f656bae8e8c54648f8baf05c)), closes [#382](https://github.com/stephenh/joist-ts/issues/382)

# [1.23.0](https://github.com/stephenh/joist-ts/compare/v1.22.7...v1.23.0) (2022-08-07)


### Features

* Rename TimestampConfig.optional to required. ([#387](https://github.com/stephenh/joist-ts/issues/387)) ([d7a52d9](https://github.com/stephenh/joist-ts/commit/d7a52d9fe9c77f34463da1beb5ab38eb970678d4))

## [1.22.7](https://github.com/stephenh/joist-ts/compare/v1.22.6...v1.22.7) (2022-07-28)


### Bug Fixes

* Fix toMatchEntity when expected value is undefined. ([#384](https://github.com/stephenh/joist-ts/issues/384)) ([ab3cbee](https://github.com/stephenh/joist-ts/commit/ab3cbee26416e9745cb9b77e7ef1437ab15e4f1d))

## [1.22.6](https://github.com/stephenh/joist-ts/compare/v1.22.5...v1.22.6) (2022-07-28)


### Bug Fixes

* Deleted entities should trigger async derived fields. ([#383](https://github.com/stephenh/joist-ts/issues/383)) ([95acdd0](https://github.com/stephenh/joist-ts/commit/95acdd00e3987136e5886a32e915bb8ad517b7ae))

## [1.22.5](https://github.com/stephenh/joist-ts/compare/v1.22.4...v1.22.5) (2022-07-25)


### Bug Fixes

* Fix src import. ([#377](https://github.com/stephenh/joist-ts/issues/377)) ([ad35d0c](https://github.com/stephenh/joist-ts/commit/ad35d0cd8a92a0ce7a2f50e28940eaab18e1f21b))

## [1.22.4](https://github.com/stephenh/joist-ts/compare/v1.22.3...v1.22.4) (2022-07-19)


### Bug Fixes

* Check the other side's readonly for o2m/o2o reactive hints. ([#374](https://github.com/stephenh/joist-ts/issues/374)) ([61ccb3f](https://github.com/stephenh/joist-ts/commit/61ccb3fc833195b27a1c9a176caeac3b2e0b9f06))

## [1.22.3](https://github.com/stephenh/joist-ts/compare/v1.22.2...v1.22.3) (2022-07-18)


### Bug Fixes

* Correct clearing of o2m/m2o fks when entity data references the entity instead of ids ([#373](https://github.com/stephenh/joist-ts/issues/373)) ([a1f26bd](https://github.com/stephenh/joist-ts/commit/a1f26bd5eb0a1947bd36307ff6117ba25b3b06b5))

## [1.22.2](https://github.com/stephenh/joist-ts/compare/v1.22.1...v1.22.2) (2022-07-12)


### Bug Fixes

* Fail better when fields are out-of-date. ([#370](https://github.com/stephenh/joist-ts/issues/370)) ([499903f](https://github.com/stephenh/joist-ts/commit/499903fab672dd06329e7b5e20f029d08883ed66))

## [1.22.1](https://github.com/stephenh/joist-ts/compare/v1.22.0...v1.22.1) (2022-07-08)


### Bug Fixes

* Add readonly to id arrays. ([#367](https://github.com/stephenh/joist-ts/issues/367)) ([a58dc8f](https://github.com/stephenh/joist-ts/commit/a58dc8fd56ffc668edbb6f1821e764384f109d34))

# [1.22.0](https://github.com/stephenh/joist-ts/compare/v1.21.2...v1.22.0) (2022-07-07)


### Features

* add support for querying ranges of values using between or gte/lte ([#366](https://github.com/stephenh/joist-ts/issues/366)) ([14b0fa0](https://github.com/stephenh/joist-ts/commit/14b0fa09b1405f6c37c2f77ea13df778453a55fc))

## [1.21.2](https://github.com/stephenh/joist-ts/compare/v1.21.1...v1.21.2) (2022-06-29)


### Bug Fixes

* Fix async derived fields not triggering from hook changes. ([#364](https://github.com/stephenh/joist-ts/issues/364)) ([bfb049e](https://github.com/stephenh/joist-ts/commit/bfb049e52a3a0437506c74b46736baf9c03771ee))

## [1.21.1](https://github.com/stephenh/joist-ts/compare/v1.21.0...v1.21.1) (2022-06-25)


### Bug Fixes

* Bump knexjs. ([70b65a3](https://github.com/stephenh/joist-ts/commit/70b65a33e114ebe9d299f9ecf15a1dfe510d75f7))
* Bump pg, fix knexjs error. ([3c9bf16](https://github.com/stephenh/joist-ts/commit/3c9bf16384fa0ad5e48f0f5952bd5d2e1fb0a12b))

# [1.21.0](https://github.com/stephenh/joist-ts/compare/v1.20.0...v1.21.0) (2022-06-25)


### Features

* Recalc all async derived fields on touch. ([#363](https://github.com/stephenh/joist-ts/issues/363)) ([2c726e5](https://github.com/stephenh/joist-ts/commit/2c726e515342703cdb4de87b8ce388c01c1d9e19))

# [1.20.0](https://github.com/stephenh/joist-ts/compare/v1.19.0...v1.20.0) (2022-06-24)


### Features

* Convert async derived fields to field-level reactive hints. ([#362](https://github.com/stephenh/joist-ts/issues/362)) ([ec90745](https://github.com/stephenh/joist-ts/commit/ec90745c9581002ee71e3db341a3114275fd6252))

# [1.19.0](https://github.com/stephenh/joist-ts/compare/v1.18.0...v1.19.0) (2022-06-24)


### Features

* Skip reacting to immutable fields. ([#361](https://github.com/stephenh/joist-ts/issues/361)) ([6ffd966](https://github.com/stephenh/joist-ts/commit/6ffd9660cc77f81d36aea07b4a523d28d5b452d1))

# [1.18.0](https://github.com/stephenh/joist-ts/compare/v1.17.0...v1.18.0) (2022-06-24)


### Features

* Field-level validation rules ([#351](https://github.com/stephenh/joist-ts/issues/351)) ([08d3cc2](https://github.com/stephenh/joist-ts/commit/08d3cc2188f4d245df8ba2049fd96bbdf6f2d6e9))

# [1.17.0](https://github.com/stephenh/joist-ts/compare/v1.16.0...v1.17.0) (2022-06-22)


### Features

* [SC-15953] em.clone enhancements ([#356](https://github.com/stephenh/joist-ts/issues/356)) ([bced783](https://github.com/stephenh/joist-ts/commit/bced783f5fd47f49bef4d391a0b64efc7ee6fc1f))

# [1.16.0](https://github.com/stephenh/joist-ts/compare/v1.15.3...v1.16.0) (2022-06-21)


### Features

* em.findGql support passing { ne: null } to nullable foreign keys ([#354](https://github.com/stephenh/joist-ts/issues/354)) ([5f6ca50](https://github.com/stephenh/joist-ts/commit/5f6ca504528399d3fbb056e72f180bd588c6c5d5))

## [1.15.3](https://github.com/stephenh/joist-ts/compare/v1.15.2...v1.15.3) (2022-06-08)


### Bug Fixes

* support jest 28 ([#352](https://github.com/stephenh/joist-ts/issues/352)) ([adac4a2](https://github.com/stephenh/joist-ts/commit/adac4a235a55c016897ba418128bcb3e44ad1d5d))

## [1.15.2](https://github.com/stephenh/joist-ts/compare/v1.15.1...v1.15.2) (2022-06-04)


### Bug Fixes

* Add maybeUndefined for polys. ([be2f8e3](https://github.com/stephenh/joist-ts/commit/be2f8e369bf5f9256ef62e5cc1d1f68e57f37821))

## [1.15.1](https://github.com/stephenh/joist-ts/compare/v1.15.0...v1.15.1) (2022-06-04)


### Bug Fixes

* Fix changes type for strings via new EntityFields type. ([#350](https://github.com/stephenh/joist-ts/issues/350)) ([5425d78](https://github.com/stephenh/joist-ts/commit/5425d7801990ed7df916803b7b20079f21d42c0f))

# [1.15.0](https://github.com/stephenh/joist-ts/compare/v1.14.1...v1.15.0) (2022-06-03)


### Features

* Add field-level immutability to the metadata. ([#349](https://github.com/stephenh/joist-ts/issues/349)) ([269762f](https://github.com/stephenh/joist-ts/commit/269762fb9c3588230dccd9d157cbd7cc9d724c92))

## [1.14.1](https://github.com/stephenh/joist-ts/compare/v1.14.0...v1.14.1) (2022-06-03)


### Bug Fixes

* Fix type of changes.originalEntity. ([#348](https://github.com/stephenh/joist-ts/issues/348)) ([779e281](https://github.com/stephenh/joist-ts/commit/779e281199fcde314d166a7c2d2ec1040209b129))

# [1.14.0](https://github.com/stephenh/joist-ts/compare/v1.13.0...v1.14.0) (2022-06-03)


### Features

* Allow em.create m2os with an id. ([#347](https://github.com/stephenh/joist-ts/issues/347)) ([10b28a9](https://github.com/stephenh/joist-ts/commit/10b28a93dd3708890657d02c0fd8b416afe13b5a))

# [1.13.0](https://github.com/stephenh/joist-ts/compare/v1.12.2...v1.13.0) (2022-06-01)


### Features

* support for camel cased table names and columns ([#346](https://github.com/stephenh/joist-ts/issues/346)) ([15e7a73](https://github.com/stephenh/joist-ts/commit/15e7a738db5c274c5cd8ada1ba9a817c1aab28e6))

## [1.12.2](https://github.com/stephenh/joist-ts/compare/v1.12.1...v1.12.2) (2022-05-30)


### Bug Fixes

* Don't capital case field name. ([#344](https://github.com/stephenh/joist-ts/issues/344)) ([48a5500](https://github.com/stephenh/joist-ts/commit/48a55007f5493570f419e67587a61d7361dbea55))

## [1.12.1](https://github.com/stephenh/joist-ts/compare/v1.12.0...v1.12.1) (2022-05-30)


### Bug Fixes

* Don't capital case field name. ([#343](https://github.com/stephenh/joist-ts/issues/343)) ([6281300](https://github.com/stephenh/joist-ts/commit/6281300272094ac74cb3289b4f16f9eaf4172436))

# [1.12.0](https://github.com/stephenh/joist-ts/compare/v1.11.0...v1.12.0) (2022-05-30)


### Features

* Add entity to validation errors. ([#342](https://github.com/stephenh/joist-ts/issues/342)) ([3296249](https://github.com/stephenh/joist-ts/commit/32962499def6789e7598c93887442abd22e73c2c))

# [1.11.0](https://github.com/stephenh/joist-ts/compare/v1.10.10...v1.11.0) (2022-05-29)


### Features

* Upstream cannotBeUpdated. ([#340](https://github.com/stephenh/joist-ts/issues/340)) ([fc08af1](https://github.com/stephenh/joist-ts/commit/fc08af17464a76943550b59b10c760df4ee2252b))

## [1.10.10](https://github.com/stephenh/joist-ts/compare/v1.10.9...v1.10.10) (2022-05-27)


### Bug Fixes

* import type entity manager ([#339](https://github.com/stephenh/joist-ts/issues/339)) ([cf6c75d](https://github.com/stephenh/joist-ts/commit/cf6c75dd8e273de93d03352d55fa02898565249c))

## [1.10.9](https://github.com/stephenh/joist-ts/compare/v1.10.8...v1.10.9) (2022-05-27)


### Bug Fixes

* untagged association ([#332](https://github.com/stephenh/joist-ts/issues/332)) ([6486d2f](https://github.com/stephenh/joist-ts/commit/6486d2fa4de057a601fa5e66b86b6e281089f2dd))

## [1.10.8](https://github.com/stephenh/joist-ts/compare/v1.10.7...v1.10.8) (2022-05-26)


### Bug Fixes

* Fix cloning polymorphic references. ([#338](https://github.com/stephenh/joist-ts/issues/338)) ([ba5f46b](https://github.com/stephenh/joist-ts/commit/ba5f46b1f0ab7d098b1cba7329c1b94ee25625c8)), closes [#333](https://github.com/stephenh/joist-ts/issues/333)

## [1.10.7](https://github.com/stephenh/joist-ts/compare/v1.10.6...v1.10.7) (2022-05-26)


### Bug Fixes

* Export ConnectionConfig. ([#337](https://github.com/stephenh/joist-ts/issues/337)) ([1196a56](https://github.com/stephenh/joist-ts/commit/1196a5655b004c8a37c7ad76a9cff0dea7894973))

## [1.10.6](https://github.com/stephenh/joist-ts/compare/v1.10.5...v1.10.6) (2022-05-25)


### Bug Fixes

* Bump dependencies ([#336](https://github.com/stephenh/joist-ts/issues/336)) ([5378810](https://github.com/stephenh/joist-ts/commit/5378810f80e589227a3f9fc490b24d6449ae5a2c))

## [1.10.5](https://github.com/stephenh/joist-ts/compare/v1.10.4...v1.10.5) (2022-05-24)


### Bug Fixes

* Fix incorrect clone hasChanged against a non-new entity. ([#334](https://github.com/stephenh/joist-ts/issues/334)) ([8117599](https://github.com/stephenh/joist-ts/commit/8117599ab70e3a36ef30585597a1dd650411f645))

## [1.10.4](https://github.com/stephenh/joist-ts/compare/v1.10.3...v1.10.4) (2022-05-24)


### Bug Fixes

* Quote table names. ([#330](https://github.com/stephenh/joist-ts/issues/330)) ([f13a89c](https://github.com/stephenh/joist-ts/commit/f13a89c0345d9616ac61a149fb94229b795adad3)), closes [#329](https://github.com/stephenh/joist-ts/issues/329)

## [1.10.3](https://github.com/stephenh/joist-ts/compare/v1.10.2...v1.10.3) (2022-05-22)


### Bug Fixes

* Fix scaffolding order so that extends comes first. ([#328](https://github.com/stephenh/joist-ts/issues/328)) ([e890466](https://github.com/stephenh/joist-ts/commit/e890466032471889a25002929b8b5059d948be21))

## [1.10.2](https://github.com/stephenh/joist-ts/compare/v1.10.1...v1.10.2) (2022-05-21)


### Bug Fixes

* Only generate an enum detail field. ([#327](https://github.com/stephenh/joist-ts/issues/327)) ([9329882](https://github.com/stephenh/joist-ts/commit/93298824c7b5589d1a7576e52a42f5fe633707c2))

## [1.10.1](https://github.com/stephenh/joist-ts/compare/v1.10.0...v1.10.1) (2022-05-21)


### Bug Fixes

* Add enum details to the GraphQL scaffolding. ([#326](https://github.com/stephenh/joist-ts/issues/326)) ([ac0ada3](https://github.com/stephenh/joist-ts/commit/ac0ada307a49ebc95f8c7884bc46f4dd87ad9a55))

# [1.10.0](https://github.com/stephenh/joist-ts/compare/v1.9.1...v1.10.0) (2022-05-19)


### Features

* Better defaults for name fields. ([#325](https://github.com/stephenh/joist-ts/issues/325)) ([0b40d7c](https://github.com/stephenh/joist-ts/commit/0b40d7cfc562d04048db32434965ef455c346bea))

## [1.9.1](https://github.com/stephenh/joist-ts/compare/v1.9.0...v1.9.1) (2022-05-16)


### Bug Fixes

* Fix dirty logic when data has an entity. ([#324](https://github.com/stephenh/joist-ts/issues/324)) ([b8ab60f](https://github.com/stephenh/joist-ts/commit/b8ab60ff84ca3d6fc484a997bab1cc3ceb422a99))

# [1.9.0](https://github.com/stephenh/joist-ts/compare/v1.8.8...v1.9.0) (2022-05-15)


### Features

* detag ids with config ([#322](https://github.com/stephenh/joist-ts/issues/322)) ([59d47c1](https://github.com/stephenh/joist-ts/commit/59d47c196230ecb4ed8d514a770e5115de89fb47))

## [1.8.8](https://github.com/stephenh/joist-ts/compare/v1.8.7...v1.8.8) (2022-05-13)


### Bug Fixes

* Fix hasChanged on cloned fields that are unset. ([#321](https://github.com/stephenh/joist-ts/issues/321)) ([c24bb23](https://github.com/stephenh/joist-ts/commit/c24bb23caad661b7303f902d726d7880bdbb7cae))

## [1.8.7](https://github.com/stephenh/joist-ts/compare/v1.8.6...v1.8.7) (2022-05-08)


### Bug Fixes

* Make BaseEntity.toJSON more Prisma-like. ([#319](https://github.com/stephenh/joist-ts/issues/319)) ([4cf56f9](https://github.com/stephenh/joist-ts/commit/4cf56f9563f4becfcc707be6705dee1c8f910b38))

## [1.8.6](https://github.com/stephenh/joist-ts/compare/v1.8.5...v1.8.6) (2022-05-06)


### Bug Fixes

* Fix bug in m2o forceReload when already an entity. ([#316](https://github.com/stephenh/joist-ts/issues/316)) ([f01bf4a](https://github.com/stephenh/joist-ts/commit/f01bf4ad2bbe43f9e1ffb26e0de73413d49919cc))

## [1.8.5](https://github.com/stephenh/joist-ts/compare/v1.8.4...v1.8.5) (2022-05-03)


### Bug Fixes

* add numeric types ([#312](https://github.com/stephenh/joist-ts/issues/312)) ([d972fdb](https://github.com/stephenh/joist-ts/commit/d972fdb1d04056fb517e0e48318f0eac66f66119))

## [1.8.4](https://github.com/stephenh/joist-ts/compare/v1.8.3...v1.8.4) (2022-04-29)


### Bug Fixes

* Flatten promises within refresh. ([#311](https://github.com/stephenh/joist-ts/issues/311)) ([9327e63](https://github.com/stephenh/joist-ts/commit/9327e63c4724910f603005e0a22345102ca883fe))

## [1.8.3](https://github.com/stephenh/joist-ts/compare/v1.8.2...v1.8.3) (2022-04-29)


### Bug Fixes

* Skip recursing into custom relations. ([#310](https://github.com/stephenh/joist-ts/issues/310)) ([08df732](https://github.com/stephenh/joist-ts/commit/08df7327d1952630f8728ab9fa8e9d1445e9c595))

## [1.8.2](https://github.com/stephenh/joist-ts/compare/v1.8.1...v1.8.2) (2022-04-29)


### Bug Fixes

* Fix m2o refresh. ([#309](https://github.com/stephenh/joist-ts/issues/309)) ([53a9976](https://github.com/stephenh/joist-ts/commit/53a99763e410d7baaea525395b970127ecc2e6a9))

## [1.8.1](https://github.com/stephenh/joist-ts/compare/v1.8.0...v1.8.1) (2022-04-29)


### Bug Fixes

* Fix hasManyDerived w/forceReload. ([#308](https://github.com/stephenh/joist-ts/issues/308)) ([326840a](https://github.com/stephenh/joist-ts/commit/326840a05b92eac4af6909523238a422913fed22))

# [1.8.0](https://github.com/stephenh/joist-ts/compare/v1.7.1...v1.8.0) (2022-04-29)


### Features

* Implement DeepNew for factories and tests ([#307](https://github.com/stephenh/joist-ts/issues/307)) ([696dd67](https://github.com/stephenh/joist-ts/commit/696dd67bddf990c0366e9c63533e003fefd7367c))

## [1.7.1](https://github.com/stephenh/joist-ts/compare/v1.7.0...v1.7.1) (2022-04-20)


### Bug Fixes

* bump knex to 1.0.7 ([#306](https://github.com/stephenh/joist-ts/issues/306)) ([41f96f9](https://github.com/stephenh/joist-ts/commit/41f96f9e5efd99539d1b3138603daaddab080a00))

# [1.7.0](https://github.com/stephenh/joist-ts/compare/v1.6.1...v1.7.0) (2022-04-19)


### Features

* Make clone smarter. ([#305](https://github.com/stephenh/joist-ts/issues/305)) ([fef395b](https://github.com/stephenh/joist-ts/commit/fef395b46de15712340ed46ddc4df023c69736e1))

## [1.6.1](https://github.com/stephenh/joist-ts/compare/v1.6.0...v1.6.1) (2022-04-18)


### Bug Fixes

* Use joist util fail ([#304](https://github.com/stephenh/joist-ts/issues/304)) ([7830131](https://github.com/stephenh/joist-ts/commit/7830131a951760442c97de43ca48ae6a3608da5f))

# [1.6.0](https://github.com/stephenh/joist-ts/compare/v1.5.0...v1.6.0) (2022-04-15)


### Features

* Implement custom inspect method. ([#302](https://github.com/stephenh/joist-ts/issues/302)) ([80d7ad7](https://github.com/stephenh/joist-ts/commit/80d7ad7f27310ed9bd73c03cc3298ec2e9c662d2))

# [1.5.0](https://github.com/stephenh/joist-ts/compare/v1.4.3...v1.5.0) (2022-04-14)


### Features

* changed graphql mapping from ids to entities and updated scaffolding ([#294](https://github.com/stephenh/joist-ts/issues/294)) ([43fede2](https://github.com/stephenh/joist-ts/commit/43fede2c85eb28f749736e88d340cbcf4256b551))

## [1.4.3](https://github.com/stephenh/joist-ts/compare/v1.4.2...v1.4.3) (2022-04-13)


### Bug Fixes

* Add asNew helper method. ([#301](https://github.com/stephenh/joist-ts/issues/301)) ([9e6aca3](https://github.com/stephenh/joist-ts/commit/9e6aca3707b20112e2c8faaf446b237126d98125))

## [1.4.2](https://github.com/stephenh/joist-ts/compare/v1.4.1...v1.4.2) (2022-04-13)


### Bug Fixes

* Move filter earlier for easier debugging. ([#300](https://github.com/stephenh/joist-ts/issues/300)) ([a42830a](https://github.com/stephenh/joist-ts/commit/a42830a2f7ae904138a3600244e4f33ed9abc4a4))

## [1.4.1](https://github.com/stephenh/joist-ts/compare/v1.4.0...v1.4.1) (2022-04-12)


### Bug Fixes

* Fix type safety of idOrFail. ([#299](https://github.com/stephenh/joist-ts/issues/299)) ([d585a7d](https://github.com/stephenh/joist-ts/commit/d585a7daf0c585665118bc705f0ddd9a40697b2a))

# [1.4.0](https://github.com/stephenh/joist-ts/compare/v1.3.2...v1.4.0) (2022-04-12)


### Bug Fixes

* Fix o2o/m2o naming collisions. ([#298](https://github.com/stephenh/joist-ts/issues/298)) ([4b7b101](https://github.com/stephenh/joist-ts/commit/4b7b1018a9990b3a8f229f26d0810ac07c0c5b4f))


### Features

* Add populate(hint, fn) overload. ([#297](https://github.com/stephenh/joist-ts/issues/297)) ([d093de5](https://github.com/stephenh/joist-ts/commit/d093de575b3ba4cf3b2ca44d203f57c072fe9848)), closes [#296](https://github.com/stephenh/joist-ts/issues/296)

## [1.3.2](https://github.com/stephenh/joist-ts/compare/v1.3.1...v1.3.2) (2022-04-07)


### Bug Fixes

* Make the root workspace private ([#293](https://github.com/stephenh/joist-ts/issues/293)) ([9c917e5](https://github.com/stephenh/joist-ts/commit/9c917e54cf3fa446bced9b4fa5a2d8dfa520934f))

## [1.3.1](https://github.com/stephenh/joist-ts/compare/v1.3.0...v1.3.1) (2022-04-07)


### Bug Fixes

* Correct semantic release publishCmd ([#292](https://github.com/stephenh/joist-ts/issues/292)) ([d87df5c](https://github.com/stephenh/joist-ts/commit/d87df5cd681fa2dfc17c5ea55f51a200fcc3ab02))

# [1.3.0](https://github.com/stephenh/joist-ts/compare/v1.2.1...v1.3.0) (2022-04-07)


### Features

* [SC-14739] Improved newTestInstance support for polymorphic references ([#291](https://github.com/stephenh/joist-ts/issues/291)) ([d68351d](https://github.com/stephenh/joist-ts/commit/d68351df2efbb42b55854e89b6ba1c9f2558f19a))

## [1.2.1](https://github.com/stephenh/joist-ts/compare/v1.2.0...v1.2.1) (2022-04-04)


### Bug Fixes

* Use workspaces foreach to drive semantic-release. ([#290](https://github.com/stephenh/joist-ts/issues/290)) ([6098647](https://github.com/stephenh/joist-ts/commit/6098647e579d4a5616c43804392f52cbd74a63fb))

# [1.2.0](https://github.com/stephenh/joist-ts/compare/v1.1.5...v1.2.0) (2022-04-03)


### Features

* Loosen restrictions on timestamp columns. ([#289](https://github.com/stephenh/joist-ts/issues/289)) ([ec8290e](https://github.com/stephenh/joist-ts/commit/ec8290e9558f93be61ba5cd5d828bd42c9891f30))

## [1.1.5](https://github.com/stephenh/joist-ts/compare/v1.1.4...v1.1.5) (2022-04-01)


### Bug Fixes

* Resolve [#273](https://github.com/stephenh/joist-ts/issues/273) Added isLoaded, ensureLoaded, and ensureLoadedThen ([#286](https://github.com/stephenh/joist-ts/issues/286)) ([a9f366e](https://github.com/stephenh/joist-ts/commit/a9f366e2541c82f3ba6082d836fce20c47f34d96))

## [1.1.4](https://github.com/stephenh/joist-ts/compare/v1.1.3...v1.1.4) (2022-03-27)


### Bug Fixes

* Fix EntityConstructor w/defaultValues. ([#284](https://github.com/stephenh/joist-ts/issues/284)) ([07dcc3c](https://github.com/stephenh/joist-ts/commit/07dcc3cf9dd75c8b4fc4aa8d1e0d288a7f09514c))

## [1.1.3](https://github.com/stephenh/joist-ts/compare/v1.1.2...v1.1.3) (2022-03-27)


### Bug Fixes

* Forgot to publish joist-test-utils. ([71d6d97](https://github.com/stephenh/joist-ts/commit/71d6d97468f93206f43bcb7a86f02ceaba3a5d1c))

## [1.1.2](https://github.com/stephenh/joist-ts/compare/v1.1.1...v1.1.2) (2022-03-27)


### Bug Fixes

* Don't use workspaces foreach to publish. ([e098ed7](https://github.com/stephenh/joist-ts/commit/e098ed7063a0cb7a8dfbd84201380a6d83a48ce0))

## [1.1.1](https://github.com/stephenh/joist-ts/compare/v1.1.0...v1.1.1) (2022-03-27)


### Bug Fixes

* Fix semantic-release. ([7037a81](https://github.com/stephenh/joist-ts/commit/7037a8176604942e632217622aabc7563796d0ca))

# [1.1.0](https://github.com/stephenh/joist-ts/compare/v1.0.0...v1.1.0) (2022-03-27)


### Features

* Fix semantic-release. ([74ac911](https://github.com/stephenh/joist-ts/commit/74ac91119db97eb96b36248029a722cf5980c3ee))

# 1.0.0 (2022-03-27)


### Bug Fixes

* Add afterCommit to flush secret error message. ([#246](https://github.com/stephenh/joist-ts/issues/246)) ([c4b9acb](https://github.com/stephenh/joist-ts/commit/c4b9acb7b93d267f796a0c8b0af68741d3ad438b))
* Add missing semi-colon. ([#156](https://github.com/stephenh/joist-ts/issues/156)) ([d7abc18](https://github.com/stephenh/joist-ts/commit/d7abc1813263cb8c59b322eddb1da3875eb3ccb8))
* Don't add derived primitives to inputs. ([#111](https://github.com/stephenh/joist-ts/issues/111)) ([9c943fd](https://github.com/stephenh/joist-ts/commit/9c943fd95b7cbc6275367185e0399009147cfeda))
* Don't create multiple load promises. ([#209](https://github.com/stephenh/joist-ts/issues/209)) ([e53ccdc](https://github.com/stephenh/joist-ts/commit/e53ccdcf47797d24436e10233b311cd5497fce8f))
* Export impls for instanceof checks. ([#215](https://github.com/stephenh/joist-ts/issues/215)) ([bd24ded](https://github.com/stephenh/joist-ts/commit/bd24ded833f0e13974795576091fc3737c960be2))
* Fix duplicate reactive validations. ([#233](https://github.com/stephenh/joist-ts/issues/233)) ([e2ecfb3](https://github.com/stephenh/joist-ts/commit/e2ecfb352d5c46d427108d653e242cf6d2f8d933))
* Fix faulty hooks orphaning the remaining hooks. ([#210](https://github.com/stephenh/joist-ts/issues/210)) ([3907ae2](https://github.com/stephenh/joist-ts/commit/3907ae280bcfdeffd0ee13f182658b318b9f9c9d))
* Fix InMemoryDriver.flushJoinTables bugs. ([#260](https://github.com/stephenh/joist-ts/issues/260)) ([119129d](https://github.com/stephenh/joist-ts/commit/119129d7e5f3dfe13036b4bcda198e1e553a2f2f))
* Fix native enums not working. ([#281](https://github.com/stephenh/joist-ts/issues/281)) ([bef50b5](https://github.com/stephenh/joist-ts/commit/bef50b5b3a10b321c829857ebee517f04181b727))
* Fix parent factories should skip default children ([#263](https://github.com/stephenh/joist-ts/issues/263)) ([4a2fdc6](https://github.com/stephenh/joist-ts/commit/4a2fdc6219288a8fadb9d1221cdb78ebc01e8bbc))
* fix release command ([#123](https://github.com/stephenh/joist-ts/issues/123)) ([15a942b](https://github.com/stephenh/joist-ts/commit/15a942b101ddfbbd6f6329b2a78b9f5f2ebe732b))
* Have tagId check existing tags. ([#264](https://github.com/stephenh/joist-ts/issues/264)) ([c6c066d](https://github.com/stephenh/joist-ts/commit/c6c066d57c86bf11a42dd9ac39b4c51aa2162c23))
* Polish toMatchEntity. ([#266](https://github.com/stephenh/joist-ts/issues/266)) ([65f8238](https://github.com/stephenh/joist-ts/commit/65f8238d8c2b250252a02a490dc9eca2c50ba3eb))
* Refactor factories to use null less. ([#272](https://github.com/stephenh/joist-ts/issues/272)) ([429fe47](https://github.com/stephenh/joist-ts/commit/429fe47db01c78d1824b15c236af6a529aa0e3fd))
* Rename tagIfNeeded to just tagId. ([#232](https://github.com/stephenh/joist-ts/issues/232)) ([d8a1fef](https://github.com/stephenh/joist-ts/commit/d8a1fef3e790dd9db3700c5b394618774c893f80))
* Teach factories about default values. ([#280](https://github.com/stephenh/joist-ts/issues/280)) ([8bd5d0a](https://github.com/stephenh/joist-ts/commit/8bd5d0a3024cfdbcbb094ab5cfb4b533f19d1892)), closes [#278](https://github.com/stephenh/joist-ts/issues/278)
* Update maybeNew to use ActualFactoryOpts. ([#279](https://github.com/stephenh/joist-ts/issues/279)) ([e38a214](https://github.com/stephenh/joist-ts/commit/e38a214821a967309b0b070a58ef433c36054b2b))


### Features

* Ability to ignore notNull columns with default values ([#124](https://github.com/stephenh/joist-ts/issues/124)) ([c28732b](https://github.com/stephenh/joist-ts/commit/c28732bd258926e7563db99e29348ddc3ae93332))
* Add changes.originalEntity for m2o fields. ([#274](https://github.com/stephenh/joist-ts/issues/274)) ([ae7749e](https://github.com/stephenh/joist-ts/commit/ae7749ee22fbe05b35c22a7ee909764959f817ba))
* Add config.placeholder to initial entity files. ([#257](https://github.com/stephenh/joist-ts/issues/257)) ([c84ef0e](https://github.com/stephenh/joist-ts/commit/c84ef0e3a026e52b7fc168d7adfe749cec868a21)), closes [#251](https://github.com/stephenh/joist-ts/issues/251)
* Add Entity.em field. ([#253](https://github.com/stephenh/joist-ts/issues/253)) ([364c2ef](https://github.com/stephenh/joist-ts/commit/364c2ef89cb55f872d25136abfd87e675e9ae018))
* Add EntityManager.load(string) overload. ([#175](https://github.com/stephenh/joist-ts/issues/175)) ([d9c3837](https://github.com/stephenh/joist-ts/commit/d9c38379676403f277b4555b4e9eafc212e1a47b))
* Add large collections. ([#249](https://github.com/stephenh/joist-ts/issues/249)) ([e8dc86d](https://github.com/stephenh/joist-ts/commit/e8dc86dd44c346fb3baab7990348a3c5aa4ebea3))
* Add ManyToMany.includes. ([#247](https://github.com/stephenh/joist-ts/issues/247)) ([51b5832](https://github.com/stephenh/joist-ts/commit/51b5832107b5619bce36031f7235f4b7f6c6e2a4)), closes [#244](https://github.com/stephenh/joist-ts/issues/244)
* Add resolveFactoryOpt. ([#265](https://github.com/stephenh/joist-ts/issues/265)) ([637ee42](https://github.com/stephenh/joist-ts/commit/637ee429b4def9d0bf2942e4c6516bd22ea25b1a))
* add skipValidation option to flush method ([#140](https://github.com/stephenh/joist-ts/issues/140)) ([34240d7](https://github.com/stephenh/joist-ts/commit/34240d706ca9077dc049d0119b3942770bfe03e9))
* Allow explicitly requesting a factory's default value. ([#125](https://github.com/stephenh/joist-ts/issues/125)) ([5ee2174](https://github.com/stephenh/joist-ts/commit/5ee2174573ddbc9ca2a83bde379e2ab8e1cbebd8))
* Automatically dedup adds to m2ms. ([#180](https://github.com/stephenh/joist-ts/issues/180)) ([e0ed533](https://github.com/stephenh/joist-ts/commit/e0ed533fdba2caa0ae6edee530044a2a080a451d)), closes [#179](https://github.com/stephenh/joist-ts/issues/179)
* pg native enums ([#229](https://github.com/stephenh/joist-ts/issues/229)) ([b85c98e](https://github.com/stephenh/joist-ts/commit/b85c98e505e6193f96db39e7a1401753748b0ffd))
* Use semantic-release. ([57bd722](https://github.com/stephenh/joist-ts/commit/57bd7224bb75f60aed6a4e15da2ef29c6d78a6e8))
