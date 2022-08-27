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
