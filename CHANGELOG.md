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
