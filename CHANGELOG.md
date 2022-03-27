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
