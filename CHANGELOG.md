# [1.218.0](https://github.com/joist-orm/joist-orm/compare/v1.217.0...v1.218.0) (2025-01-02)


### Features

* Export temporal CustomSerde mappers. ([#1332](https://github.com/joist-orm/joist-orm/issues/1332)) ([3ff492b](https://github.com/joist-orm/joist-orm/commit/3ff492bf32047200c861f25a5009bde52f9f3d45))

# [1.217.0](https://github.com/joist-orm/joist-orm/compare/v1.216.0...v1.217.0) (2024-12-22)


### Features

* Add PlainTime support. ([#1330](https://github.com/joist-orm/joist-orm/issues/1330)) ([57cd9b8](https://github.com/joist-orm/joist-orm/commit/57cd9b843d7bb743f7e81b52c84a3ec306e423e0))

# [1.216.0](https://github.com/joist-orm/joist-orm/compare/v1.215.5...v1.216.0) (2024-12-22)


### Features

* Lazily parse Temporal dates ([#1328](https://github.com/joist-orm/joist-orm/issues/1328)) ([10b7a30](https://github.com/joist-orm/joist-orm/commit/10b7a30bc7d0589f59fb40b8d25357c9265d1a5c))

## [1.215.5](https://github.com/joist-orm/joist-orm/compare/v1.215.4...v1.215.5) (2024-12-20)


### Bug Fixes

* Fix toString to sequentially assign new entities. ([#1325](https://github.com/joist-orm/joist-orm/issues/1325)) ([d3c9738](https://github.com/joist-orm/joist-orm/commit/d3c97381963992b1887e0f94ba504cdec8d9c095)), closes [Author#1](https://github.com/Author/issues/1) [#1](https://github.com/joist-orm/joist-orm/issues/1) [Author#5](https://github.com/Author/issues/5) [#5](https://github.com/joist-orm/joist-orm/issues/5)

## [1.215.4](https://github.com/joist-orm/joist-orm/compare/v1.215.3...v1.215.4) (2024-12-19)


### Bug Fixes

* loosen dependencies ([#1324](https://github.com/joist-orm/joist-orm/issues/1324)) ([7e6d3f3](https://github.com/joist-orm/joist-orm/commit/7e6d3f3b9e26219fbd42cc29811c774ccd65795e))

## [1.215.3](https://github.com/joist-orm/joist-orm/compare/v1.215.2...v1.215.3) (2024-12-13)


### Bug Fixes

* Remove serializable isolation level ([#1319](https://github.com/joist-orm/joist-orm/issues/1319)) ([8bd7578](https://github.com/joist-orm/joist-orm/commit/8bd7578f59dd0797845c7b2d0688c74bc76eec03))

## [1.215.2](https://github.com/joist-orm/joist-orm/compare/v1.215.1...v1.215.2) (2024-12-13)


### Bug Fixes

* Allow defaults to try twice. ([#1318](https://github.com/joist-orm/joist-orm/issues/1318)) ([22c2926](https://github.com/joist-orm/joist-orm/commit/22c2926997f1ec1acc07262cdea71136dfdb8659))

## [1.215.1](https://github.com/joist-orm/joist-orm/compare/v1.215.0...v1.215.1) (2024-12-13)


### Bug Fixes

* Allow defaults to recalc during flush. ([#1316](https://github.com/joist-orm/joist-orm/issues/1316)) ([699cda3](https://github.com/joist-orm/joist-orm/commit/699cda3e3599dd4642b0561aa8ff006b88fc32dd))

# [1.215.0](https://github.com/joist-orm/joist-orm/compare/v1.214.1...v1.215.0) (2024-12-13)


### Features

* Support CUIDs. ([#1315](https://github.com/joist-orm/joist-orm/issues/1315)) ([41cd9f7](https://github.com/joist-orm/joist-orm/commit/41cd9f72c00124ca09128406d367806e5bce591b))

## [1.214.1](https://github.com/joist-orm/joist-orm/compare/v1.214.0...v1.214.1) (2024-12-13)


### Bug Fixes

* Fix sync defaults w/db defaults. ([#1313](https://github.com/joist-orm/joist-orm/issues/1313)) ([ce1adc7](https://github.com/joist-orm/joist-orm/commit/ce1adc7e5279d0dcf755fba04b0b15f915f3ef21))

# [1.214.0](https://github.com/joist-orm/joist-orm/compare/v1.213.0...v1.214.0) (2024-12-12)


### Features

* Skip defaults on already-set fields. ([#1311](https://github.com/joist-orm/joist-orm/issues/1311)) ([47533a8](https://github.com/joist-orm/joist-orm/commit/47533a8c4fb28798871fd931dbfc4e5d986e0d3b))

# [1.213.0](https://github.com/joist-orm/joist-orm/compare/v1.212.0...v1.213.0) (2024-12-06)


### Features

* Support RRs on base types. ([#1309](https://github.com/joist-orm/joist-orm/issues/1309)) ([f848772](https://github.com/joist-orm/joist-orm/commit/f8487729824187488aab2067265605a4fe524fad))

# [1.212.0](https://github.com/joist-orm/joist-orm/compare/v1.211.3...v1.212.0) (2024-12-06)


### Features

* Allow ordering by ReactiveFields. ([#1308](https://github.com/joist-orm/joist-orm/issues/1308)) ([3c4c071](https://github.com/joist-orm/joist-orm/commit/3c4c0716e879f6a261e5fa8f29fefd0635127a23))

## [1.211.3](https://github.com/joist-orm/joist-orm/compare/v1.211.2...v1.211.3) (2024-11-21)


### Bug Fixes

* Fix findWithNewOrChanged not filtering deleted changed items. ([#1303](https://github.com/joist-orm/joist-orm/issues/1303)) ([5e786b6](https://github.com/joist-orm/joist-orm/commit/5e786b647586c7bde313ea7f0ebdcc1f2e35482f))

## [1.211.2](https://github.com/joist-orm/joist-orm/compare/v1.211.1...v1.211.2) (2024-11-21)


### Bug Fixes

* Fix runHooksBefore when called from subtypes. ([#1302](https://github.com/joist-orm/joist-orm/issues/1302)) ([075e7fd](https://github.com/joist-orm/joist-orm/commit/075e7fd56488f20afafaaf8d650498bc92972298))

## [1.211.1](https://github.com/joist-orm/joist-orm/compare/v1.211.0...v1.211.1) (2024-11-20)


### Bug Fixes

* Fix lens through a non-null reference. ([#1301](https://github.com/joist-orm/joist-orm/issues/1301)) ([f810693](https://github.com/joist-orm/joist-orm/commit/f8106935792128e767dfba7ad4cad15bdf8f20c3))

# [1.211.0](https://github.com/joist-orm/joist-orm/compare/v1.210.1...v1.211.0) (2024-11-15)


### Features

* Use TypeMap instead of orm field ([#1297](https://github.com/joist-orm/joist-orm/issues/1297)) ([718d656](https://github.com/joist-orm/joist-orm/commit/718d6562380054f384634189189bf6b6369e4ac3))

## [1.210.1](https://github.com/joist-orm/joist-orm/compare/v1.210.0...v1.210.1) (2024-11-14)


### Bug Fixes

* Index rules added from afterMetadata callbacks ([#1296](https://github.com/joist-orm/joist-orm/issues/1296)) ([f335c3e](https://github.com/joist-orm/joist-orm/commit/f335c3ee2752a950074cc5fa2bef113b406346e5))

# [1.210.0](https://github.com/joist-orm/joist-orm/compare/v1.209.3...v1.210.0) (2024-11-09)


### Features

* Simplify id flavors, fix for base types. ([#1293](https://github.com/joist-orm/joist-orm/issues/1293)) ([b28b561](https://github.com/joist-orm/joist-orm/commit/b28b5618894fa293f15afa6cb0cf634c398a4118))

## [1.209.3](https://github.com/joist-orm/joist-orm/compare/v1.209.2...v1.209.3) (2024-11-07)


### Bug Fixes

* Use Promise.allSettled to avoid orphaned lambdas. ([#1291](https://github.com/joist-orm/joist-orm/issues/1291)) ([ddd1aeb](https://github.com/joist-orm/joist-orm/commit/ddd1aeba7e4cb9573014dca8d809491ceb72dc18))

## [1.209.2](https://github.com/joist-orm/joist-orm/compare/v1.209.1...v1.209.2) (2024-11-06)


### Bug Fixes

* Fix specialized default dependencies. ([#1290](https://github.com/joist-orm/joist-orm/issues/1290)) ([1b41dcd](https://github.com/joist-orm/joist-orm/commit/1b41dcd9affd2987965ec8dd659ab57d45f789a2))

## [1.209.1](https://github.com/joist-orm/joist-orm/compare/v1.209.0...v1.209.1) (2024-11-05)


### Bug Fixes

* Add entty to CustomReferenceOpts.isLoaded. ([#1288](https://github.com/joist-orm/joist-orm/issues/1288)) ([f4b0988](https://github.com/joist-orm/joist-orm/commit/f4b09884d4359ffdf55c2641078fd9d84ced6bdd))

# [1.209.0](https://github.com/joist-orm/joist-orm/compare/v1.208.6...v1.209.0) (2024-11-03)


### Features

* Type GraphQL subtyped m2os as Like. ([#1286](https://github.com/joist-orm/joist-orm/issues/1286)) ([972e433](https://github.com/joist-orm/joist-orm/commit/972e4330c0038e4db60790b844e473e10ce6faf5)), closes [#1282](https://github.com/joist-orm/joist-orm/issues/1282)

## [1.208.6](https://github.com/joist-orm/joist-orm/compare/v1.208.5...v1.208.6) (2024-11-03)


### Bug Fixes

* Resolve default deferreds in a promise. ([#1284](https://github.com/joist-orm/joist-orm/issues/1284)) ([57c5fff](https://github.com/joist-orm/joist-orm/commit/57c5fff5de5ab6d15f8d46d0cd3385f75fbf819b))

## [1.208.5](https://github.com/joist-orm/joist-orm/compare/v1.208.4...v1.208.5) (2024-10-29)


### Bug Fixes

* Specialize the o2m side of subType: self m2os. ([#1281](https://github.com/joist-orm/joist-orm/issues/1281)) ([74ebf33](https://github.com/joist-orm/joist-orm/commit/74ebf33e058cee648b0d8627bae41cbcfd01f1ae))

## [1.208.4](https://github.com/joist-orm/joist-orm/compare/v1.208.3...v1.208.4) (2024-10-29)


### Bug Fixes

* Fix withLoaded for RFs/RQFs/RGs. ([#1279](https://github.com/joist-orm/joist-orm/issues/1279)) ([f9c9ffe](https://github.com/joist-orm/joist-orm/commit/f9c9ffeb725ee9839ee0f92a8fe06eac68dd2bf7))

## [1.208.3](https://github.com/joist-orm/joist-orm/compare/v1.208.2...v1.208.3) (2024-10-29)


### Bug Fixes

* Fix withLoaded against Async Properties. ([#1278](https://github.com/joist-orm/joist-orm/issues/1278)) ([b41beb8](https://github.com/joist-orm/joist-orm/commit/b41beb888ff544552a1d36884e436dd93391c134))

## [1.208.2](https://github.com/joist-orm/joist-orm/compare/v1.208.1...v1.208.2) (2024-10-29)


### Bug Fixes

* withLoaded should fail when relations are unloaded. ([#1277](https://github.com/joist-orm/joist-orm/issues/1277)) ([202be0f](https://github.com/joist-orm/joist-orm/commit/202be0f6ea7dcbdb24173aa28d31d0ddaf32959c))

## [1.208.1](https://github.com/joist-orm/joist-orm/compare/v1.208.0...v1.208.1) (2024-10-23)


### Bug Fixes

* Fix subtypes adding cannotBeUpdated to base field. ([#1274](https://github.com/joist-orm/joist-orm/issues/1274)) ([ebbfd38](https://github.com/joist-orm/joist-orm/commit/ebbfd387c8570d5e4118f12c9b592acbca3f2ba8))

# [1.208.0](https://github.com/joist-orm/joist-orm/compare/v1.207.0...v1.208.0) (2024-10-23)


### Features

* Allow o2m subtype specialization. ([#1273](https://github.com/joist-orm/joist-orm/issues/1273)) ([f951bf8](https://github.com/joist-orm/joist-orm/commit/f951bf8664a6958e98b0ec8dcd6b4ecec61baa72))

# [1.207.0](https://github.com/joist-orm/joist-orm/compare/v1.206.1...v1.207.0) (2024-10-23)


### Features

* Add cross-entity hook ordering. ([#1271](https://github.com/joist-orm/joist-orm/issues/1271)) ([e74071d](https://github.com/joist-orm/joist-orm/commit/e74071d32964e514e749b5935974905cc3fd38ce))

## [1.206.1](https://github.com/joist-orm/joist-orm/compare/v1.206.0...v1.206.1) (2024-10-21)


### Bug Fixes

* Fix findWithNewOrChanged on m2os of new entity. ([#1270](https://github.com/joist-orm/joist-orm/issues/1270)) ([733784c](https://github.com/joist-orm/joist-orm/commit/733784c01b4be4a8dd59c28d0a814c4583c87800))

# [1.206.0](https://github.com/joist-orm/joist-orm/compare/v1.205.6...v1.206.0) (2024-10-19)


### Features

* Add Relation.hasBeenSet. ([#1269](https://github.com/joist-orm/joist-orm/issues/1269)) ([cc722f1](https://github.com/joist-orm/joist-orm/commit/cc722f1be6ebd9dcd9c3698470010d7c632047b4))

## [1.205.6](https://github.com/joist-orm/joist-orm/compare/v1.205.5...v1.205.6) (2024-10-19)


### Bug Fixes

* Bump dependencies. ([#1267](https://github.com/joist-orm/joist-orm/issues/1267)) ([7e037ce](https://github.com/joist-orm/joist-orm/commit/7e037cec745e469ed6f5ed86343dcca630140904))

## [1.205.5](https://github.com/joist-orm/joist-orm/compare/v1.205.4...v1.205.5) (2024-10-16)


### Bug Fixes

* Pass root to the runField args lambda. ([#1266](https://github.com/joist-orm/joist-orm/issues/1266)) ([6149ce3](https://github.com/joist-orm/joist-orm/commit/6149ce332e2a093f84c9ffd812309855b46ae851))

## [1.205.4](https://github.com/joist-orm/joist-orm/compare/v1.205.3...v1.205.4) (2024-10-14)


### Bug Fixes

* Fix entityResolver for derived enums. ([#1265](https://github.com/joist-orm/joist-orm/issues/1265)) ([d3ebf35](https://github.com/joist-orm/joist-orm/commit/d3ebf35ca0154ff53cde5c9e2f6e5135e066563f))

## [1.205.3](https://github.com/joist-orm/joist-orm/compare/v1.205.2...v1.205.3) (2024-10-13)


### Bug Fixes

* Fail on invalid factory keys. ([#1264](https://github.com/joist-orm/joist-orm/issues/1264)) ([e29944a](https://github.com/joist-orm/joist-orm/commit/e29944ae2a1159571cc60d8122860065e2be90a4)), closes [#1260](https://github.com/joist-orm/joist-orm/issues/1260)

## [1.205.2](https://github.com/joist-orm/joist-orm/compare/v1.205.1...v1.205.2) (2024-10-12)


### Bug Fixes

* Export Deferred from joist-utils. ([#1263](https://github.com/joist-orm/joist-orm/issues/1263)) ([9db6af6](https://github.com/joist-orm/joist-orm/commit/9db6af6e22fede57b40acc6a74259b786fb9d4e9))

## [1.205.1](https://github.com/joist-orm/joist-orm/compare/v1.205.0...v1.205.1) (2024-10-12)


### Bug Fixes

* Fix assignNewIds not indexing the entities. ([#1262](https://github.com/joist-orm/joist-orm/issues/1262)) ([0ae9821](https://github.com/joist-orm/joist-orm/commit/0ae98210e0e239cfbb709bd326e56123e60dcf7b))

# [1.205.0](https://github.com/joist-orm/joist-orm/compare/v1.204.2...v1.205.0) (2024-10-12)


### Features

* Allow STI FKs to be specialized to each subtype ([#1261](https://github.com/joist-orm/joist-orm/issues/1261)) ([2433099](https://github.com/joist-orm/joist-orm/commit/2433099e4d2a6384f0b7497eb60657ca66124e22))

## [1.204.2](https://github.com/joist-orm/joist-orm/compare/v1.204.1...v1.204.2) (2024-10-12)


### Bug Fixes

* Fix inference for required hasReactiveReference. ([#1259](https://github.com/joist-orm/joist-orm/issues/1259)) ([505b831](https://github.com/joist-orm/joist-orm/commit/505b831f629f2f72edc07359cad311005e321024))

## [1.204.1](https://github.com/joist-orm/joist-orm/compare/v1.204.0...v1.204.1) (2024-10-03)


### Bug Fixes

* Simplify base setPartial/setDeepPartial types. ([#1256](https://github.com/joist-orm/joist-orm/issues/1256)) ([9be84e7](https://github.com/joist-orm/joist-orm/commit/9be84e7c8a5c7a6a4eb52bacb9ccf1973b54c75a))

# [1.204.0](https://github.com/joist-orm/joist-orm/compare/v1.203.0...v1.204.0) (2024-10-03)


### Features

* Add entity.setDeepPartial method. ([#1254](https://github.com/joist-orm/joist-orm/issues/1254)) ([f1a1264](https://github.com/joist-orm/joist-orm/commit/f1a126414f22604bf75534432c5979d300581e38))

# [1.203.0](https://github.com/joist-orm/joist-orm/compare/v1.202.0...v1.203.0) (2024-10-02)


### Features

* Add em.setDefaults. ([#1255](https://github.com/joist-orm/joist-orm/issues/1255)) ([269f9aa](https://github.com/joist-orm/joist-orm/commit/269f9aa202d3c2fb9d308e050eff65b0d7fdf17d))

# [1.202.0](https://github.com/joist-orm/joist-orm/compare/v1.201.1...v1.202.0) (2024-10-02)


### Features

* Allow subtypes to specialize base FKs. ([#1253](https://github.com/joist-orm/joist-orm/issues/1253)) ([495435b](https://github.com/joist-orm/joist-orm/commit/495435b0de97fe24b31264ef1800ddf600bf13d7))

## [1.201.1](https://github.com/joist-orm/joist-orm/compare/v1.201.0...v1.201.1) (2024-10-01)


### Bug Fixes

* Enforce async setDefaults use the async keyword. ([#1252](https://github.com/joist-orm/joist-orm/issues/1252)) ([272d803](https://github.com/joist-orm/joist-orm/commit/272d80325f716bb80daf54f94d6a3dc7c6c9d657))

# [1.201.0](https://github.com/joist-orm/joist-orm/compare/v1.200.0...v1.201.0) (2024-10-01)


### Features

* Update factories to set defaults immediately. ([#1251](https://github.com/joist-orm/joist-orm/issues/1251)) ([0ab8e3e](https://github.com/joist-orm/joist-orm/commit/0ab8e3e43fc5dbc9c3287dbb7098ed98bbdd477c))

# [1.200.0](https://github.com/joist-orm/joist-orm/compare/v1.199.0...v1.200.0) (2024-09-27)


### Features

* Add some tsdoc to codegen-only methods ([#1219](https://github.com/joist-orm/joist-orm/issues/1219)) ([bc3349e](https://github.com/joist-orm/joist-orm/commit/bc3349e9a86bcae4fec5b84fddbd7a5453389b38))

# [1.199.0](https://github.com/joist-orm/joist-orm/compare/v1.198.1...v1.199.0) (2024-09-27)


### Features

* Specialize m2o on subtypes. ([#1249](https://github.com/joist-orm/joist-orm/issues/1249)) ([c231309](https://github.com/joist-orm/joist-orm/commit/c2313090adf7b9bce189c28336d08d8a4fe3dc39))

## [1.198.1](https://github.com/joist-orm/joist-orm/compare/v1.198.0...v1.198.1) (2024-09-27)


### Bug Fixes

* Remove unnecessary casts. ([#1248](https://github.com/joist-orm/joist-orm/issues/1248)) ([d8d5855](https://github.com/joist-orm/joist-orm/commit/d8d5855758e9f279fa8790c0476804d13ad4d80b))

# [1.198.0](https://github.com/joist-orm/joist-orm/compare/v1.197.6...v1.198.0) (2024-09-27)


### Features

* Support gt/gte/lte/lt on FK columns. ([#1247](https://github.com/joist-orm/joist-orm/issues/1247)) ([cee79ba](https://github.com/joist-orm/joist-orm/commit/cee79bae209208fc1e520ed4b113cd8ee64abc95))

## [1.197.6](https://github.com/joist-orm/joist-orm/compare/v1.197.5...v1.197.6) (2024-09-25)


### Bug Fixes

* Ability to filter o2m sub type relationships based on sub type specific fields ([#1243](https://github.com/joist-orm/joist-orm/issues/1243)) ([6a60f73](https://github.com/joist-orm/joist-orm/commit/6a60f73338dfee018c852b5fba1c0a3cb57af089))

## [1.197.5](https://github.com/joist-orm/joist-orm/compare/v1.197.4...v1.197.5) (2024-09-23)


### Bug Fixes

* move setBooted to end of configureMetadata ([#1242](https://github.com/joist-orm/joist-orm/issues/1242)) ([afa58c4](https://github.com/joist-orm/joist-orm/commit/afa58c4c11f41aab6a70e084edcb33600c6f075d))

## [1.197.4](https://github.com/joist-orm/joist-orm/compare/v1.197.3...v1.197.4) (2024-09-23)


### Bug Fixes

* correctly exclude recursive relations of STI fields when configured ([#1241](https://github.com/joist-orm/joist-orm/issues/1241)) ([f347194](https://github.com/joist-orm/joist-orm/commit/f347194b204da9b3e55fe189503a1c7491e8a620))

## [1.197.3](https://github.com/joist-orm/joist-orm/compare/v1.197.2...v1.197.3) (2024-09-21)


### Bug Fixes

* Call hookUpBaseTypeAndSubTypes before fireAfterMetadatas ([#1240](https://github.com/joist-orm/joist-orm/issues/1240)) ([be539d2](https://github.com/joist-orm/joist-orm/commit/be539d2102c9dabd87d24621c122548dc5d49813))

## [1.197.2](https://github.com/joist-orm/joist-orm/compare/v1.197.1...v1.197.2) (2024-09-20)


### Bug Fixes

* Correctly handle setDefault from base type and overrides in subtypes ([#1239](https://github.com/joist-orm/joist-orm/issues/1239)) ([f7c4ea1](https://github.com/joist-orm/joist-orm/commit/f7c4ea1b7f6933f0016985cbcd94e30ee6a591e6))

## [1.197.1](https://github.com/joist-orm/joist-orm/compare/v1.197.0...v1.197.1) (2024-09-19)


### Bug Fixes

* Sync derived fields on STI types ([#1237](https://github.com/joist-orm/joist-orm/issues/1237)) ([467024c](https://github.com/joist-orm/joist-orm/commit/467024c79bc060f5d0d193c4fb05687241c79bda))

# [1.197.0](https://github.com/joist-orm/joist-orm/compare/v1.196.1...v1.197.0) (2024-09-19)


### Features

* Revert "feat: sync lens ([#1227](https://github.com/joist-orm/joist-orm/issues/1227))" - Temporary ([#1238](https://github.com/joist-orm/joist-orm/issues/1238)) ([0a89748](https://github.com/joist-orm/joist-orm/commit/0a89748ff90fcc9dc01482fac2c002ddd48db173))

## [1.196.1](https://github.com/joist-orm/joist-orm/compare/v1.196.0...v1.196.1) (2024-09-19)


### Bug Fixes

* Correct handling of setDefault on STI subtypes ([#1236](https://github.com/joist-orm/joist-orm/issues/1236)) ([e596059](https://github.com/joist-orm/joist-orm/commit/e596059acd0adf004497c0af24ba008c14665bfb))

# [1.196.0](https://github.com/joist-orm/joist-orm/compare/v1.195.1...v1.196.0) (2024-09-19)


### Features

* add codegen logger + exit code w/ strict flag ([#1228](https://github.com/joist-orm/joist-orm/issues/1228)) ([5fc3701](https://github.com/joist-orm/joist-orm/commit/5fc37014a6c7b375f6edc36711fa88ee7d87c909))

## [1.195.1](https://github.com/joist-orm/joist-orm/compare/v1.195.0...v1.195.1) (2024-09-19)


### Bug Fixes

* Add missing ??= operator. ([#1234](https://github.com/joist-orm/joist-orm/issues/1234)) ([3601b6b](https://github.com/joist-orm/joist-orm/commit/3601b6bdff6dbcca50bf8354985ea3c13fd905a7))

# [1.195.0](https://github.com/joist-orm/joist-orm/compare/v1.194.6...v1.195.0) (2024-09-18)


### Features

* sync lens ([#1227](https://github.com/joist-orm/joist-orm/issues/1227)) ([1e1043d](https://github.com/joist-orm/joist-orm/commit/1e1043da690533023dfcc771bc5330512bd0e086))

## [1.194.6](https://github.com/joist-orm/joist-orm/compare/v1.194.5...v1.194.6) (2024-09-18)


### Bug Fixes

* newTestInstance to not provide default value for required derived enum columns ([#1226](https://github.com/joist-orm/joist-orm/issues/1226)) ([264fc86](https://github.com/joist-orm/joist-orm/commit/264fc8629ae59278dd00960d62371a179bb14d26))

## [1.194.5](https://github.com/joist-orm/joist-orm/compare/v1.194.4...v1.194.5) (2024-09-17)


### Bug Fixes

* Don't put derived enums in opts. ([#1225](https://github.com/joist-orm/joist-orm/issues/1225)) ([dac31aa](https://github.com/joist-orm/joist-orm/commit/dac31aad6a9ac9a622c72389b1243cc071c68658))

## [1.194.4](https://github.com/joist-orm/joist-orm/compare/v1.194.3...v1.194.4) (2024-09-16)


### Bug Fixes

* Don't double-tap the deferred on subtypes. ([#1224](https://github.com/joist-orm/joist-orm/issues/1224)) ([4c179a1](https://github.com/joist-orm/joist-orm/commit/4c179a1e18536128dfba1e61ec2053c6a5d200e0))

## [1.194.3](https://github.com/joist-orm/joist-orm/compare/v1.194.2...v1.194.3) (2024-09-16)


### Bug Fixes

* Run defaults defined on subtypes. ([#1223](https://github.com/joist-orm/joist-orm/issues/1223)) ([430e787](https://github.com/joist-orm/joist-orm/commit/430e787bb48a75a58a23c81b0f0026ef87c2d17b))

## [1.194.2](https://github.com/joist-orm/joist-orm/compare/v1.194.1...v1.194.2) (2024-09-16)


### Bug Fixes

* Fix self-referential defaults hanging. ([#1222](https://github.com/joist-orm/joist-orm/issues/1222)) ([96b9739](https://github.com/joist-orm/joist-orm/commit/96b9739e1258ae1baf3b68004fc6a1cbfdc6ad87))

## [1.194.1](https://github.com/joist-orm/joist-orm/compare/v1.194.0...v1.194.1) (2024-09-16)


### Bug Fixes

* Fix defaults in subtypes. ([#1221](https://github.com/joist-orm/joist-orm/issues/1221)) ([0f9505b](https://github.com/joist-orm/joist-orm/commit/0f9505b94f8ed00f55296cc1580da18861066497))

# [1.194.0](https://github.com/joist-orm/joist-orm/compare/v1.193.2...v1.194.0) (2024-09-16)


### Features

* Add cross-entity default dependencies. ([#1217](https://github.com/joist-orm/joist-orm/issues/1217)) ([c66ac8c](https://github.com/joist-orm/joist-orm/commit/c66ac8c24ece4c57efbf415b944ab1fde5c77e48))

## [1.193.2](https://github.com/joist-orm/joist-orm/compare/v1.193.1...v1.193.2) (2024-09-16)


### Bug Fixes

* continue vs return on config warnings ([#1220](https://github.com/joist-orm/joist-orm/issues/1220)) ([bce0f96](https://github.com/joist-orm/joist-orm/commit/bce0f96971c20ef5eaed5b319f3c27a45d142ea2))

## [1.193.1](https://github.com/joist-orm/joist-orm/compare/v1.193.0...v1.193.1) (2024-09-15)


### Bug Fixes

* Missing kqDot within distinct/orderBy ([#1218](https://github.com/joist-orm/joist-orm/issues/1218)) ([19cc79f](https://github.com/joist-orm/joist-orm/commit/19cc79f24bfd9f6c7cde0b33eefcb026e62ea9b8))

# [1.193.0](https://github.com/joist-orm/joist-orm/compare/v1.192.0...v1.193.0) (2024-09-13)


### Features

* Add EntityManager.mode. ([#1216](https://github.com/joist-orm/joist-orm/issues/1216)) ([a1f420a](https://github.com/joist-orm/joist-orm/commit/a1f420ad8b6eeac77a4f2c8fb827098cce3ca87a))

# [1.192.0](https://github.com/joist-orm/joist-orm/compare/v1.191.2...v1.192.0) (2024-09-12)


### Features

* Allow stiType to use the enum codes. ([#1215](https://github.com/joist-orm/joist-orm/issues/1215)) ([782a557](https://github.com/joist-orm/joist-orm/commit/782a5578f677c98073e06e6284dee619bde78371))

## [1.191.2](https://github.com/joist-orm/joist-orm/compare/v1.191.1...v1.191.2) (2024-09-12)


### Bug Fixes

* Fail on invalid stiType values. ([#1214](https://github.com/joist-orm/joist-orm/issues/1214)) ([aca56fa](https://github.com/joist-orm/joist-orm/commit/aca56fa7571fe613b47f10ffb11ab9da80e61947))
* Fix regex to have only 1 group. ([#1213](https://github.com/joist-orm/joist-orm/issues/1213)) ([d3b9a89](https://github.com/joist-orm/joist-orm/commit/d3b9a8986086b009b60783e900627294725bc0a0))

## [1.191.1](https://github.com/joist-orm/joist-orm/compare/v1.191.0...v1.191.1) (2024-09-11)


### Bug Fixes

* support single quotes in scanEntityFiles ([#1208](https://github.com/joist-orm/joist-orm/issues/1208)) ([2347ee0](https://github.com/joist-orm/joist-orm/commit/2347ee0e5ea3d8dd76e68ae3f8376e9236394419))

# [1.191.0](https://github.com/joist-orm/joist-orm/compare/v1.190.1...v1.191.0) (2024-09-09)


### Features

* Pass meta to the afterMetadata callback. ([#1204](https://github.com/joist-orm/joist-orm/issues/1204)) ([3780296](https://github.com/joist-orm/joist-orm/commit/37802961f0598edcab739971b41dcf1331b55b69))

## [1.190.1](https://github.com/joist-orm/joist-orm/compare/v1.190.0...v1.190.1) (2024-09-08)


### Bug Fixes

* Allow returning Reacted entities from hasReactiveAsyncProperty. ([#1203](https://github.com/joist-orm/joist-orm/issues/1203)) ([c9df69c](https://github.com/joist-orm/joist-orm/commit/c9df69c62700687eb81307a238047761d2cdf6c2))

# [1.190.0](https://github.com/joist-orm/joist-orm/compare/v1.189.0...v1.190.0) (2024-09-05)


### Features

* index suffix _idx -> _index ([#1198](https://github.com/joist-orm/joist-orm/issues/1198)) ([99e865e](https://github.com/joist-orm/joist-orm/commit/99e865e3f3363ebd72d02d91f0cb176d991adeb3))

# [1.189.0](https://github.com/joist-orm/joist-orm/compare/v1.188.1...v1.189.0) (2024-09-04)


### Features

* index all foreign keys in many to many tables ([#1196](https://github.com/joist-orm/joist-orm/issues/1196)) ([581071f](https://github.com/joist-orm/joist-orm/commit/581071faa42ded33344bae71077d77723664ad2b)), closes [#1195](https://github.com/joist-orm/joist-orm/issues/1195)

## [1.188.1](https://github.com/joist-orm/joist-orm/compare/v1.188.0...v1.188.1) (2024-08-30)


### Bug Fixes

* Fix m2m deletes when RQFs are updated. ([#1194](https://github.com/joist-orm/joist-orm/issues/1194)) ([9b6ea70](https://github.com/joist-orm/joist-orm/commit/9b6ea7044eb2a5e6b5822d161f679a7bd529bc0f))

# [1.188.0](https://github.com/joist-orm/joist-orm/compare/v1.187.2...v1.188.0) (2024-08-22)


### Features

* add tstzrange field support ([#1188](https://github.com/joist-orm/joist-orm/issues/1188)) ([85b2aac](https://github.com/joist-orm/joist-orm/commit/85b2aac8294127e82b71086b9df476f61291a246))

## [1.187.2](https://github.com/joist-orm/joist-orm/compare/v1.187.1...v1.187.2) (2024-08-18)


### Bug Fixes

* Fix regression in lens through properties. ([#1187](https://github.com/joist-orm/joist-orm/issues/1187)) ([e7b81a2](https://github.com/joist-orm/joist-orm/commit/e7b81a24155b497d7720b8ee93cba1808c6349cd))

## [1.187.1](https://github.com/joist-orm/joist-orm/compare/v1.187.0...v1.187.1) (2024-08-18)


### Bug Fixes

* Fix lens traversal over undefined refs to collections. ([#1186](https://github.com/joist-orm/joist-orm/issues/1186)) ([2ef801f](https://github.com/joist-orm/joist-orm/commit/2ef801f7ba4ab635da5d2416560bd295d7e8c87b)), closes [#1184](https://github.com/joist-orm/joist-orm/issues/1184)

# [1.187.0](https://github.com/joist-orm/joist-orm/compare/v1.186.4...v1.187.0) (2024-08-18)


### Features

* Add field logging ([#1185](https://github.com/joist-orm/joist-orm/issues/1185)) ([1212fa1](https://github.com/joist-orm/joist-orm/commit/1212fa1397cf8c0034d25a8fe1b8fcde9190bd5f))

## [1.186.4](https://github.com/joist-orm/joist-orm/compare/v1.186.3...v1.186.4) (2024-08-10)


### Bug Fixes

* Export resetBootFlag. ([#1182](https://github.com/joist-orm/joist-orm/issues/1182)) ([afd04d9](https://github.com/joist-orm/joist-orm/commit/afd04d9740bbbfef24cda40bdb9750a833c7db6b))

## [1.186.3](https://github.com/joist-orm/joist-orm/compare/v1.186.2...v1.186.3) (2024-08-07)


### Bug Fixes

* Fix em.refresh failing after em.deletes. ([#1178](https://github.com/joist-orm/joist-orm/issues/1178)) ([2fff31d](https://github.com/joist-orm/joist-orm/commit/2fff31d1239f7481f452637dc8ffe9e6cfb10398)), closes [#1158](https://github.com/joist-orm/joist-orm/issues/1158)

## [1.186.2](https://github.com/joist-orm/joist-orm/compare/v1.186.1...v1.186.2) (2024-08-06)


### Bug Fixes

* Fix reacting to soft deletions. ([#1177](https://github.com/joist-orm/joist-orm/issues/1177)) ([51f3ffd](https://github.com/joist-orm/joist-orm/commit/51f3ffdfbd707877fad7d0b657effc8e46693710))

## [1.186.1](https://github.com/joist-orm/joist-orm/compare/v1.186.0...v1.186.1) (2024-08-05)


### Bug Fixes

* Fix parentsRecursive for new parents. ([#1175](https://github.com/joist-orm/joist-orm/issues/1175)) ([2df2c4e](https://github.com/joist-orm/joist-orm/commit/2df2c4e310c45d966d9f37fd542ac97f32947070))

# [1.186.0](https://github.com/joist-orm/joist-orm/compare/v1.185.2...v1.186.0) (2024-08-05)


### Features

* Recognize cross-field setDefault dependencies. ([#1173](https://github.com/joist-orm/joist-orm/issues/1173)) ([eb564b6](https://github.com/joist-orm/joist-orm/commit/eb564b68b97ee114821350e0dff9c10978136686)), closes [#1160](https://github.com/joist-orm/joist-orm/issues/1160)

## [1.185.2](https://github.com/joist-orm/joist-orm/compare/v1.185.1...v1.185.2) (2024-08-04)


### Bug Fixes

* Fix synchronous defaults on m2o fields. ([#1172](https://github.com/joist-orm/joist-orm/issues/1172)) ([ecd3603](https://github.com/joist-orm/joist-orm/commit/ecd3603b3c1b7d735bf90b7dcab2b4dc32fec50f))

## [1.185.1](https://github.com/joist-orm/joist-orm/compare/v1.185.0...v1.185.1) (2024-08-04)


### Bug Fixes

* Fix default detection when wrapped. ([#1171](https://github.com/joist-orm/joist-orm/issues/1171)) ([5c7d98f](https://github.com/joist-orm/joist-orm/commit/5c7d98f047db37871fd2f33034ac52084371325f))

# [1.185.0](https://github.com/joist-orm/joist-orm/compare/v1.184.0...v1.185.0) (2024-08-03)


### Features

* Auto-detect config.setDefault calls. ([#1170](https://github.com/joist-orm/joist-orm/issues/1170)) ([dfeb86a](https://github.com/joist-orm/joist-orm/commit/dfeb86ab8b2b1786f99ded4fc3535e65eb0fb8ed)), closes [#1160](https://github.com/joist-orm/joist-orm/issues/1160)

# [1.184.0](https://github.com/joist-orm/joist-orm/compare/v1.183.0...v1.184.0) (2024-08-03)


### Features

* Update EntityManager to implement AsyncDisposable. ([#773](https://github.com/joist-orm/joist-orm/issues/773)) ([38b2dbf](https://github.com/joist-orm/joist-orm/commit/38b2dbf105dbdb97cad8eaab8c440cba47f3b83c))

# [1.183.0](https://github.com/joist-orm/joist-orm/compare/v1.182.0...v1.183.0) (2024-08-03)


### Features

* Handle unset required m2os in ReactiveFields. ([#1168](https://github.com/joist-orm/joist-orm/issues/1168)) ([e203049](https://github.com/joist-orm/joist-orm/commit/e203049c4cd90dd2906a4309eba6ec0113f7ffe7))

# [1.182.0](https://github.com/joist-orm/joist-orm/compare/v1.181.3...v1.182.0) (2024-08-02)


### Features

* Native support for regex operators on find ([#1169](https://github.com/joist-orm/joist-orm/issues/1169)) ([1ce21d4](https://github.com/joist-orm/joist-orm/commit/1ce21d46952c56cc341ed65fdf8a77884196b99e))

## [1.181.3](https://github.com/joist-orm/joist-orm/compare/v1.181.2...v1.181.3) (2024-07-31)


### Bug Fixes

* Skip ReactiveReferences for recursive relations. ([#1165](https://github.com/joist-orm/joist-orm/issues/1165)) ([96c78c4](https://github.com/joist-orm/joist-orm/commit/96c78c44fbcb1e74ff7a42794fd2a265306e58ff)), closes [#1164](https://github.com/joist-orm/joist-orm/issues/1164)

## [1.181.2](https://github.com/joist-orm/joist-orm/compare/v1.181.1...v1.181.2) (2024-07-29)


### Bug Fixes

* simple pg connection string ssl handling ([#1162](https://github.com/joist-orm/joist-orm/issues/1162)) ([610ed68](https://github.com/joist-orm/joist-orm/commit/610ed6897b59cfd52080973f57bb5aa0afaa6846))

## [1.181.1](https://github.com/joist-orm/joist-orm/compare/v1.181.0...v1.181.1) (2024-07-23)


### Bug Fixes

* Support recursive relations in entityResolver. ([#1156](https://github.com/joist-orm/joist-orm/issues/1156)) ([df6d9ca](https://github.com/joist-orm/joist-orm/commit/df6d9caaa5328e2b616f249edd1eb9ca761a6a7b))

# [1.181.0](https://github.com/joist-orm/joist-orm/compare/v1.180.0...v1.181.0) (2024-07-23)


### Features

* Allow ReactiveFields to use recursive parent collections. ([#1155](https://github.com/joist-orm/joist-orm/issues/1155)) ([86c2b59](https://github.com/joist-orm/joist-orm/commit/86c2b59543b42ed68c5452aa485e0487a85113a8))

# [1.180.0](https://github.com/joist-orm/joist-orm/compare/v1.179.1...v1.180.0) (2024-07-22)


### Features

* support `NULL` values on `IN` operator ([#1152](https://github.com/joist-orm/joist-orm/issues/1152)) ([42f7a41](https://github.com/joist-orm/joist-orm/commit/42f7a412ddeb5da3cb47e875bc016f99292c5154))

## [1.179.1](https://github.com/joist-orm/joist-orm/compare/v1.179.0...v1.179.1) (2024-07-19)


### Bug Fixes

* Lightly optimize followReverseHint. ([#1153](https://github.com/joist-orm/joist-orm/issues/1153)) ([a697dc5](https://github.com/joist-orm/joist-orm/commit/a697dc5049acf761f760893d449b04d7180a28bc))

# [1.179.0](https://github.com/joist-orm/joist-orm/compare/v1.178.1...v1.179.0) (2024-07-19)


### Features

* Add loading info to ReactionLogger output. ([#1151](https://github.com/joist-orm/joist-orm/issues/1151)) ([157ad58](https://github.com/joist-orm/joist-orm/commit/157ad580ecf90563518bcd117f19174ceaa79d32))

## [1.178.1](https://github.com/joist-orm/joist-orm/compare/v1.178.0...v1.178.1) (2024-07-18)


### Bug Fixes

* Prune undefined order bys. ([8b3b460](https://github.com/joist-orm/joist-orm/commit/8b3b460a08791190429ceb33ad8aaa72bb0d8ec1))

# [1.178.0](https://github.com/joist-orm/joist-orm/compare/v1.177.0...v1.178.0) (2024-07-17)


### Features

* Add recursive o2o support. ([9dba18b](https://github.com/joist-orm/joist-orm/commit/9dba18bc9e5907d2e9f718b55f4cd4a5db70083d))

# [1.177.0](https://github.com/joist-orm/joist-orm/compare/v1.176.1...v1.177.0) (2024-07-17)


### Features

* Allow skipping recursive relations. ([77ead04](https://github.com/joist-orm/joist-orm/commit/77ead04d3c811fa267f6c7b03dea204afa754ed6))

## [1.176.1](https://github.com/joist-orm/joist-orm/compare/v1.176.0...v1.176.1) (2024-07-17)


### Bug Fixes

* Test recursive collections loaded on new entities. ([0ecf476](https://github.com/joist-orm/joist-orm/commit/0ecf476b6d8b5e3201050259874a22bbef94f86d))

# [1.176.0](https://github.com/joist-orm/joist-orm/compare/v1.175.2...v1.176.0) (2024-07-16)


### Features

* Add recursive collection support. ([a10ea61](https://github.com/joist-orm/joist-orm/commit/a10ea61055e6441fb6a51f7721ec76038e7d1ffd))

## [1.175.2](https://github.com/joist-orm/joist-orm/compare/v1.175.1...v1.175.2) (2024-07-13)


### Bug Fixes

* Fix getters calling ReactiveField.get crashing. ([c956c4d](https://github.com/joist-orm/joist-orm/commit/c956c4d4d7f1d8d0710e7f50da1f02ac36cbb72e))

## [1.175.1](https://github.com/joist-orm/joist-orm/compare/v1.175.0...v1.175.1) (2024-07-13)


### Bug Fixes

* don't include subhints from readonly reactive async props in reverseReactiveHint ([11a4d66](https://github.com/joist-orm/joist-orm/commit/11a4d669d16c47e56845ce6863fcd05ccf7bede1))

# [1.175.0](https://github.com/joist-orm/joist-orm/compare/v1.174.5...v1.175.0) (2024-07-08)


### Features

* Add reaction logging. ([5ed30e5](https://github.com/joist-orm/joist-orm/commit/5ed30e5171403ee08001f18ca408a1bd9d6a365a))

## [1.174.5](https://github.com/joist-orm/joist-orm/compare/v1.174.4...v1.174.5) (2024-07-06)


### Bug Fixes

* Avoid calling ReactiveReference.set during em.delete. ([ffcd935](https://github.com/joist-orm/joist-orm/commit/ffcd93525a7193eb503fc4e73c22646b83439831))

## [1.174.4](https://github.com/joist-orm/joist-orm/compare/v1.174.3...v1.174.4) (2024-07-06)


### Bug Fixes

* Allow ReactiveReferences to be accessed when already loaded. ([73e9355](https://github.com/joist-orm/joist-orm/commit/73e93552de35666183959f07fedfebc2d3b187fd))
* Fix RQF/RF dependencies. ([465c530](https://github.com/joist-orm/joist-orm/commit/465c5306f269652fe094531eb30068d6dd018b32))
* Use 0.0.1 for our internal skip codemod. ([2b1dd55](https://github.com/joist-orm/joist-orm/commit/2b1dd55fcc6c6c6ce9ac63085301ebc40e00a889))

## [1.174.3](https://github.com/joist-orm/joist-orm/compare/v1.174.2...v1.174.3) (2024-06-27)


### Bug Fixes

* Get message only validation errors to have the same behavior as entity specific errors ([#1123](https://github.com/joist-orm/joist-orm/issues/1123)) ([e13d0ba](https://github.com/joist-orm/joist-orm/commit/e13d0ba80e04019226e558f109af23d5ab9dc16a))

## [1.174.2](https://github.com/joist-orm/joist-orm/compare/v1.174.1...v1.174.2) (2024-06-27)


### Bug Fixes

* Bump dependencies. ([#1122](https://github.com/joist-orm/joist-orm/issues/1122)) ([1de26cd](https://github.com/joist-orm/joist-orm/commit/1de26cdd23cc2749fee46835350e9979aa714de1))

## [1.174.1](https://github.com/joist-orm/joist-orm/compare/v1.174.0...v1.174.1) (2024-06-27)


### Bug Fixes

* Bump ts-poet. ([#1054](https://github.com/joist-orm/joist-orm/issues/1054)) ([af7ca64](https://github.com/joist-orm/joist-orm/commit/af7ca6425024e9fa0f4fac26ec23cdeec59f7d27))

# [1.174.0](https://github.com/joist-orm/joist-orm/compare/v1.173.0...v1.174.0) (2024-06-25)


### Features

* Only flush changed tables ([#1117](https://github.com/joist-orm/joist-orm/issues/1117)) ([80526ff](https://github.com/joist-orm/joist-orm/commit/80526fff79a51bea694bc707e26ad7b84488bfb4))

# [1.173.0](https://github.com/joist-orm/joist-orm/compare/v1.172.0...v1.173.0) (2024-06-25)


### Features

* Add line numbers to initial factory logging output. ([#1121](https://github.com/joist-orm/joist-orm/issues/1121)) ([9bb4703](https://github.com/joist-orm/joist-orm/commit/9bb4703278fff41512a12dd25bab04365a7a20a0))

# [1.172.0](https://github.com/joist-orm/joist-orm/compare/v1.171.0...v1.172.0) (2024-06-22)


### Features

* Add factory logging ([#1120](https://github.com/joist-orm/joist-orm/issues/1120)) ([b95691d](https://github.com/joist-orm/joist-orm/commit/b95691d0811f80eb38a7de8744d15b93e06b95e2))

# [1.171.0](https://github.com/joist-orm/joist-orm/compare/v1.170.3...v1.171.0) (2024-06-15)


### Features

* bytea support ([#1115](https://github.com/joist-orm/joist-orm/issues/1115)) ([0d2acab](https://github.com/joist-orm/joist-orm/commit/0d2acabb7f049923169d7c8a76fab28e144aafe5))

## [1.170.3](https://github.com/joist-orm/joist-orm/compare/v1.170.2...v1.170.3) (2024-06-13)


### Bug Fixes

* Fix newTestInstance not using entities in arrays. ([#1112](https://github.com/joist-orm/joist-orm/issues/1112)) ([f1dbed9](https://github.com/joist-orm/joist-orm/commit/f1dbed93cde101c2405b290b798be159f657b96c))

## [1.170.2](https://github.com/joist-orm/joist-orm/compare/v1.170.1...v1.170.2) (2024-06-11)


### Bug Fixes

* Fix em.recalc against ReactiveReferences. ([#1110](https://github.com/joist-orm/joist-orm/issues/1110)) ([c01068a](https://github.com/joist-orm/joist-orm/commit/c01068ac70aa260de2395639059c12f51eff21a7))

## [1.170.1](https://github.com/joist-orm/joist-orm/compare/v1.170.0...v1.170.1) (2024-06-07)


### Bug Fixes

* Add STI subtypes as per-type filters. ([#1107](https://github.com/joist-orm/joist-orm/issues/1107)) ([3d17c48](https://github.com/joist-orm/joist-orm/commit/3d17c480af87e182b896d3e3ae56ff2804722ff9))

# [1.170.0](https://github.com/joist-orm/joist-orm/compare/v1.169.3...v1.170.0) (2024-06-06)


### Features

* Add array contains/overlaps methods to aliases. ([#1106](https://github.com/joist-orm/joist-orm/issues/1106)) ([fb5ade0](https://github.com/joist-orm/joist-orm/commit/fb5ade03b9bb446ae6cea722815448944384c291))

## [1.169.3](https://github.com/joist-orm/joist-orm/compare/v1.169.2...v1.169.3) (2024-06-04)


### Bug Fixes

* Add compile error for non-fields using newRequiredRule. ([#1105](https://github.com/joist-orm/joist-orm/issues/1105)) ([6587d5d](https://github.com/joist-orm/joist-orm/commit/6587d5d42bbf2df9c267e3357bb728cff8d10e7b))

## [1.169.2](https://github.com/joist-orm/joist-orm/compare/v1.169.1...v1.169.2) (2024-06-04)


### Bug Fixes

* **undef:** fail not defined ([#1104](https://github.com/joist-orm/joist-orm/issues/1104)) ([c1708d6](https://github.com/joist-orm/joist-orm/commit/c1708d62197d7e4ae65be74d18b1606708d77b3e))

## [1.169.1](https://github.com/joist-orm/joist-orm/compare/v1.169.0...v1.169.1) (2024-06-01)


### Bug Fixes

* Relation.id should throw NoIdErrors. ([#1103](https://github.com/joist-orm/joist-orm/issues/1103)) ([3ca184c](https://github.com/joist-orm/joist-orm/commit/3ca184cf85ab9dad9262fef01ce3bc0c59a95b68))

# [1.169.0](https://github.com/joist-orm/joist-orm/compare/v1.168.2...v1.169.0) (2024-05-30)


### Features

* Support schemas with non-deferred FKs. ([#1100](https://github.com/joist-orm/joist-orm/issues/1100)) ([3577c18](https://github.com/joist-orm/joist-orm/commit/3577c187d0b2f6ee3a5d4ad7e31849639c7477ca))

## [1.168.2](https://github.com/joist-orm/joist-orm/compare/v1.168.1...v1.168.2) (2024-05-24)


### Bug Fixes

* EntityManager.hydrate should clear dirty fields. ([#1099](https://github.com/joist-orm/joist-orm/issues/1099)) ([87beb7a](https://github.com/joist-orm/joist-orm/commit/87beb7a252f829d6ffa9ac7747f532bab269a330))

## [1.168.1](https://github.com/joist-orm/joist-orm/compare/v1.168.0...v1.168.1) (2024-05-24)


### Bug Fixes

* Fix lens finds going through overwriteExisting path. ([#1098](https://github.com/joist-orm/joist-orm/issues/1098)) ([d4f6803](https://github.com/joist-orm/joist-orm/commit/d4f6803b03e88997918de4f5c888ed1ee5e5cc77))

# [1.168.0](https://github.com/joist-orm/joist-orm/compare/v1.167.0...v1.168.0) (2024-05-19)


### Features

* m2m change detection follow up ([#1046](https://github.com/joist-orm/joist-orm/issues/1046)) ([ed4be3d](https://github.com/joist-orm/joist-orm/commit/ed4be3d0e5347a9fdca386a42a9bb9045b6714d6))

# [1.167.0](https://github.com/joist-orm/joist-orm/compare/v1.166.0...v1.167.0) (2024-05-18)


### Features

* Allow filtering m2o by CTI subtypes. ([#1093](https://github.com/joist-orm/joist-orm/issues/1093)) ([1a67c5a](https://github.com/joist-orm/joist-orm/commit/1a67c5a4b17e94742e0737705ad15413a3769bf3))

# [1.166.0](https://github.com/joist-orm/joist-orm/compare/v1.165.2...v1.166.0) (2024-05-18)


### Features

* Support filtering by poly components ([#1092](https://github.com/joist-orm/joist-orm/issues/1092)) ([2f76e62](https://github.com/joist-orm/joist-orm/commit/2f76e62793f609a4ed0cf8e40d04d54f65469778))

## [1.165.2](https://github.com/joist-orm/joist-orm/compare/v1.165.1...v1.165.2) (2024-05-16)


### Bug Fixes

* Bump pg-structure for supabase fix. ([#1090](https://github.com/joist-orm/joist-orm/issues/1090)) ([cad46bd](https://github.com/joist-orm/joist-orm/commit/cad46bdde6461eabbc3a60bf1a9565b1e4765a7a))

## [1.165.1](https://github.com/joist-orm/joist-orm/compare/v1.165.0...v1.165.1) (2024-05-14)


### Bug Fixes

* Fix alias.search with an empty string. ([#1087](https://github.com/joist-orm/joist-orm/issues/1087)) ([e96f150](https://github.com/joist-orm/joist-orm/commit/e96f1504d845385365c45552f9be2f4d4ddbffb8))

# [1.165.0](https://github.com/joist-orm/joist-orm/compare/v1.164.6...v1.165.0) (2024-05-14)


### Features

* Add isNewEntity type guard function ([#1086](https://github.com/joist-orm/joist-orm/issues/1086)) ([b1a3578](https://github.com/joist-orm/joist-orm/commit/b1a35782a1ab6caeabad93cfd40bf2869404d5bf))

## [1.164.6](https://github.com/joist-orm/joist-orm/compare/v1.164.5...v1.164.6) (2024-05-14)


### Bug Fixes

* Fix em.find on m2m with new entities ([#1085](https://github.com/joist-orm/joist-orm/issues/1085)) ([c022bbf](https://github.com/joist-orm/joist-orm/commit/c022bbfacf2e785b5e78f0523ef538a7dbdd76fb))

## [1.164.5](https://github.com/joist-orm/joist-orm/compare/v1.164.4...v1.164.5) (2024-05-09)


### Bug Fixes

* Fix filtering on the wrong subtype. ([#1082](https://github.com/joist-orm/joist-orm/issues/1082)) ([2e22bc2](https://github.com/joist-orm/joist-orm/commit/2e22bc20bce68345e9e2c8fbdbd35b1fa07ffa35))

## [1.164.4](https://github.com/joist-orm/joist-orm/compare/v1.164.3...v1.164.4) (2024-05-09)


### Bug Fixes

* Fix failing on hints that use ReactiveReferences. ([#1081](https://github.com/joist-orm/joist-orm/issues/1081)) ([3e1dfc9](https://github.com/joist-orm/joist-orm/commit/3e1dfc9175cf7712f2f94cbe1ed059e615e8d05f))

## [1.164.3](https://github.com/joist-orm/joist-orm/compare/v1.164.2...v1.164.3) (2024-05-09)


### Bug Fixes

* Add tests for previous reactive hint fix, with more fixes. ([#1080](https://github.com/joist-orm/joist-orm/issues/1080)) ([3185237](https://github.com/joist-orm/joist-orm/commit/31852378b5cf2536172906044cdc5a4316725d72))

## [1.164.2](https://github.com/joist-orm/joist-orm/compare/v1.164.1...v1.164.2) (2024-05-08)


### Bug Fixes

* Fix reacting to subtype-only relations. ([#1079](https://github.com/joist-orm/joist-orm/issues/1079)) ([368a9be](https://github.com/joist-orm/joist-orm/commit/368a9be65372fc64fd2480579cefd0bc77273be3))

## [1.164.1](https://github.com/joist-orm/joist-orm/compare/v1.164.0...v1.164.1) (2024-05-07)


### Bug Fixes

* Use Promise.all in toJSON iteration. ([#1077](https://github.com/joist-orm/joist-orm/issues/1077)) ([9deb08d](https://github.com/joist-orm/joist-orm/commit/9deb08dcb09465b3445bd07675190b27c1276057))

# [1.164.0](https://github.com/joist-orm/joist-orm/compare/v1.163.8...v1.164.0) (2024-05-07)


### Features

* Support multiple separate order bys. ([#1076](https://github.com/joist-orm/joist-orm/issues/1076)) ([7f949db](https://github.com/joist-orm/joist-orm/commit/7f949dbe4182514c2ac87db219524ecf745b3e8f)), closes [#1074](https://github.com/joist-orm/joist-orm/issues/1074)

## [1.163.8](https://github.com/joist-orm/joist-orm/compare/v1.163.7...v1.163.8) (2024-05-07)


### Bug Fixes

* Prevent setting over properties. ([#1075](https://github.com/joist-orm/joist-orm/issues/1075)) ([e1c9351](https://github.com/joist-orm/joist-orm/commit/e1c93516d6627175dcf085d06ce19569d2b339c8))

## [1.163.7](https://github.com/joist-orm/joist-orm/compare/v1.163.6...v1.163.7) (2024-05-04)


### Bug Fixes

* Fix id alias columns typed as numbers. ([#1072](https://github.com/joist-orm/joist-orm/issues/1072)) ([8d71cce](https://github.com/joist-orm/joist-orm/commit/8d71ccee43cdcd72c2a6e2d549d82f3a73cc3e33))

## [1.163.6](https://github.com/joist-orm/joist-orm/compare/v1.163.5...v1.163.6) (2024-05-03)


### Bug Fixes

* Allow skipping useExisting. ([#1070](https://github.com/joist-orm/joist-orm/issues/1070)) ([7085178](https://github.com/joist-orm/joist-orm/commit/7085178f2a73f0ce8659bf1070256e12a5ce6ebf)), closes [#1066](https://github.com/joist-orm/joist-orm/issues/1066)

## [1.163.5](https://github.com/joist-orm/joist-orm/compare/v1.163.4...v1.163.5) (2024-05-03)


### Bug Fixes

* Fix lens over unloaded AsyncProperties. ([#1069](https://github.com/joist-orm/joist-orm/issues/1069)) ([a96582f](https://github.com/joist-orm/joist-orm/commit/a96582f4a491b9b68791d351c6559ad5cfe6afb6))

## [1.163.4](https://github.com/joist-orm/joist-orm/compare/v1.163.3...v1.163.4) (2024-05-03)


### Bug Fixes

* Fix factories defaulting tests when sinon is used. ([#1068](https://github.com/joist-orm/joist-orm/issues/1068)) ([4651d07](https://github.com/joist-orm/joist-orm/commit/4651d07523a17aa6cfdca8e169e434bf78060593))

## [1.163.3](https://github.com/joist-orm/joist-orm/compare/v1.163.2...v1.163.3) (2024-05-02)


### Bug Fixes

* More explicitly reject invalid ids. ([#1067](https://github.com/joist-orm/joist-orm/issues/1067)) ([5371fb7](https://github.com/joist-orm/joist-orm/commit/5371fb7ad655729d41273efc0ff22f4790250c9b))

## [1.163.2](https://github.com/joist-orm/joist-orm/compare/v1.163.1...v1.163.2) (2024-05-02)


### Bug Fixes

* Fix toMatchEntity against readonly arrays. ([#1065](https://github.com/joist-orm/joist-orm/issues/1065)) ([6c3571a](https://github.com/joist-orm/joist-orm/commit/6c3571a71cae9959fe36b138435d3d8c47311c15))

## [1.163.1](https://github.com/joist-orm/joist-orm/compare/v1.163.0...v1.163.1) (2024-05-02)


### Bug Fixes

* Fix transformed properties assigned to incorrect entities. ([#1064](https://github.com/joist-orm/joist-orm/issues/1064)) ([15126e9](https://github.com/joist-orm/joist-orm/commit/15126e9e2212135bdb4ce49993a94c6ddd1b9139))

# [1.163.0](https://github.com/joist-orm/joist-orm/compare/v1.162.2...v1.163.0) (2024-04-30)


### Features

* Integrated temporal-polyfill as optional replacement for legacy `Date` ([#1053](https://github.com/joist-orm/joist-orm/issues/1053)) ([5bc812d](https://github.com/joist-orm/joist-orm/commit/5bc812db8427495cf108e69a158f0095c6e6316d))

## [1.162.2](https://github.com/joist-orm/joist-orm/compare/v1.162.1...v1.162.2) (2024-04-28)


### Bug Fixes

* Fix preloading with a string[] hint. ([#1063](https://github.com/joist-orm/joist-orm/issues/1063)) ([7c66d48](https://github.com/joist-orm/joist-orm/commit/7c66d48cdb3c3687d25e2101cec3bfa3792ad65e))

## [1.162.1](https://github.com/joist-orm/joist-orm/compare/v1.162.0...v1.162.1) (2024-04-27)


### Bug Fixes

* Fix NPE is new isNotLoaded. ([#1062](https://github.com/joist-orm/joist-orm/issues/1062)) ([b014277](https://github.com/joist-orm/joist-orm/commit/b014277360b73c0e368993b59d132e17e97c6691))

# [1.162.0](https://github.com/joist-orm/joist-orm/compare/v1.161.2...v1.162.0) (2024-04-27)


### Features

* Add joist-transform-properties to make custom properties lazy ([#1061](https://github.com/joist-orm/joist-orm/issues/1061)) ([3b57406](https://github.com/joist-orm/joist-orm/commit/3b57406b3785ce96709e67ed5c1f5282cb4c42bc))

## [1.161.2](https://github.com/joist-orm/joist-orm/compare/v1.161.1...v1.161.2) (2024-04-26)


### Bug Fixes

* Optimize loadLens to not rely on exceptions. ([#1060](https://github.com/joist-orm/joist-orm/issues/1060)) ([1b01fe7](https://github.com/joist-orm/joist-orm/commit/1b01fe78b12252074fcb3687ba015b187b86128d))

## [1.161.1](https://github.com/joist-orm/joist-orm/compare/v1.161.0...v1.161.1) (2024-04-26)


### Bug Fixes

* Fix using the wrong meta to inject CTE tables. ([#1059](https://github.com/joist-orm/joist-orm/issues/1059)) ([d195654](https://github.com/joist-orm/joist-orm/commit/d19565443d8c6258cd3b7b4a73dc0df3901b767a))

# [1.161.0](https://github.com/joist-orm/joist-orm/compare/v1.160.4...v1.161.0) (2024-04-25)


### Features

* Add findWithNewOrChanged. ([#1057](https://github.com/joist-orm/joist-orm/issues/1057)) ([cedadae](https://github.com/joist-orm/joist-orm/commit/cedadae9306889b1886604198263bb4e40691399)), closes [#1055](https://github.com/joist-orm/joist-orm/issues/1055)

## [1.160.4](https://github.com/joist-orm/joist-orm/compare/v1.160.3...v1.160.4) (2024-04-21)


### Bug Fixes

* Support ids in toJSON ([#1052](https://github.com/joist-orm/joist-orm/issues/1052)) ([c17f72d](https://github.com/joist-orm/joist-orm/commit/c17f72dfec4208f674e97c68c028a0a0c16fbc28))

## [1.160.3](https://github.com/joist-orm/joist-orm/compare/v1.160.2...v1.160.3) (2024-04-20)


### Bug Fixes

* Fix reactive poly against properties ([#1051](https://github.com/joist-orm/joist-orm/issues/1051)) ([ad2ae2c](https://github.com/joist-orm/joist-orm/commit/ad2ae2ce54e15be343dc5288131c63ab06720869))

## [1.160.2](https://github.com/joist-orm/joist-orm/compare/v1.160.1...v1.160.2) (2024-04-19)


### Bug Fixes

* Fix toJSON treating keys as hints ([#1050](https://github.com/joist-orm/joist-orm/issues/1050)) ([2a5cadc](https://github.com/joist-orm/joist-orm/commit/2a5cadc86c52ed7ca08089f407effef7e862beba))

## [1.160.1](https://github.com/joist-orm/joist-orm/compare/v1.160.0...v1.160.1) (2024-04-19)


### Bug Fixes

* Fix querying against CustomSerde values. ([#1049](https://github.com/joist-orm/joist-orm/issues/1049)) ([e2ba761](https://github.com/joist-orm/joist-orm/commit/e2ba761f20ed973ecd8e34e60de7ae2824794987)), closes [#1048](https://github.com/joist-orm/joist-orm/issues/1048)

# [1.160.0](https://github.com/joist-orm/joist-orm/compare/v1.159.0...v1.160.0) (2024-04-19)


### Features

* Support reactivity through polys ([#1047](https://github.com/joist-orm/joist-orm/issues/1047)) ([2b36980](https://github.com/joist-orm/joist-orm/commit/2b369800c7ca9a342e07711be54dcf944c4896a7))

# [1.159.0](https://github.com/joist-orm/joist-orm/compare/v1.158.0...v1.159.0) (2024-04-19)


### Features

* Add config.afterMetadata hook. ([#1045](https://github.com/joist-orm/joist-orm/issues/1045)) ([1be5324](https://github.com/joist-orm/joist-orm/commit/1be5324b670bfd6e6d7eea02525a92519dcf6ce1))

# [1.158.0](https://github.com/joist-orm/joist-orm/compare/v1.157.0...v1.158.0) (2024-04-19)


### Features

* Teach toJSON to create custom payloads. ([#1043](https://github.com/joist-orm/joist-orm/issues/1043)) ([77d4708](https://github.com/joist-orm/joist-orm/commit/77d470856998eb86f372c675781c4e56d41614c7))

# [1.157.0](https://github.com/joist-orm/joist-orm/compare/v1.156.1...v1.157.0) (2024-04-17)


### Features

* Trigger hooks on m2m relation changes ([#1042](https://github.com/joist-orm/joist-orm/issues/1042)) ([90dcb1c](https://github.com/joist-orm/joist-orm/commit/90dcb1c9cbc2bde442acd77a45b28899af6c8fca))

## [1.156.1](https://github.com/joist-orm/joist-orm/compare/v1.156.0...v1.156.1) (2024-04-17)


### Bug Fixes

* Add TS 5.x const to entity populate methods. ([#790](https://github.com/joist-orm/joist-orm/issues/790)) ([f892242](https://github.com/joist-orm/joist-orm/commit/f892242e00c432419211ddfa0d7d94db9f828628))

# [1.156.0](https://github.com/joist-orm/joist-orm/compare/v1.155.6...v1.156.0) (2024-04-15)


### Features

* Add a seed function ([#1041](https://github.com/joist-orm/joist-orm/issues/1041)) ([1a1d3b2](https://github.com/joist-orm/joist-orm/commit/1a1d3b2953314c59764cc171d7c23b0b5b1e11dc))

## [1.155.6](https://github.com/joist-orm/joist-orm/compare/v1.155.5...v1.155.6) (2024-04-14)


### Bug Fixes

* Plugins should use a peer dependency. ([#1040](https://github.com/joist-orm/joist-orm/issues/1040)) ([98ee91b](https://github.com/joist-orm/joist-orm/commit/98ee91ba2380688db672272c905f461e89b70a20)), closes [#1036](https://github.com/joist-orm/joist-orm/issues/1036)

## [1.155.5](https://github.com/joist-orm/joist-orm/compare/v1.155.4...v1.155.5) (2024-04-14)


### Bug Fixes

* Try use yarn to set versions. ([#1039](https://github.com/joist-orm/joist-orm/issues/1039)) ([50d369d](https://github.com/joist-orm/joist-orm/commit/50d369d9623791b3698f36f019eed19e7d05c5b6))

## [1.155.4](https://github.com/joist-orm/joist-orm/compare/v1.155.3...v1.155.4) (2024-04-14)


### Bug Fixes

* Fix hot reloading in Next 14 ([#1038](https://github.com/joist-orm/joist-orm/issues/1038)) ([fc91e71](https://github.com/joist-orm/joist-orm/commit/fc91e719fb147f28ea4b348588f549318a5de60d))

## [1.155.3](https://github.com/joist-orm/joist-orm/compare/v1.155.2...v1.155.3) (2024-04-14)


### Bug Fixes

* Detect running in NextJS. ([#1037](https://github.com/joist-orm/joist-orm/issues/1037)) ([4009adf](https://github.com/joist-orm/joist-orm/commit/4009adf5063af6bd5569a1f8abab030fbd6b0bf0))

## [1.155.2](https://github.com/joist-orm/joist-orm/compare/v1.155.1...v1.155.2) (2024-04-10)


### Bug Fixes

* directly import entities from metadata.ts, support top level await ([#1032](https://github.com/joist-orm/joist-orm/issues/1032)) ([bbee996](https://github.com/joist-orm/joist-orm/commit/bbee996c1421afd959153c0518917569e41207df))

## [1.155.1](https://github.com/joist-orm/joist-orm/compare/v1.155.0...v1.155.1) (2024-04-10)


### Bug Fixes

* additional missing type imports ([#1030](https://github.com/joist-orm/joist-orm/issues/1030)) ([1881631](https://github.com/joist-orm/joist-orm/commit/1881631187d96d3a9e645a79865678790b94f8e8))

# [1.155.0](https://github.com/joist-orm/joist-orm/compare/v1.154.1...v1.155.0) (2024-04-10)


### Features

* ensure codegen output meets `verbatimModuleSyntax` expectations ([#1029](https://github.com/joist-orm/joist-orm/issues/1029)) ([56ca1a1](https://github.com/joist-orm/joist-orm/commit/56ca1a1763961e15eee56e434bc04377745ae991))

## [1.154.1](https://github.com/joist-orm/joist-orm/compare/v1.154.0...v1.154.1) (2024-04-10)


### Bug Fixes

* Bump ts-poet. ([#1028](https://github.com/joist-orm/joist-orm/issues/1028)) ([817c162](https://github.com/joist-orm/joist-orm/commit/817c162eec72a2dc63a9039c5bfa369972d6ea91))

# [1.154.0](https://github.com/joist-orm/joist-orm/compare/v1.153.2...v1.154.0) (2024-04-10)


### Features

* esm codegen ([#1025](https://github.com/joist-orm/joist-orm/issues/1025)) ([dd86298](https://github.com/joist-orm/joist-orm/commit/dd8629817bc3ca0f0c751209df70ea2fc7598c1d))

## [1.153.2](https://github.com/joist-orm/joist-orm/compare/v1.153.1...v1.153.2) (2024-04-06)


### Bug Fixes

* Restore maybeGetConstructor export. ([#1023](https://github.com/joist-orm/joist-orm/issues/1023)) ([de538cd](https://github.com/joist-orm/joist-orm/commit/de538cdc006722d4dc1755aa84ddea49fadb724b))

## [1.153.1](https://github.com/joist-orm/joist-orm/compare/v1.153.0...v1.153.1) (2024-04-06)


### Bug Fixes

* Update setDefault to allow returning a Reacted entity. ([#1022](https://github.com/joist-orm/joist-orm/issues/1022)) ([8ffcb18](https://github.com/joist-orm/joist-orm/commit/8ffcb18bd5e68bed66205ed9f9aab594e7ed5f61)), closes [#1018](https://github.com/joist-orm/joist-orm/issues/1018)

# [1.153.0](https://github.com/joist-orm/joist-orm/compare/v1.152.3...v1.153.0) (2024-04-06)


### Features

* Add hasConfigDefault flag for optional types ([#1021](https://github.com/joist-orm/joist-orm/issues/1021)) ([142c56e](https://github.com/joist-orm/joist-orm/commit/142c56e9ac05e3c4f3b8fbf4b8ee22dd83734e2b))

## [1.152.3](https://github.com/joist-orm/joist-orm/compare/v1.152.2...v1.152.3) (2024-04-06)


### Bug Fixes

* Fix columns shared across CTI subtypes. ([#1020](https://github.com/joist-orm/joist-orm/issues/1020)) ([340e0c6](https://github.com/joist-orm/joist-orm/commit/340e0c6c2982fc5120ca10c5aa3bdd7f5c56e47b)), closes [#1019](https://github.com/joist-orm/joist-orm/issues/1019)

## [1.152.2](https://github.com/joist-orm/joist-orm/compare/v1.152.1...v1.152.2) (2024-04-04)


### Bug Fixes

* Updated populate to never load set reactive fields to avoid overly eagerly loading large amounts of data ([#1015](https://github.com/joist-orm/joist-orm/issues/1015)) ([2c6e37d](https://github.com/joist-orm/joist-orm/commit/2c6e37dd9c7448e442038ac8aebfa0ee4941b502))

## [1.152.1](https://github.com/joist-orm/joist-orm/compare/v1.152.0...v1.152.1) (2024-04-02)


### Bug Fixes

* added support for ReactiveGetter to Reactable and entityResolver ([#1011](https://github.com/joist-orm/joist-orm/issues/1011)) ([f9634e5](https://github.com/joist-orm/joist-orm/commit/f9634e531eca1b29bc7574124fb90c6e7458588f))

# [1.152.0](https://github.com/joist-orm/joist-orm/compare/v1.151.14...v1.152.0) (2024-04-02)


### Features

* Add ReactiveGetters. ([#1008](https://github.com/joist-orm/joist-orm/issues/1008)) ([4341f94](https://github.com/joist-orm/joist-orm/commit/4341f942a708194453d5fa0b3a1f9d08fcdb1921))

## [1.151.14](https://github.com/joist-orm/joist-orm/compare/v1.151.13...v1.151.14) (2024-04-01)


### Bug Fixes

* Fix polys being too strict on the subtype matching. ([#1006](https://github.com/joist-orm/joist-orm/issues/1006)) ([5c2d9da](https://github.com/joist-orm/joist-orm/commit/5c2d9daf89ed4adcfcbae39f7198dc0b090521dc))

## [1.151.13](https://github.com/joist-orm/joist-orm/compare/v1.151.12...v1.151.13) (2024-03-31)


### Bug Fixes

* Fix setDefault calls made from subtypes. ([#1005](https://github.com/joist-orm/joist-orm/issues/1005)) ([e57c0a9](https://github.com/joist-orm/joist-orm/commit/e57c0a9395fef1d16f15037901b97dee504a64a3))

## [1.151.12](https://github.com/joist-orm/joist-orm/compare/v1.151.11...v1.151.12) (2024-03-30)


### Bug Fixes

* Rename EntityOrmField to InstanceData ([#1003](https://github.com/joist-orm/joist-orm/issues/1003)) ([d6f819c](https://github.com/joist-orm/joist-orm/commit/d6f819c92beb0873e9a59ed73102d740aca43392))

## [1.151.11](https://github.com/joist-orm/joist-orm/compare/v1.151.10...v1.151.11) (2024-03-30)


### Bug Fixes

* Preserve changed/new state for beforeCommit w/RQFs. ([#1002](https://github.com/joist-orm/joist-orm/issues/1002)) ([e877926](https://github.com/joist-orm/joist-orm/commit/e877926b703282b0b2e0174710a4076bb6a50d4e))

## [1.151.10](https://github.com/joist-orm/joist-orm/compare/v1.151.9...v1.151.10) (2024-03-29)


### Bug Fixes

* Fix workspaces foreach in releae. ([eb1b667](https://github.com/joist-orm/joist-orm/commit/eb1b6675527502dc8c2e0aa527404cbffa4d9c7c))

## [1.151.9](https://github.com/joist-orm/joist-orm/compare/v1.151.8...v1.151.9) (2024-03-29)


### Bug Fixes

* Fixed setSyncDefaults handling of async derived fields ([#1000](https://github.com/joist-orm/joist-orm/issues/1000)) ([13a7284](https://github.com/joist-orm/joist-orm/commit/13a7284fa50172fe2500620b985a7b44d593f857))

## [1.151.8](https://github.com/joist-orm/joist-orm/compare/v1.151.7...v1.151.8) (2024-03-29)


### Bug Fixes

* Fix ReactiveQueryFields on not-null columns ([#997](https://github.com/joist-orm/joist-orm/issues/997)) ([6a9e00a](https://github.com/joist-orm/joist-orm/commit/6a9e00ae5b353b7153ca8cfee14626f64b2c3eaa))

## [1.151.7](https://github.com/joist-orm/joist-orm/compare/v1.151.6...v1.151.7) (2024-03-29)


### Bug Fixes

* Let entityResolver pick up base type relations. ([#996](https://github.com/joist-orm/joist-orm/issues/996)) ([bf49a5c](https://github.com/joist-orm/joist-orm/commit/bf49a5ca77075da3e657d54fa56ed2391ee079f1))

## [1.151.6](https://github.com/joist-orm/joist-orm/compare/v1.151.5...v1.151.6) (2024-03-27)


### Bug Fixes

* Restore soft-deleting filters on CTI base types. ([#995](https://github.com/joist-orm/joist-orm/issues/995)) ([36e9251](https://github.com/joist-orm/joist-orm/commit/36e9251002d12eedbeb5960070cd59e519f2d192))

## [1.151.5](https://github.com/joist-orm/joist-orm/compare/v1.151.4...v1.151.5) (2024-03-27)


### Bug Fixes

* Fix subtypes not running reactive rules. ([#994](https://github.com/joist-orm/joist-orm/issues/994)) ([5053b0f](https://github.com/joist-orm/joist-orm/commit/5053b0f14e567f544cf76425ed0bacd441a53a9e))

## [1.151.4](https://github.com/joist-orm/joist-orm/compare/v1.151.3...v1.151.4) (2024-03-26)


### Bug Fixes

* Fix em.load getting wrong STI type. ([#993](https://github.com/joist-orm/joist-orm/issues/993)) ([2fd633e](https://github.com/joist-orm/joist-orm/commit/2fd633e0458c41daef9c37f76bdc5bb939071d99))

## [1.151.3](https://github.com/joist-orm/joist-orm/compare/v1.151.2...v1.151.3) (2024-03-26)


### Bug Fixes

* Fix em.find deletedAt filtering on STI subtypes. ([#992](https://github.com/joist-orm/joist-orm/issues/992)) ([ce9668a](https://github.com/joist-orm/joist-orm/commit/ce9668a5f7a32fe9ea735ff8c9bed577665d8a5a))

## [1.151.2](https://github.com/joist-orm/joist-orm/compare/v1.151.1...v1.151.2) (2024-03-26)


### Bug Fixes

* Move ReactiveRelation config into relations. ([#991](https://github.com/joist-orm/joist-orm/issues/991)) ([7afab05](https://github.com/joist-orm/joist-orm/commit/7afab059e4a430116cae9467720e9b980db6d505))

## [1.151.1](https://github.com/joist-orm/joist-orm/compare/v1.151.0...v1.151.1) (2024-03-26)


### Bug Fixes

* Support polys that point to STI subtypes. ([#988](https://github.com/joist-orm/joist-orm/issues/988)) ([400b8de](https://github.com/joist-orm/joist-orm/commit/400b8de0288902981e1d313cb3319c5725a99bfa))

# [1.151.0](https://github.com/joist-orm/joist-orm/compare/v1.150.2...v1.151.0) (2024-03-23)


### Features

* Rename PersistedAsyncRefernece to ReactiveReference. ([#986](https://github.com/joist-orm/joist-orm/issues/986)) ([963d484](https://github.com/joist-orm/joist-orm/commit/963d484bd58eb67965bc03d9d2865f6eafd5a8c9))

## [1.150.2](https://github.com/joist-orm/joist-orm/compare/v1.150.1...v1.150.2) (2024-03-23)


### Bug Fixes

* Remove legacy getEm method. ([#985](https://github.com/joist-orm/joist-orm/issues/985)) ([e5d52a5](https://github.com/joist-orm/joist-orm/commit/e5d52a57568bc2c0b5b32ab4f7fa63aa294924d2))

## [1.150.1](https://github.com/joist-orm/joist-orm/compare/v1.150.0...v1.150.1) (2024-03-23)


### Bug Fixes

* Simplify constructors. ([#984](https://github.com/joist-orm/joist-orm/issues/984)) ([577b0a5](https://github.com/joist-orm/joist-orm/commit/577b0a5d6099906845e1b24252cd206630576a61))

# [1.150.0](https://github.com/joist-orm/joist-orm/compare/v1.149.4...v1.150.0) (2024-03-23)


### Features

* Unify database/config default handling. ([#983](https://github.com/joist-orm/joist-orm/issues/983)) ([a5e35e4](https://github.com/joist-orm/joist-orm/commit/a5e35e40826cc359b1093d6cdf726527b46f70da))

## [1.149.4](https://github.com/joist-orm/joist-orm/compare/v1.149.3...v1.149.4) (2024-03-23)


### Bug Fixes

* Fix STI config warnings ([#982](https://github.com/joist-orm/joist-orm/issues/982)) ([1ebd9be](https://github.com/joist-orm/joist-orm/commit/1ebd9be5e30803e67d8345eaaaedd05b46a679b1))

## [1.149.3](https://github.com/joist-orm/joist-orm/compare/v1.149.2...v1.149.3) (2024-03-22)


### Bug Fixes

* Fix STI m2m relations ([#981](https://github.com/joist-orm/joist-orm/issues/981)) ([e7e2569](https://github.com/joist-orm/joist-orm/commit/e7e25696988a59fec6b566bd13bc068f3c217a3d))

## [1.149.2](https://github.com/joist-orm/joist-orm/compare/v1.149.1...v1.149.2) (2024-03-21)


### Bug Fixes

* Factories shouldn't fill in fields w/defaults. ([#979](https://github.com/joist-orm/joist-orm/issues/979)) ([59f382b](https://github.com/joist-orm/joist-orm/commit/59f382be3a3bf1a63ff74251b80d9bdaea9a6215))

## [1.149.1](https://github.com/joist-orm/joist-orm/compare/v1.149.0...v1.149.1) (2024-03-21)


### Bug Fixes

* Fix not loading o2os in createOrUpdatePartial. ([#977](https://github.com/joist-orm/joist-orm/issues/977)) ([440658f](https://github.com/joist-orm/joist-orm/commit/440658f646669cc9ed1c9d7afcb8c86004ad50a9))

# [1.149.0](https://github.com/joist-orm/joist-orm/compare/v1.148.0...v1.149.0) (2024-03-21)


### Features

* Add ReactiveQueryField ([#976](https://github.com/joist-orm/joist-orm/issues/976)) ([9f3b2dd](https://github.com/joist-orm/joist-orm/commit/9f3b2ddbc82c244d2dafdf786154bd11003f20ca))

# [1.148.0](https://github.com/joist-orm/joist-orm/compare/v1.147.0...v1.148.0) (2024-03-14)


### Features

* Reorganize codegen files ([#970](https://github.com/joist-orm/joist-orm/issues/970)) ([b5bf745](https://github.com/joist-orm/joist-orm/commit/b5bf745faa29e4edfc6663423d0693766fd15188))

# [1.147.0](https://github.com/joist-orm/joist-orm/compare/v1.146.0...v1.147.0) (2024-03-10)


### Features

* Support reactive enum fields. ([#968](https://github.com/joist-orm/joist-orm/issues/968)) ([25d2b1c](https://github.com/joist-orm/joist-orm/commit/25d2b1c4266f3a42cce1781a38aada8a30b83f80))

# [1.146.0](https://github.com/joist-orm/joist-orm/compare/v1.145.0...v1.146.0) (2024-03-03)


### Features

* Add Single Table Inheritance support ([#966](https://github.com/joist-orm/joist-orm/issues/966)) ([8019e5b](https://github.com/joist-orm/joist-orm/commit/8019e5b5e2683e8b1f2c9033912ec83cbc80d2fb))

# [1.145.0](https://github.com/joist-orm/joist-orm/compare/v1.144.10...v1.145.0) (2024-02-26)


### Features

* Support filtering on other columns. ([#964](https://github.com/joist-orm/joist-orm/issues/964)) ([6f53fb6](https://github.com/joist-orm/joist-orm/commit/6f53fb61767329e992701c9db559adea8b31ccea)), closes [#793](https://github.com/joist-orm/joist-orm/issues/793)

## [1.144.10](https://github.com/joist-orm/joist-orm/compare/v1.144.9...v1.144.10) (2024-02-15)


### Bug Fixes

* Avoid failing on cross-schema triggers. ([#960](https://github.com/joist-orm/joist-orm/issues/960)) ([2bb17f0](https://github.com/joist-orm/joist-orm/commit/2bb17f01ab86599fcf7f8074c264e58f2359f3d3))

## [1.144.9](https://github.com/joist-orm/joist-orm/compare/v1.144.8...v1.144.9) (2024-02-15)


### Bug Fixes

* Fix findByCode type to be just string. ([#959](https://github.com/joist-orm/joist-orm/issues/959)) ([15d51a2](https://github.com/joist-orm/joist-orm/commit/15d51a2f4c0a1ab87b955537a6c6db5a4d1dd706))

## [1.144.8](https://github.com/joist-orm/joist-orm/compare/v1.144.7...v1.144.8) (2024-02-13)


### Bug Fixes

* Bump pg-structure for security warning. ([#958](https://github.com/joist-orm/joist-orm/issues/958)) ([260dee7](https://github.com/joist-orm/joist-orm/commit/260dee77a7701ab443347e338d26009b6cea9b97))

## [1.144.7](https://github.com/joist-orm/joist-orm/compare/v1.144.6...v1.144.7) (2024-02-13)


### Bug Fixes

* nin any -> all operator in buildKnexQuery ([#957](https://github.com/joist-orm/joist-orm/issues/957)) ([4cf71cc](https://github.com/joist-orm/joist-orm/commit/4cf71ccc71883adcdf1495f76f2135b035302e0d))

## [1.144.6](https://github.com/joist-orm/joist-orm/compare/v1.144.5...v1.144.6) (2024-01-25)


### Bug Fixes

* Fixed async method when load is called in a loop with different args ([#955](https://github.com/joist-orm/joist-orm/issues/955)) ([877a363](https://github.com/joist-orm/joist-orm/commit/877a3638dbbd45c3428f2487c4b0c227aea33424))

## [1.144.5](https://github.com/joist-orm/joist-orm/compare/v1.144.4...v1.144.5) (2024-01-25)


### Bug Fixes

* fixed AsyncMethod not working when its first argument is an entity ([#954](https://github.com/joist-orm/joist-orm/issues/954)) ([65703f6](https://github.com/joist-orm/joist-orm/commit/65703f69526c2732189eee7e9e3391559c28ed2c))

## [1.144.4](https://github.com/joist-orm/joist-orm/compare/v1.144.3...v1.144.4) (2024-01-23)


### Bug Fixes

* Implement not null checks on polymorphic references. ([#953](https://github.com/joist-orm/joist-orm/issues/953)) ([be50769](https://github.com/joist-orm/joist-orm/commit/be50769beb677993bbdb3e0d191c9b10402fe3ef))

## [1.144.3](https://github.com/joist-orm/joist-orm/compare/v1.144.2...v1.144.3) (2024-01-22)


### Bug Fixes

* Fix em.find on poly with untagged ids. ([#951](https://github.com/joist-orm/joist-orm/issues/951)) ([73be96d](https://github.com/joist-orm/joist-orm/commit/73be96d875229489e0b35aa2c67c90be07f95866))

## [1.144.2](https://github.com/joist-orm/joist-orm/compare/v1.144.1...v1.144.2) (2024-01-22)


### Bug Fixes

* Fix setter param names cannot be JS keywords. ([#950](https://github.com/joist-orm/joist-orm/issues/950)) ([9623130](https://github.com/joist-orm/joist-orm/commit/9623130549e5eaa87671005b0bacead0efc6158a))

## [1.144.1](https://github.com/joist-orm/joist-orm/compare/v1.144.0...v1.144.1) (2024-01-21)


### Bug Fixes

* Fix small scaffolding nits ([#949](https://github.com/joist-orm/joist-orm/issues/949)) ([770dd68](https://github.com/joist-orm/joist-orm/commit/770dd689ac140610e50c0c388b96d901b157da39))

# [1.144.0](https://github.com/joist-orm/joist-orm/compare/v1.143.3...v1.144.0) (2024-01-21)


### Features

* Fix graphql test scaffolding ([#948](https://github.com/joist-orm/joist-orm/issues/948)) ([6f24f56](https://github.com/joist-orm/joist-orm/commit/6f24f5690b62b3a61cec158f39d93683bc5e2338))

## [1.143.3](https://github.com/joist-orm/joist-orm/compare/v1.143.2...v1.143.3) (2024-01-16)


### Bug Fixes

* Fix em.recalc for synchronous fields. ([#946](https://github.com/joist-orm/joist-orm/issues/946)) ([0b874a9](https://github.com/joist-orm/joist-orm/commit/0b874a9729eb6e29011c1aa02e623f6b592c3fb6))

## [1.143.2](https://github.com/joist-orm/joist-orm/compare/v1.143.1...v1.143.2) (2024-01-16)


### Bug Fixes

* Fix m2m over reactivity ([#945](https://github.com/joist-orm/joist-orm/issues/945)) ([3950674](https://github.com/joist-orm/joist-orm/commit/3950674f5a38bd1ea3bf27974d82ee4b7620e634))

## [1.143.1](https://github.com/joist-orm/joist-orm/compare/v1.143.0...v1.143.1) (2024-01-15)


### Bug Fixes

* Add fast-glob dependency. ([#943](https://github.com/joist-orm/joist-orm/issues/943)) ([98fcc20](https://github.com/joist-orm/joist-orm/commit/98fcc208fb3c6059ff33645dc0d7e82fef13420b))

# [1.143.0](https://github.com/joist-orm/joist-orm/compare/v1.142.2...v1.143.0) (2024-01-15)


### Features

* Rename hasPersistedAsyncProperty to hasReactiveField ([#942](https://github.com/joist-orm/joist-orm/issues/942)) ([7294754](https://github.com/joist-orm/joist-orm/commit/7294754ec20eef06e38a7d8a95e5343b56d56fda))

## [1.142.2](https://github.com/joist-orm/joist-orm/compare/v1.142.1...v1.142.2) (2024-01-12)


### Bug Fixes

* Add resetBootFlag for projects that hot reload. ([#941](https://github.com/joist-orm/joist-orm/issues/941)) ([5727804](https://github.com/joist-orm/joist-orm/commit/5727804a1a32ee5355999056fbe82718dc300178))

## [1.142.1](https://github.com/joist-orm/joist-orm/compare/v1.142.0...v1.142.1) (2024-01-12)


### Bug Fixes

* Add better error message when adding invalid m2m rows. ([#940](https://github.com/joist-orm/joist-orm/issues/940)) ([a409667](https://github.com/joist-orm/joist-orm/commit/a409667bc9309e45004da1a0c24d491e5eabc8f8))

# [1.142.0](https://github.com/joist-orm/joist-orm/compare/v1.141.0...v1.142.0) (2024-01-10)


### Features

* Add 'search' operator that translates to ilikes. ([#938](https://github.com/joist-orm/joist-orm/issues/938)) ([510d5fb](https://github.com/joist-orm/joist-orm/commit/510d5fbe5d477ab4fd36b734151b6e5f1c961bd1))

# [1.141.0](https://github.com/joist-orm/joist-orm/compare/v1.140.1...v1.141.0) (2024-01-07)


### Features

* Add em.recalc, simplify em.touch. ([#933](https://github.com/joist-orm/joist-orm/issues/933)) ([5bb92b3](https://github.com/joist-orm/joist-orm/commit/5bb92b39079485d8babb8b8049d3b452aafb178e)), closes [#4](https://github.com/joist-orm/joist-orm/issues/4)

## [1.140.1](https://github.com/joist-orm/joist-orm/compare/v1.140.0...v1.140.1) (2024-01-05)


### Bug Fixes

* IncrementalCollectionOp on soft-deletable ([#931](https://github.com/joist-orm/joist-orm/issues/931)) ([91e638a](https://github.com/joist-orm/joist-orm/commit/91e638a7787b1434280c1756cbc669e8debdc0b7))

# [1.140.0](https://github.com/joist-orm/joist-orm/compare/v1.139.2...v1.140.0) (2024-01-04)


### Features

* Ensure that rules/hooks aren't added post-boot. ([#930](https://github.com/joist-orm/joist-orm/issues/930)) ([50a5a54](https://github.com/joist-orm/joist-orm/commit/50a5a54c4c8e49af3ecd8ad1239b26c386a635f7)), closes [#928](https://github.com/joist-orm/joist-orm/issues/928)

## [1.139.2](https://github.com/joist-orm/joist-orm/compare/v1.139.1...v1.139.2) (2024-01-04)


### Bug Fixes

* Change m2m.get ensureNotDeleted to ignore pending. ([#929](https://github.com/joist-orm/joist-orm/issues/929)) ([768d3e7](https://github.com/joist-orm/joist-orm/commit/768d3e73833701398d5f94101652950672f9483a))

## [1.139.1](https://github.com/joist-orm/joist-orm/compare/v1.139.0...v1.139.1) (2024-01-03)


### Bug Fixes

* Fix transient m2m rows on transient entities. ([#927](https://github.com/joist-orm/joist-orm/issues/927)) ([bd68181](https://github.com/joist-orm/joist-orm/commit/bd68181fb0f3de11c4db71cab826f5d9a2bcc147))

# [1.139.0](https://github.com/joist-orm/joist-orm/compare/v1.138.1...v1.139.0) (2024-01-01)


### Features

* Scaffold test files. ([#926](https://github.com/joist-orm/joist-orm/issues/926)) ([b7c6cd6](https://github.com/joist-orm/joist-orm/commit/b7c6cd6d14100b4fa6f030e966bd5b36e5107453))

## [1.138.1](https://github.com/joist-orm/joist-orm/compare/v1.138.0...v1.138.1) (2024-01-01)


### Bug Fixes

* Skip AllEnumDetails if no enums. ([b3b1905](https://github.com/joist-orm/joist-orm/commit/b3b190512a403363a2d96cb5e7b89dfb235b9e65))

# [1.138.0](https://github.com/joist-orm/joist-orm/compare/v1.137.0...v1.138.0) (2023-12-29)


### Features

* support baseClass polymorphics ([#919](https://github.com/joist-orm/joist-orm/issues/919)) ([424976f](https://github.com/joist-orm/joist-orm/commit/424976fd76363ef61f7572da8eca3ee66ac81063))

# [1.137.0](https://github.com/joist-orm/joist-orm/compare/v1.136.0...v1.137.0) (2023-12-27)


### Features

* Use the latest pg-types for a timestamp perf fix. ([#921](https://github.com/joist-orm/joist-orm/issues/921)) ([51cff3d](https://github.com/joist-orm/joist-orm/commit/51cff3dfd8745770b144312434ac675d51966550))

# [1.136.0](https://github.com/joist-orm/joist-orm/compare/v1.135.0...v1.136.0) (2023-12-26)


### Features

* Optimize em.hydrate performance ([#920](https://github.com/joist-orm/joist-orm/issues/920)) ([1efd026](https://github.com/joist-orm/joist-orm/commit/1efd026208e01775b8d732b37d0f0b0acb433be0))

# [1.135.0](https://github.com/joist-orm/joist-orm/compare/v1.134.2...v1.135.0) (2023-12-20)


### Features

* Add AllEnumDetails to graphql codegen ([#918](https://github.com/joist-orm/joist-orm/issues/918)) ([0c342da](https://github.com/joist-orm/joist-orm/commit/0c342dad37a38dbcd426d9dda4416d5e89e3831b))

## [1.134.2](https://github.com/joist-orm/joist-orm/compare/v1.134.1...v1.134.2) (2023-12-17)


### Bug Fixes

* Remove hardcoded db type for enums. ([#917](https://github.com/joist-orm/joist-orm/issues/917)) ([1f63bc0](https://github.com/joist-orm/joist-orm/commit/1f63bc0146deb985a62ba5fb936f6d5bc315b2e3))

## [1.134.1](https://github.com/joist-orm/joist-orm/compare/v1.134.0...v1.134.1) (2023-12-16)


### Bug Fixes

* Fix enum defaults. ([#916](https://github.com/joist-orm/joist-orm/issues/916)) ([6a5dfd1](https://github.com/joist-orm/joist-orm/commit/6a5dfd1e71e89a8b775893fb2844d2d52774d75d))

# [1.134.0](https://github.com/joist-orm/joist-orm/compare/v1.133.0...v1.134.0) (2023-12-16)


### Features

* Support uuid-based enum tables. ([#914](https://github.com/joist-orm/joist-orm/issues/914)) ([769a488](https://github.com/joist-orm/joist-orm/commit/769a488a63250accbe69730b580086a2d5cd62f5))

# [1.133.0](https://github.com/joist-orm/joist-orm/compare/v1.132.0...v1.133.0) (2023-12-16)


### Features

* Add config.setDefault API ([#913](https://github.com/joist-orm/joist-orm/issues/913)) ([d68e753](https://github.com/joist-orm/joist-orm/commit/d68e753ba39de25fed293234f13de25e5f3e385f))

# [1.132.0](https://github.com/joist-orm/joist-orm/compare/v1.131.1...v1.132.0) (2023-12-12)


### Features

* Really check if relations are loaded for CustomCollection and CustomReference ([#911](https://github.com/joist-orm/joist-orm/issues/911)) ([55b3a6b](https://github.com/joist-orm/joist-orm/commit/55b3a6b7d2d987d356c9bddd528316400dd8387d))

## [1.131.1](https://github.com/joist-orm/joist-orm/compare/v1.131.0...v1.131.1) (2023-12-09)


### Bug Fixes

* Array columns were not deeply dirty checked. ([#907](https://github.com/joist-orm/joist-orm/issues/907)) ([f684b83](https://github.com/joist-orm/joist-orm/commit/f684b83b72c455edccc2fb5ec3fd3b32250030f5))

# [1.131.0](https://github.com/joist-orm/joist-orm/compare/v1.130.0...v1.131.0) (2023-12-08)


### Features

* Add getField. ([#906](https://github.com/joist-orm/joist-orm/issues/906)) ([9e80f2b](https://github.com/joist-orm/joist-orm/commit/9e80f2b336210d4ff22e8bccf1195444424f6fe8))

# [1.130.0](https://github.com/joist-orm/joist-orm/compare/v1.129.5...v1.130.0) (2023-12-08)


### Features

* Allow filtering on foreign key is boolean. ([#905](https://github.com/joist-orm/joist-orm/issues/905)) ([766bf53](https://github.com/joist-orm/joist-orm/commit/766bf535386ee7585bacff97e6322d2d65faa633))

## [1.129.5](https://github.com/joist-orm/joist-orm/compare/v1.129.4...v1.129.5) (2023-11-30)


### Bug Fixes

* fixed ordering of beforeDelete and cleanupOnEntityDeleted so relations will always remain until all beforeDeletes are called ([#902](https://github.com/joist-orm/joist-orm/issues/902)) ([19f85d2](https://github.com/joist-orm/joist-orm/commit/19f85d25619e1bde3f845afef5b205ee24447ddc))

## [1.129.4](https://github.com/joist-orm/joist-orm/compare/v1.129.3...v1.129.4) (2023-11-30)


### Bug Fixes

* Fix reactions recalculating after graph mutations. ([#900](https://github.com/joist-orm/joist-orm/issues/900)) ([1f62cbf](https://github.com/joist-orm/joist-orm/commit/1f62cbfd9aa32cd2e593c74190f14d66a1d2f087))

## [1.129.3](https://github.com/joist-orm/joist-orm/compare/v1.129.2...v1.129.3) (2023-11-28)


### Bug Fixes

* Fix findOrCreate with unloaded & unset m2o references. ([#899](https://github.com/joist-orm/joist-orm/issues/899)) ([0a64ae5](https://github.com/joist-orm/joist-orm/commit/0a64ae5bac6a17bba5d27e1c0b12ee8fda36a963))

## [1.129.2](https://github.com/joist-orm/joist-orm/compare/v1.129.1...v1.129.2) (2023-11-24)


### Bug Fixes

* Fix findOrCreate with undefined. ([#896](https://github.com/joist-orm/joist-orm/issues/896)) ([d4d135b](https://github.com/joist-orm/joist-orm/commit/d4d135b4a6da5011ac1c72a8a605caa713cdbd3d))

## [1.129.1](https://github.com/joist-orm/joist-orm/compare/v1.129.0...v1.129.1) (2023-11-24)


### Bug Fixes

* Include field name in reference errors. ([#894](https://github.com/joist-orm/joist-orm/issues/894)) ([67c6523](https://github.com/joist-orm/joist-orm/commit/67c6523cabc6afa7a7688e97769a965fb393d9c0))

# [1.129.0](https://github.com/joist-orm/joist-orm/compare/v1.128.2...v1.129.0) (2023-11-22)


### Features

* Upgrade factories to handle multi-path graphs. ([#893](https://github.com/joist-orm/joist-orm/issues/893)) ([83eb33e](https://github.com/joist-orm/joist-orm/commit/83eb33e267130cbd4e874603e356a92780381bd8))

## [1.128.2](https://github.com/joist-orm/joist-orm/compare/v1.128.1...v1.128.2) (2023-11-21)


### Bug Fixes

* Fix findOrCreate with citext not caching correctly. ([#892](https://github.com/joist-orm/joist-orm/issues/892)) ([9a08386](https://github.com/joist-orm/joist-orm/commit/9a08386e98fba6ecd5fc55e9b460252e33397b4d))

## [1.128.1](https://github.com/joist-orm/joist-orm/compare/v1.128.0...v1.128.1) (2023-11-21)


### Bug Fixes

* Rename useSingleton to useExisting. ([#891](https://github.com/joist-orm/joist-orm/issues/891)) ([e948819](https://github.com/joist-orm/joist-orm/commit/e94881904eabfb3586eea1509ce85c367a35d68e))

# [1.128.0](https://github.com/joist-orm/joist-orm/compare/v1.127.0...v1.128.0) (2023-11-21)


### Features

* Add citext support to findOrCreate. ([#890](https://github.com/joist-orm/joist-orm/issues/890)) ([550a1ad](https://github.com/joist-orm/joist-orm/commit/550a1ad3385f6cc3f0c14b41672d241247e2b402))

# [1.127.0](https://github.com/joist-orm/joist-orm/compare/v1.126.1...v1.127.0) (2023-11-20)


### Features

* Add useSingleton for factories ([#889](https://github.com/joist-orm/joist-orm/issues/889)) ([5eef52c](https://github.com/joist-orm/joist-orm/commit/5eef52c90a98f5e80da147fbcae12e6b5b40c88d))

## [1.126.1](https://github.com/joist-orm/joist-orm/compare/v1.126.0...v1.126.1) (2023-11-19)


### Bug Fixes

* Fix cascade deletes declared in base classes. ([#887](https://github.com/joist-orm/joist-orm/issues/887)) ([fc31a71](https://github.com/joist-orm/joist-orm/commit/fc31a7111d9c3e7a3d107c14970923b5b6b21fd8))

# [1.126.0](https://github.com/joist-orm/joist-orm/compare/v1.125.0...v1.126.0) (2023-11-19)


### Features

* Batch updates. ([#886](https://github.com/joist-orm/joist-orm/issues/886)) ([e07d897](https://github.com/joist-orm/joist-orm/commit/e07d8973ccde8dc7fe7fe39d131c2829426676f6)), closes [#415](https://github.com/joist-orm/joist-orm/issues/415)

# [1.125.0](https://github.com/joist-orm/joist-orm/compare/v1.124.10...v1.125.0) (2023-11-19)


### Features

* Allow validation rules to return string arrays ([#885](https://github.com/joist-orm/joist-orm/issues/885)) ([abfdc6f](https://github.com/joist-orm/joist-orm/commit/abfdc6fa6379f9381b18d15d79d139f3e3301e4d))

## [1.124.10](https://github.com/joist-orm/joist-orm/compare/v1.124.9...v1.124.10) (2023-11-19)


### Bug Fixes

* Don't populate relations if there are args. ([#883](https://github.com/joist-orm/joist-orm/issues/883)) ([a595edb](https://github.com/joist-orm/joist-orm/commit/a595edb189cc43866fb5a2e1f05efa150eb27230))

## [1.124.9](https://github.com/joist-orm/joist-orm/compare/v1.124.8...v1.124.9) (2023-11-18)


### Bug Fixes

* Fix post-flush toString of created-then-deleted entities. ([#882](https://github.com/joist-orm/joist-orm/issues/882)) ([f98e3bc](https://github.com/joist-orm/joist-orm/commit/f98e3bcdb15bca4737c0926b97b9293d3eb8499a))

## [1.124.8](https://github.com/joist-orm/joist-orm/compare/v1.124.7...v1.124.8) (2023-11-18)


### Bug Fixes

* Fix imports for differnet entityDirectories. ([#881](https://github.com/joist-orm/joist-orm/issues/881)) ([15a5247](https://github.com/joist-orm/joist-orm/commit/15a52471570cb9adb9b84bd6cb7add7b64ee4c2a)), closes [#880](https://github.com/joist-orm/joist-orm/issues/880)

## [1.124.7](https://github.com/joist-orm/joist-orm/compare/v1.124.6...v1.124.7) (2023-11-18)


### Bug Fixes

* Fix async methods that have load called twice. ([#879](https://github.com/joist-orm/joist-orm/issues/879)) ([190e61d](https://github.com/joist-orm/joist-orm/commit/190e61d41ff20bde76f0efe02c1bcfe04cc37d35))

## [1.124.6](https://github.com/joist-orm/joist-orm/compare/v1.124.5...v1.124.6) (2023-11-18)


### Bug Fixes

* Keep the pound symbol for assigned-but-new entities. ([#878](https://github.com/joist-orm/joist-orm/issues/878)) ([558cfca](https://github.com/joist-orm/joist-orm/commit/558cfca0af8af200424b91ad76d3cf752ee34dfc))

## [1.124.5](https://github.com/joist-orm/joist-orm/compare/v1.124.4...v1.124.5) (2023-11-17)


### Bug Fixes

* Fix PersistedAsyncReferenceImpl.load not returning a promise. ([#877](https://github.com/joist-orm/joist-orm/issues/877)) ([079eb58](https://github.com/joist-orm/joist-orm/commit/079eb58584cfd7d01a6f41338cce8881968f7ecb))

## [1.124.4](https://github.com/joist-orm/joist-orm/compare/v1.124.3...v1.124.4) (2023-11-14)


### Bug Fixes

* Fix em.find with empty poly lists. ([#872](https://github.com/joist-orm/joist-orm/issues/872)) ([c5a57eb](https://github.com/joist-orm/joist-orm/commit/c5a57eb50a7b6f1712ba2be2d852b01667f5c4ee))

## [1.124.3](https://github.com/joist-orm/joist-orm/compare/v1.124.2...v1.124.3) (2023-11-14)


### Bug Fixes

* Fix and/or precedence in where clauses. ([#871](https://github.com/joist-orm/joist-orm/issues/871)) ([deea649](https://github.com/joist-orm/joist-orm/commit/deea64989f0a6948bc25ac1ab2e6b233a41beeaf))

## [1.124.2](https://github.com/joist-orm/joist-orm/compare/v1.124.1...v1.124.2) (2023-11-14)


### Bug Fixes

* Implement the per-application Entity in codegen. ([#870](https://github.com/joist-orm/joist-orm/issues/870)) ([b226fcf](https://github.com/joist-orm/joist-orm/commit/b226fcf94b21bd6576ae225cccaccc2984527627))

## [1.124.1](https://github.com/joist-orm/joist-orm/compare/v1.124.0...v1.124.1) (2023-11-14)


### Bug Fixes

* Fix base classes getting rules from sub classes. ([#869](https://github.com/joist-orm/joist-orm/issues/869)) ([4938bd5](https://github.com/joist-orm/joist-orm/commit/4938bd5e38d3502e6853a55fc79a5c8e2a7b684c))

# [1.124.0](https://github.com/joist-orm/joist-orm/compare/v1.123.1...v1.124.0) (2023-11-13)


### Features

* Allow accessing ids in derived fields. ([#868](https://github.com/joist-orm/joist-orm/issues/868)) ([b5b88c3](https://github.com/joist-orm/joist-orm/commit/b5b88c321db6cc5737fd21d4333cc565cc2d09e5)), closes [#808](https://github.com/joist-orm/joist-orm/issues/808)

## [1.123.1](https://github.com/joist-orm/joist-orm/compare/v1.123.0...v1.123.1) (2023-11-12)


### Bug Fixes

* Fix querying on child null columns ([#866](https://github.com/joist-orm/joist-orm/issues/866)) ([b3019e6](https://github.com/joist-orm/joist-orm/commit/b3019e6dddb943eefc061c5249776493ce48d12e))

# [1.123.0](https://github.com/joist-orm/joist-orm/compare/v1.122.0...v1.123.0) (2023-11-11)


### Features

* Make codegen relations lazy. ([#860](https://github.com/joist-orm/joist-orm/issues/860)) ([3a7b6f0](https://github.com/joist-orm/joist-orm/commit/3a7b6f032eb45e1283f8967e96e8167a9dad1746)), closes [#836](https://github.com/joist-orm/joist-orm/issues/836)

# [1.122.0](https://github.com/joist-orm/joist-orm/compare/v1.121.1...v1.122.0) (2023-11-11)


### Features

* Add a Zod/json-schema config for joist-config.json file ([#864](https://github.com/joist-orm/joist-orm/issues/864)) ([ff6d308](https://github.com/joist-orm/joist-orm/commit/ff6d30894fea99d188c8beb4df786ed1ad5d20df))

## [1.121.1](https://github.com/joist-orm/joist-orm/compare/v1.121.0...v1.121.1) (2023-11-09)


### Bug Fixes

* **isPolyHelper:** allow pasing in `unknown` types to discern whether or not it's a valid type ([#859](https://github.com/joist-orm/joist-orm/issues/859)) ([f72c53c](https://github.com/joist-orm/joist-orm/commit/f72c53c10f154f7e25b6ede50b37aeb9950a502c))

# [1.121.0](https://github.com/joist-orm/joist-orm/compare/v1.120.1...v1.121.0) (2023-11-08)


### Features

* Remove EntityMetadataTyped. ([#857](https://github.com/joist-orm/joist-orm/issues/857)) ([30a838b](https://github.com/joist-orm/joist-orm/commit/30a838b8df3075a4224a9c6ebe47ed9f7ef5dae2))

## [1.120.1](https://github.com/joist-orm/joist-orm/compare/v1.120.0...v1.120.1) (2023-11-08)


### Bug Fixes

* Fix PersistedAsyncReference always loading its full load hint. ([#854](https://github.com/joist-orm/joist-orm/issues/854)) ([9df758a](https://github.com/joist-orm/joist-orm/commit/9df758a3bfa0ec6bd6232d0784cd39ceadd62ca8))

# [1.120.0](https://github.com/joist-orm/joist-orm/compare/v1.119.1...v1.120.0) (2023-11-07)


### Features

* Reroll per-application Entity ([#851](https://github.com/joist-orm/joist-orm/issues/851)) ([4a0a360](https://github.com/joist-orm/joist-orm/commit/4a0a360ee016b33823355ddc7629928f460ea36f))

## [1.119.1](https://github.com/joist-orm/joist-orm/compare/v1.119.0...v1.119.1) (2023-11-06)


### Reverts

* Revert "feat: Generate an app-specific Entity type. (#849)" (#850) ([8964378](https://github.com/joist-orm/joist-orm/commit/89643784a086729a2aefd8570c3039b126e0f3ee)), closes [#849](https://github.com/joist-orm/joist-orm/issues/849) [#850](https://github.com/joist-orm/joist-orm/issues/850)

# [1.119.0](https://github.com/joist-orm/joist-orm/compare/v1.118.1...v1.119.0) (2023-11-06)


### Features

* Generate an app-specific Entity type. ([#849](https://github.com/joist-orm/joist-orm/issues/849)) ([2850d27](https://github.com/joist-orm/joist-orm/commit/2850d27922aee2eca332f7cf72c52935d77f1636))

## [1.118.1](https://github.com/joist-orm/joist-orm/compare/v1.118.0...v1.118.1) (2023-11-06)


### Bug Fixes

* Fix NPE in entityResolver. ([#848](https://github.com/joist-orm/joist-orm/issues/848)) ([316b347](https://github.com/joist-orm/joist-orm/commit/316b3475c9efaeafb8bedaedc752c4074168be3f))

# [1.118.0](https://github.com/joist-orm/joist-orm/compare/v1.117.0...v1.118.0) (2023-11-05)


### Features

* Initial support for number-typed id fields ([#846](https://github.com/joist-orm/joist-orm/issues/846)) ([97b01ef](https://github.com/joist-orm/joist-orm/commit/97b01efdc942cba8543e7c7307bd31eddbe6cf46))

# [1.117.0](https://github.com/joist-orm/joist-orm/compare/v1.116.2...v1.117.0) (2023-11-04)


### Features

* Add em.find preloading ([#845](https://github.com/joist-orm/joist-orm/issues/845)) ([d2c4f97](https://github.com/joist-orm/joist-orm/commit/d2c4f975fde34f2c3be8128335f3a7462a4c95fc))

## [1.116.2](https://github.com/joist-orm/joist-orm/compare/v1.116.1...v1.116.2) (2023-11-04)


### Bug Fixes

* Fix plugins publishing. ([f43f390](https://github.com/joist-orm/joist-orm/commit/f43f3907c2c71f5936e3cb5e6544aa1ac5f592dc))

## [1.116.1](https://github.com/joist-orm/joist-orm/compare/v1.116.0...v1.116.1) (2023-11-03)


### Bug Fixes

* Ensure built-in relations are refreshed before custom. ([#844](https://github.com/joist-orm/joist-orm/issues/844)) ([33e21a6](https://github.com/joist-orm/joist-orm/commit/33e21a621dbc38be106e71c47d5b1ce0d1a398e5))

# [1.116.0](https://github.com/joist-orm/joist-orm/compare/v1.115.0...v1.116.0) (2023-11-03)


### Features

* add beforeCommit ([#842](https://github.com/joist-orm/joist-orm/issues/842)) ([10d71fa](https://github.com/joist-orm/joist-orm/commit/10d71faf557eae48145b25daaa22718a79ffa4d7))

# [1.115.0](https://github.com/joist-orm/joist-orm/compare/v1.114.1...v1.115.0) (2023-11-03)


### Features

* Add an experimental joins plugin ([#843](https://github.com/joist-orm/joist-orm/issues/843)) ([63a81af](https://github.com/joist-orm/joist-orm/commit/63a81af9150b9cf366fa9d5ba3c4fcdebdfd25bc))

## [1.114.1](https://github.com/joist-orm/joist-orm/compare/v1.114.0...v1.114.1) (2023-11-03)


### Bug Fixes

* complex filters on cti of parent fields do not filter to correct table ([#837](https://github.com/joist-orm/joist-orm/issues/837)) ([6716c8b](https://github.com/joist-orm/joist-orm/commit/6716c8be8099e50909d360e1d1bc644d68b41ed4))

# [1.114.0](https://github.com/joist-orm/joist-orm/compare/v1.113.0...v1.114.0) (2023-10-27)


### Features

* Bump node, other deps ([#838](https://github.com/joist-orm/joist-orm/issues/838)) ([354a195](https://github.com/joist-orm/joist-orm/commit/354a1958f718cfd88c5a27124cdff8b32bd9f5df))

# [1.113.0](https://github.com/joist-orm/joist-orm/compare/v1.112.4...v1.113.0) (2023-10-19)


### Features

* Rename AsyncMethod.get to call. ([#830](https://github.com/joist-orm/joist-orm/issues/830)) ([c12dda0](https://github.com/joist-orm/joist-orm/commit/c12dda084e22c9e62836283ae66cc69e3e1adc5b))

## [1.112.4](https://github.com/joist-orm/joist-orm/compare/v1.112.3...v1.112.4) (2023-10-17)


### Bug Fixes

* Batch large inserts. ([#833](https://github.com/joist-orm/joist-orm/issues/833)) ([b07047a](https://github.com/joist-orm/joist-orm/commit/b07047a662f4d7ac9943c63e29ed91d76b1d4bf0))

## [1.112.3](https://github.com/joist-orm/joist-orm/compare/v1.112.2...v1.112.3) (2023-10-13)


### Bug Fixes

* Fix AsyncMethods w/no params looking like AsyncProperties. ([#829](https://github.com/joist-orm/joist-orm/issues/829)) ([8353c63](https://github.com/joist-orm/joist-orm/commit/8353c63d6de609cf4a1024ea2bdd851aa93fd1a1))

## [1.112.2](https://github.com/joist-orm/joist-orm/compare/v1.112.1...v1.112.2) (2023-10-09)


### Bug Fixes

* added support for o2o relations to sql load lens ([#828](https://github.com/joist-orm/joist-orm/issues/828)) ([499a5ad](https://github.com/joist-orm/joist-orm/commit/499a5ad1ecd9f746f6e681fa4ead6ded23376abd))

## [1.112.1](https://github.com/joist-orm/joist-orm/compare/v1.112.0...v1.112.1) (2023-10-07)


### Bug Fixes

* Reuse PrimitiveSerde instead of introducing a new one. ([#827](https://github.com/joist-orm/joist-orm/issues/827)) ([61bdcd1](https://github.com/joist-orm/joist-orm/commit/61bdcd107779da9636389de6830c3e07cf71aaac))

# [1.112.0](https://github.com/joist-orm/joist-orm/compare/v1.111.3...v1.112.0) (2023-10-07)


### Features

* Support string array columns. ([#826](https://github.com/joist-orm/joist-orm/issues/826)) ([add9bc5](https://github.com/joist-orm/joist-orm/commit/add9bc560b8ee4efcf44ab00b3dc2422bdae2d5f))

## [1.111.3](https://github.com/joist-orm/joist-orm/compare/v1.111.2...v1.111.3) (2023-10-07)


### Bug Fixes

* Always quote columns that are camel cased. ([#824](https://github.com/joist-orm/joist-orm/issues/824)) ([1c11513](https://github.com/joist-orm/joist-orm/commit/1c1151337b0956bdae40d40be6304dd78abf2a98))

## [1.111.2](https://github.com/joist-orm/joist-orm/compare/v1.111.1...v1.111.2) (2023-10-07)


### Bug Fixes

* Fix some missing keyword wrapping. ([#823](https://github.com/joist-orm/joist-orm/issues/823)) ([5827aa3](https://github.com/joist-orm/joist-orm/commit/5827aa3f2bad45e51ef90761b928bc51c4b53cef))

## [1.111.1](https://github.com/joist-orm/joist-orm/compare/v1.111.0...v1.111.1) (2023-10-05)


### Bug Fixes

* Add nlike/nilike to ValueGraphQLFilter. ([#821](https://github.com/joist-orm/joist-orm/issues/821)) ([d6a80db](https://github.com/joist-orm/joist-orm/commit/d6a80db2b7de84808fa8d2da96ee319e84c30088))

# [1.111.0](https://github.com/joist-orm/joist-orm/compare/v1.110.0...v1.111.0) (2023-10-05)


### Features

* Allow non-field properties in createOrUpdatePartial. ([#820](https://github.com/joist-orm/joist-orm/issues/820)) ([3eead2b](https://github.com/joist-orm/joist-orm/commit/3eead2bd6a9c7366ce50f9f7a391309aeef536ce))

# [1.110.0](https://github.com/joist-orm/joist-orm/compare/v1.109.1...v1.110.0) (2023-10-05)


### Features

* Add nlike/nilike operators. ([#819](https://github.com/joist-orm/joist-orm/issues/819)) ([baa41f4](https://github.com/joist-orm/joist-orm/commit/baa41f4aeb7bf3e9837f8d7859d99a2ec44e0785))

## [1.109.1](https://github.com/joist-orm/joist-orm/compare/v1.109.0...v1.109.1) (2023-10-04)


### Bug Fixes

* Fix double quoting in buildKnexQuery ([#817](https://github.com/joist-orm/joist-orm/issues/817)) ([1ebbbf1](https://github.com/joist-orm/joist-orm/commit/1ebbbf1a48f8b833b97219dc4de96e833f6e884d))

# [1.109.0](https://github.com/joist-orm/joist-orm/compare/v1.108.11...v1.109.0) (2023-10-03)


### Features

* batch assignNewIds ([#814](https://github.com/joist-orm/joist-orm/issues/814)) ([46feeff](https://github.com/joist-orm/joist-orm/commit/46feeff3801ea21a55dce7afea0a8144749b4e4e))

## [1.108.11](https://github.com/joist-orm/joist-orm/compare/v1.108.10...v1.108.11) (2023-10-03)


### Bug Fixes

* Add more keywords. ([#812](https://github.com/joist-orm/joist-orm/issues/812)) ([7c72fa3](https://github.com/joist-orm/joist-orm/commit/7c72fa3f6073b5bda34e8358513c33d5196eb7c6))

## [1.108.10](https://github.com/joist-orm/joist-orm/compare/v1.108.9...v1.108.10) (2023-09-30)


### Bug Fixes

* Quote abbreviations that are keywords. ([#810](https://github.com/joist-orm/joist-orm/issues/810)) ([b3f891b](https://github.com/joist-orm/joist-orm/commit/b3f891b25b7ca2ea034120a796d7127f2a324dbc))

## [1.108.9](https://github.com/joist-orm/joist-orm/compare/v1.108.8...v1.108.9) (2023-09-29)


### Bug Fixes

* Fix NPE in toMatchEntity on null references. ([#809](https://github.com/joist-orm/joist-orm/issues/809)) ([c7d525e](https://github.com/joist-orm/joist-orm/commit/c7d525e6934d772064db12c35ccf261a140f5103))

## [1.108.8](https://github.com/joist-orm/joist-orm/compare/v1.108.7...v1.108.8) (2023-09-27)


### Bug Fixes

* Avoid invoking AsyncMethod fns during populate. ([#805](https://github.com/joist-orm/joist-orm/issues/805)) ([12e42d4](https://github.com/joist-orm/joist-orm/commit/12e42d41a63ea83ae00ded7486dcb0497a484b72))

## [1.108.7](https://github.com/joist-orm/joist-orm/compare/v1.108.6...v1.108.7) (2023-09-25)


### Bug Fixes

* Allow calling AsyncMethod.get on DeepNew entities. ([#804](https://github.com/joist-orm/joist-orm/issues/804)) ([44544e0](https://github.com/joist-orm/joist-orm/commit/44544e02f0d3d50f0292656f2bb582196f25e506))

## [1.108.6](https://github.com/joist-orm/joist-orm/compare/v1.108.5...v1.108.6) (2023-09-25)


### Bug Fixes

* Fix toMatchEntity failing with pojos. ([#798](https://github.com/joist-orm/joist-orm/issues/798)) ([770ff98](https://github.com/joist-orm/joist-orm/commit/770ff983ded16742657f01bc48ecb51ede930788))

## [1.108.5](https://github.com/joist-orm/joist-orm/compare/v1.108.4...v1.108.5) (2023-09-24)


### Bug Fixes

* Fix em.find batching with native enums. ([#803](https://github.com/joist-orm/joist-orm/issues/803)) ([1289a73](https://github.com/joist-orm/joist-orm/commit/1289a73f7fa1db8b90050f9c77b4918913978f97))

## [1.108.4](https://github.com/joist-orm/joist-orm/compare/v1.108.3...v1.108.4) (2023-09-23)


### Bug Fixes

* Fix m2m add/remove bug. ([#802](https://github.com/joist-orm/joist-orm/issues/802)) ([ee6fab6](https://github.com/joist-orm/joist-orm/commit/ee6fab607f375767a9b48343be4b35f87c7a1570))

## [1.108.3](https://github.com/joist-orm/joist-orm/compare/v1.108.2...v1.108.3) (2023-09-23)


### Bug Fixes

* Avoid creating dups if different upsert clauses. ([#801](https://github.com/joist-orm/joist-orm/issues/801)) ([2830eb1](https://github.com/joist-orm/joist-orm/commit/2830eb1d1248d00151ea3ebedea38930fb442753))

## [1.108.2](https://github.com/joist-orm/joist-orm/compare/v1.108.1...v1.108.2) (2023-09-23)


### Bug Fixes

* Fix BaseEntity.toJSON with new entities. ([#800](https://github.com/joist-orm/joist-orm/issues/800)) ([bb61f12](https://github.com/joist-orm/joist-orm/commit/bb61f12823bb91998fcccc845471e57e8feef114))

## [1.108.1](https://github.com/joist-orm/joist-orm/compare/v1.108.0...v1.108.1) (2023-09-23)


### Bug Fixes

* Fix findOrCreate's opaque error message. ([#799](https://github.com/joist-orm/joist-orm/issues/799)) ([5ac0ada](https://github.com/joist-orm/joist-orm/commit/5ac0adabdb6438cca401b4ecaaddba48838c55c5))

# [1.108.0](https://github.com/joist-orm/joist-orm/compare/v1.107.1...v1.108.0) (2023-09-21)


### Features

* Change id to behave like idOrFail. ([#791](https://github.com/joist-orm/joist-orm/issues/791)) ([13e2ee8](https://github.com/joist-orm/joist-orm/commit/13e2ee842133bab208ee29eb81d6907dc058f29d))

## [1.107.1](https://github.com/joist-orm/joist-orm/compare/v1.107.0...v1.107.1) (2023-09-21)


### Bug Fixes

* Keep Jest from crawling into originalEntity. ([#796](https://github.com/joist-orm/joist-orm/issues/796)) ([a508ee4](https://github.com/joist-orm/joist-orm/commit/a508ee4209a16475c15aab97a39fa6fbeac22169))

# [1.107.0](https://github.com/joist-orm/joist-orm/compare/v1.106.1...v1.107.0) (2023-09-18)


### Features

* Added per entity manager entity limit ([#794](https://github.com/joist-orm/joist-orm/issues/794)) ([19786f4](https://github.com/joist-orm/joist-orm/commit/19786f4a5b925b305bd5a66515e30c002bebdeb3))

## [1.106.1](https://github.com/joist-orm/joist-orm/compare/v1.106.0...v1.106.1) (2023-09-17)


### Bug Fixes

* Add readonly to filter arrays. ([#792](https://github.com/joist-orm/joist-orm/issues/792)) ([646617c](https://github.com/joist-orm/joist-orm/commit/646617cbcd794e6b5fe39950dd951d7e56d63564))

# [1.106.0](https://github.com/joist-orm/joist-orm/compare/v1.105.0...v1.106.0) (2023-09-16)


### Features

* Add EnumMetadata. ([#789](https://github.com/joist-orm/joist-orm/issues/789)) ([df92d25](https://github.com/joist-orm/joist-orm/commit/df92d257394c501c140d2a71def0f30c8b6aea3c))

# [1.105.0](https://github.com/joist-orm/joist-orm/compare/v1.104.2...v1.105.0) (2023-09-16)


### Features

* Add meta overload to isTaggedId. ([#788](https://github.com/joist-orm/joist-orm/issues/788)) ([6150ad0](https://github.com/joist-orm/joist-orm/commit/6150ad047337484ce8538ad72b9cee66bf5fe190))

## [1.104.2](https://github.com/joist-orm/joist-orm/compare/v1.104.1...v1.104.2) (2023-09-14)


### Bug Fixes

* skip relation cleanup on cascade delete ([#786](https://github.com/joist-orm/joist-orm/issues/786)) ([6cc2bf5](https://github.com/joist-orm/joist-orm/commit/6cc2bf5bab2a1ba6f32dbc2c1873db8bb93fe7b1))

## [1.104.1](https://github.com/joist-orm/joist-orm/compare/v1.104.0...v1.104.1) (2023-09-14)


### Bug Fixes

* em.touch should rerun reactive rules. ([#785](https://github.com/joist-orm/joist-orm/issues/785)) ([c585e39](https://github.com/joist-orm/joist-orm/commit/c585e3967fa75dc4fa15bc061b7bf308b219c4f7))

# [1.104.0](https://github.com/joist-orm/joist-orm/compare/v1.103.0...v1.104.0) (2023-09-14)


### Features

* Add async method ([#784](https://github.com/joist-orm/joist-orm/issues/784)) ([0c2a032](https://github.com/joist-orm/joist-orm/commit/0c2a0327f946227797b35b65137f635575a8fe60))

# [1.103.0](https://github.com/joist-orm/joist-orm/compare/v1.102.3...v1.103.0) (2023-09-13)


### Features

* Codegen - Delayed throw on non-deferred FK Found ([#782](https://github.com/joist-orm/joist-orm/issues/782)) ([743b85f](https://github.com/joist-orm/joist-orm/commit/743b85f06eaa3d30936125e44c042b93a6081068))

## [1.102.3](https://github.com/joist-orm/joist-orm/compare/v1.102.2...v1.102.3) (2023-09-12)


### Bug Fixes

* Allow query by deep poly o2m field ([#783](https://github.com/joist-orm/joist-orm/issues/783)) ([38c8ca1](https://github.com/joist-orm/joist-orm/commit/38c8ca11d3431f2b7dde0b828cfc7ae5979f6f31))

## [1.102.2](https://github.com/joist-orm/joist-orm/compare/v1.102.1...v1.102.2) (2023-09-06)


### Bug Fixes

* use left outer join for nested required fields ([#778](https://github.com/joist-orm/joist-orm/issues/778)) ([b8cd022](https://github.com/joist-orm/joist-orm/commit/b8cd022ed82333e47f8466d405088bac45d832c3))

## [1.102.1](https://github.com/joist-orm/joist-orm/compare/v1.102.0...v1.102.1) (2023-09-05)


### Bug Fixes

* CTI BaseEntity.toJSON skipping parent fields ([#775](https://github.com/joist-orm/joist-orm/issues/775)) ([9bdcd66](https://github.com/joist-orm/joist-orm/commit/9bdcd66db946c6bcafe63c50077b244c9f27933b))

# [1.102.0](https://github.com/joist-orm/joist-orm/compare/v1.101.6...v1.102.0) (2023-08-30)


### Features

* Use `const` keyword instead of Const utility type. ([#766](https://github.com/joist-orm/joist-orm/issues/766)) ([a179691](https://github.com/joist-orm/joist-orm/commit/a1796917cf4a7cfd6745184c318cfe6ae1dec64a))

## [1.101.6](https://github.com/joist-orm/joist-orm/compare/v1.101.5...v1.101.6) (2023-08-30)


### Bug Fixes

* Fail on overlapping field names. ([#764](https://github.com/joist-orm/joist-orm/issues/764)) ([b0555ad](https://github.com/joist-orm/joist-orm/commit/b0555adc571cdd59d6f5c5c51086915ab8692857)), closes [#762](https://github.com/joist-orm/joist-orm/issues/762)

## [1.101.5](https://github.com/joist-orm/joist-orm/compare/v1.101.4...v1.101.5) (2023-08-26)


### Bug Fixes

* Fix derived field populate ([#761](https://github.com/joist-orm/joist-orm/issues/761)) ([6602bd8](https://github.com/joist-orm/joist-orm/commit/6602bd8b5e366fe24243f74c577356232d15bb07))

## [1.101.4](https://github.com/joist-orm/joist-orm/compare/v1.101.3...v1.101.4) (2023-08-26)


### Bug Fixes

* Don't fail on restricted reactive hints. ([#760](https://github.com/joist-orm/joist-orm/issues/760)) ([98dfb94](https://github.com/joist-orm/joist-orm/commit/98dfb944c2f19af5434dccf0adc144d33c95c8f5))

## [1.101.3](https://github.com/joist-orm/joist-orm/compare/v1.101.2...v1.101.3) (2023-08-26)


### Bug Fixes

* Transitively load derived values when the entities are new. ([#759](https://github.com/joist-orm/joist-orm/issues/759)) ([ba53e7e](https://github.com/joist-orm/joist-orm/commit/ba53e7eb8909fc3fd2c2ccfd75dce2cbcba0bc47))

## [1.101.2](https://github.com/joist-orm/joist-orm/compare/v1.101.1...v1.101.2) (2023-08-25)


### Bug Fixes

* Dedupe relations before calling load. ([#758](https://github.com/joist-orm/joist-orm/issues/758)) ([0ab3c38](https://github.com/joist-orm/joist-orm/commit/0ab3c38ce4da7769a8974ebef38119d09f6b8aa4))

## [1.101.1](https://github.com/joist-orm/joist-orm/compare/v1.101.0...v1.101.1) (2023-08-16)


### Bug Fixes

* outer join on non required m2o ([#754](https://github.com/joist-orm/joist-orm/issues/754)) ([e614226](https://github.com/joist-orm/joist-orm/commit/e6142262375b37531e2314382bbf4fdf5746efe9))

# [1.101.0](https://github.com/joist-orm/joist-orm/compare/v1.100.0...v1.101.0) (2023-08-12)


### Features

* Output warnings for stale/invalid config keys. ([#752](https://github.com/joist-orm/joist-orm/issues/752)) ([5a45b4a](https://github.com/joist-orm/joist-orm/commit/5a45b4ad4bb34af32d3bae099b7b77f668572654)), closes [#740](https://github.com/joist-orm/joist-orm/issues/740)

# [1.100.0](https://github.com/joist-orm/joist-orm/compare/v1.99.0...v1.100.0) (2023-08-07)


### Features

* Add reactivity for m2m relations ([#748](https://github.com/joist-orm/joist-orm/issues/748)) ([9282427](https://github.com/joist-orm/joist-orm/commit/9282427c05f1c23b5d10c4183966e94df836540a))

# [1.99.0](https://github.com/joist-orm/joist-orm/compare/v1.98.0...v1.99.0) (2023-08-06)


### Features

* Add forceReload to PersistedAsyncProperty. ([#750](https://github.com/joist-orm/joist-orm/issues/750)) ([7aa51d2](https://github.com/joist-orm/joist-orm/commit/7aa51d2a782e4c40a09b159934eed9f1664b93ff))

# [1.98.0](https://github.com/joist-orm/joist-orm/compare/v1.97.0...v1.98.0) (2023-08-04)


### Features

* Add changes field to Reacted. ([#744](https://github.com/joist-orm/joist-orm/issues/744)) ([d5eacc8](https://github.com/joist-orm/joist-orm/commit/d5eacc81338bb864ccd5d62cf076814968c6095d))

# [1.97.0](https://github.com/joist-orm/joist-orm/compare/v1.96.0...v1.97.0) (2023-08-04)


### Features

* Add transientFields convention to Reacted. ([#745](https://github.com/joist-orm/joist-orm/issues/745)) ([f809ec0](https://github.com/joist-orm/joist-orm/commit/f809ec0153f1a8d9f42972719917d7eba5a58dcc))

# [1.96.0](https://github.com/joist-orm/joist-orm/compare/v1.95.0...v1.96.0) (2023-08-02)


### Features

* Map bigints as BigInts. ([#742](https://github.com/joist-orm/joist-orm/issues/742)) ([c594c3a](https://github.com/joist-orm/joist-orm/commit/c594c3a097c51dd8010590587be6a0e2a3af2a7c))

# [1.95.0](https://github.com/joist-orm/joist-orm/compare/v1.94.0...v1.95.0) (2023-07-31)


### Features

* Rename entity to fullNonReactiveAccess. ([#741](https://github.com/joist-orm/joist-orm/issues/741)) ([0abc17d](https://github.com/joist-orm/joist-orm/commit/0abc17d9d6bb33bee0c31a1f5475136bda5faa02))

# [1.94.0](https://github.com/joist-orm/joist-orm/compare/v1.93.0...v1.94.0) (2023-07-26)


### Features

* Include enum name into enum details object ([#739](https://github.com/joist-orm/joist-orm/issues/739)) ([a8ad3ca](https://github.com/joist-orm/joist-orm/commit/a8ad3cab64c49a37909cde12f975c986b7dd7999))

# [1.93.0](https://github.com/joist-orm/joist-orm/compare/v1.92.4...v1.93.0) (2023-07-14)


### Features

* Batch findCount queries. ([#730](https://github.com/joist-orm/joist-orm/issues/730)) ([54f3e5a](https://github.com/joist-orm/joist-orm/commit/54f3e5a17993bcb0cccda1fae7d042b77c276926))

## [1.92.4](https://github.com/joist-orm/joist-orm/compare/v1.92.3...v1.92.4) (2023-07-13)


### Bug Fixes

* orderBy on cti base fields  ([#729](https://github.com/joist-orm/joist-orm/issues/729)) ([e398cc6](https://github.com/joist-orm/joist-orm/commit/e398cc6b660b5d4ac8ac5c9a386f1131c40d9d7a))

## [1.92.3](https://github.com/joist-orm/joist-orm/compare/v1.92.2...v1.92.3) (2023-07-12)


### Bug Fixes

* Run beforeDelete hooks before entities are disconnected. ([#727](https://github.com/joist-orm/joist-orm/issues/727)) ([716488b](https://github.com/joist-orm/joist-orm/commit/716488b82fcbd57e99561047300e585db09937d8))

## [1.92.2](https://github.com/joist-orm/joist-orm/compare/v1.92.1...v1.92.2) (2023-07-11)


### Bug Fixes

* Refactor reactivity ([#724](https://github.com/joist-orm/joist-orm/issues/724)) ([52e6ba8](https://github.com/joist-orm/joist-orm/commit/52e6ba8ff2c83fdc607145c10b4ce7c795ff20d6))

## [1.92.1](https://github.com/joist-orm/joist-orm/compare/v1.92.0...v1.92.1) (2023-07-06)


### Bug Fixes

* Use base type alias when filtering. ([#723](https://github.com/joist-orm/joist-orm/issues/723)) ([8269d96](https://github.com/joist-orm/joist-orm/commit/8269d96bd95dd23f1e5891dac22fe82f21d3742d))

# [1.92.0](https://github.com/joist-orm/joist-orm/compare/v1.91.6...v1.92.0) (2023-06-30)


### Features

* Updated EntityId codegen to use actual type instead of a string ([#718](https://github.com/joist-orm/joist-orm/issues/718)) ([4c9d808](https://github.com/joist-orm/joist-orm/commit/4c9d808cacacde6ff25afe03fe641fdff22da635))

## [1.91.6](https://github.com/joist-orm/joist-orm/compare/v1.91.5...v1.91.6) (2023-06-28)


### Bug Fixes

* Check tags/empty string when setting m2o.id. ([#717](https://github.com/joist-orm/joist-orm/issues/717)) ([df11ec1](https://github.com/joist-orm/joist-orm/commit/df11ec1e85bbd6a19d2dff4331275109e785c97e))

## [1.91.5](https://github.com/joist-orm/joist-orm/compare/v1.91.4...v1.91.5) (2023-06-27)


### Bug Fixes

* Provide a nicer error with invalid hints. ([#713](https://github.com/joist-orm/joist-orm/issues/713)) ([613749c](https://github.com/joist-orm/joist-orm/commit/613749ccfecd57e6360fc1fb2625aad3508d88e3))

## [1.91.4](https://github.com/joist-orm/joist-orm/compare/v1.91.3...v1.91.4) (2023-06-26)


### Bug Fixes

* Fix findOrCreate not hooking up both sides. ([#712](https://github.com/joist-orm/joist-orm/issues/712)) ([0fb1c36](https://github.com/joist-orm/joist-orm/commit/0fb1c36b31f382d1123fef77272baad0c3c292a2))

## [1.91.3](https://github.com/joist-orm/joist-orm/compare/v1.91.2...v1.91.3) (2023-06-25)


### Bug Fixes

* Don't infinite recurse on required self-ref keys. ([#710](https://github.com/joist-orm/joist-orm/issues/710)) ([6a16ac2](https://github.com/joist-orm/joist-orm/commit/6a16ac2db4833c97fd556423cd57feb8a63b8ff9))

## [1.91.2](https://github.com/joist-orm/joist-orm/compare/v1.91.1...v1.91.2) (2023-06-22)


### Bug Fixes

* move string/null cast to setter, herustic disable on default "" ([#705](https://github.com/joist-orm/joist-orm/issues/705)) ([6ad8556](https://github.com/joist-orm/joist-orm/commit/6ad855662059b8ee3ed33048f18e2ae2b4ad5e60))

## [1.91.1](https://github.com/joist-orm/joist-orm/compare/v1.91.0...v1.91.1) (2023-06-21)


### Bug Fixes

* Fix multiple nested conditions. ([#703](https://github.com/joist-orm/joist-orm/issues/703)) ([ff1e969](https://github.com/joist-orm/joist-orm/commit/ff1e96930b8bbd9286fdb2f10b7ff96a50816392)), closes [#701](https://github.com/joist-orm/joist-orm/issues/701)

# [1.91.0](https://github.com/joist-orm/joist-orm/compare/v1.90.0...v1.91.0) (2023-06-19)


### Features

* add basic custom serde support ([#698](https://github.com/joist-orm/joist-orm/issues/698)) ([36bdce6](https://github.com/joist-orm/joist-orm/commit/36bdce6d86c12348aa3ee89e3cc19ed31c0390e7))

# [1.90.0](https://github.com/joist-orm/joist-orm/compare/v1.89.3...v1.90.0) (2023-06-18)


### Features

* use NotFoundError in load & loadAll ([#697](https://github.com/joist-orm/joist-orm/issues/697)) ([d2de239](https://github.com/joist-orm/joist-orm/commit/d2de239581ed890e4a530c16248724bf2a36125f))

## [1.89.3](https://github.com/joist-orm/joist-orm/compare/v1.89.2...v1.89.3) (2023-06-17)


### Bug Fixes

* ensure exclusive `or` or `and` in ExpressionFilter ([#695](https://github.com/joist-orm/joist-orm/issues/695)) ([17b6f5c](https://github.com/joist-orm/joist-orm/commit/17b6f5c03a18d6a77335beca39ead726aeef392c))

## [1.89.2](https://github.com/joist-orm/joist-orm/compare/v1.89.1...v1.89.2) (2023-06-16)


### Bug Fixes

* add toJSON to ValidationErrors ([#693](https://github.com/joist-orm/joist-orm/issues/693)) ([b3c49bd](https://github.com/joist-orm/joist-orm/commit/b3c49bd552538acd63b8e93ea78d26cf4bd5ba8a))

## [1.89.1](https://github.com/joist-orm/joist-orm/compare/v1.89.0...v1.89.1) (2023-06-16)


### Bug Fixes

* Fix join order in batch finds. ([#694](https://github.com/joist-orm/joist-orm/issues/694)) ([07cc043](https://github.com/joist-orm/joist-orm/commit/07cc043d89fe76f62bea533a11900caebd5c88a7)), closes [#689](https://github.com/joist-orm/joist-orm/issues/689)

# [1.89.0](https://github.com/joist-orm/joist-orm/compare/v1.88.6...v1.89.0) (2023-06-15)


### Features

* support zodSchema for jsonb columns ([#686](https://github.com/joist-orm/joist-orm/issues/686)) ([ec6ab5a](https://github.com/joist-orm/joist-orm/commit/ec6ab5a23c3d796e947eb5f0dc6c31b43e83df28))

## [1.88.6](https://github.com/joist-orm/joist-orm/compare/v1.88.5...v1.88.6) (2023-06-15)


### Bug Fixes

* use meta.allFields for cloning ([#690](https://github.com/joist-orm/joist-orm/issues/690)) ([0a78048](https://github.com/joist-orm/joist-orm/commit/0a78048679ba68968c078ef0edcf19f0eae205e2))

## [1.88.5](https://github.com/joist-orm/joist-orm/compare/v1.88.4...v1.88.5) (2023-06-13)


### Bug Fixes

* JsonSerde args within codegen ([#687](https://github.com/joist-orm/joist-orm/issues/687)) ([36011f1](https://github.com/joist-orm/joist-orm/commit/36011f1f74c946adee8891d0ef0df368c8fdb89a))

## [1.88.4](https://github.com/joist-orm/joist-orm/compare/v1.88.3...v1.88.4) (2023-06-12)


### Bug Fixes

* jsonb top level array ([#685](https://github.com/joist-orm/joist-orm/issues/685)) ([1cfa6f5](https://github.com/joist-orm/joist-orm/commit/1cfa6f5d2decdc6ab9247168fc726c06b84f429d))

## [1.88.3](https://github.com/joist-orm/joist-orm/compare/v1.88.2...v1.88.3) (2023-06-09)


### Bug Fixes

* Allow m2os to be used in filters. Fixes [#680](https://github.com/joist-orm/joist-orm/issues/680). ([#683](https://github.com/joist-orm/joist-orm/issues/683)) ([4c246fa](https://github.com/joist-orm/joist-orm/commit/4c246fa855a1f22da5b5d5ec14e38d9f6e3f1c89))

## [1.88.2](https://github.com/joist-orm/joist-orm/compare/v1.88.1...v1.88.2) (2023-06-07)


### Bug Fixes

* ignore PersistedAsyncReference on em refresh ([#679](https://github.com/joist-orm/joist-orm/issues/679)) ([cb54511](https://github.com/joist-orm/joist-orm/commit/cb54511e5ef4d31d13932a7d4b9f5aa99d658973))

## [1.88.1](https://github.com/joist-orm/joist-orm/compare/v1.88.0...v1.88.1) (2023-06-06)


### Bug Fixes

* Add support namespaced packages within config imports ([#677](https://github.com/joist-orm/joist-orm/issues/677)) ([af7a344](https://github.com/joist-orm/joist-orm/commit/af7a344f4cdfc98d170c85d180d55b52a8afe3e2))

# [1.88.0](https://github.com/joist-orm/joist-orm/compare/v1.87.0...v1.88.0) (2023-06-05)


### Features

* add `PersistedAsyncReference` ([#639](https://github.com/joist-orm/joist-orm/issues/639)) ([8bd9e5b](https://github.com/joist-orm/joist-orm/commit/8bd9e5b6aeb3a05adc637c227fc0fd8857875fde))

# [1.87.0](https://github.com/joist-orm/joist-orm/compare/v1.86.0...v1.87.0) (2023-06-05)


### Features

* Add custom type override to config & codegen ([#676](https://github.com/joist-orm/joist-orm/issues/676)) ([5d90aae](https://github.com/joist-orm/joist-orm/commit/5d90aaeaf7bf258fdafca281f399748f29e89339))

# [1.86.0](https://github.com/joist-orm/joist-orm/compare/v1.85.2...v1.86.0) (2023-06-04)


### Features

* Bump TypeScript, misc deps. ([#675](https://github.com/joist-orm/joist-orm/issues/675)) ([e3fcb70](https://github.com/joist-orm/joist-orm/commit/e3fcb7053d0ffc85592dfeba65c145740e1ef4c3))

## [1.85.2](https://github.com/joist-orm/joist-orm/compare/v1.85.1...v1.85.2) (2023-06-03)


### Bug Fixes

* Avoid using JS keywords. Fixes [#672](https://github.com/joist-orm/joist-orm/issues/672). ([#673](https://github.com/joist-orm/joist-orm/issues/673)) ([eee04fe](https://github.com/joist-orm/joist-orm/commit/eee04fecc1fd3beb825bf27d83cd30166b42e105))

## [1.85.1](https://github.com/joist-orm/joist-orm/compare/v1.85.0...v1.85.1) (2023-06-01)


### Bug Fixes

* Fix syntax error when updating keyword-named columns. ([#671](https://github.com/joist-orm/joist-orm/issues/671)) ([a6e820c](https://github.com/joist-orm/joist-orm/commit/a6e820caf2da2113ca4f2a6bc1c09f3fcd84cc6c))

# [1.85.0](https://github.com/joist-orm/joist-orm/compare/v1.84.0...v1.85.0) (2023-06-01)


### Features

* Add Ops AST/EntityWriter for writes ([#670](https://github.com/joist-orm/joist-orm/issues/670)) ([8ff2937](https://github.com/joist-orm/joist-orm/commit/8ff29373cd7325fe1858fdd0873df58173febab7))

# [1.84.0](https://github.com/joist-orm/joist-orm/compare/v1.83.4...v1.84.0) (2023-05-29)


### Features

* Warn on misconfigured foreign keys. ([#669](https://github.com/joist-orm/joist-orm/issues/669)) ([aa882fa](https://github.com/joist-orm/joist-orm/commit/aa882fa764c16fe2c3fceb64a8519fd90729b86d))

## [1.83.4](https://github.com/joist-orm/joist-orm/compare/v1.83.3...v1.83.4) (2023-05-26)


### Bug Fixes

* Fix findOrCreate incorrectly matching new entities. ([#666](https://github.com/joist-orm/joist-orm/issues/666)) ([73135a3](https://github.com/joist-orm/joist-orm/commit/73135a328e77d44cd93e32e016f9ab2998a7928c))

## [1.83.3](https://github.com/joist-orm/joist-orm/compare/v1.83.2...v1.83.3) (2023-05-25)


### Bug Fixes

* Fix tags using the idType instead of just int. ([#665](https://github.com/joist-orm/joist-orm/issues/665)) ([3c96feb](https://github.com/joist-orm/joist-orm/commit/3c96feb7b33ccc1153890a9347aedb4a7d9cb175))

## [1.83.2](https://github.com/joist-orm/joist-orm/compare/v1.83.1...v1.83.2) (2023-05-25)


### Bug Fixes

* Fix using -1 as a null condition for uuid columns. ([#664](https://github.com/joist-orm/joist-orm/issues/664)) ([7aca764](https://github.com/joist-orm/joist-orm/commit/7aca7644e4a89c7934879f86b45970ec87c84d89))

## [1.83.1](https://github.com/joist-orm/joist-orm/compare/v1.83.0...v1.83.1) (2023-05-25)


### Bug Fixes

* Skip em.find queries if a param is new. ([#663](https://github.com/joist-orm/joist-orm/issues/663)) ([c0f45b0](https://github.com/joist-orm/joist-orm/commit/c0f45b04e0c224c5f68b5750faab1399a04b7ed1))

# [1.83.0](https://github.com/joist-orm/joist-orm/compare/v1.82.0...v1.83.0) (2023-05-24)


### Features

* Teach em.findOrCreate to look for newly-created/updated entities ([#661](https://github.com/joist-orm/joist-orm/issues/661)) ([28bd591](https://github.com/joist-orm/joist-orm/commit/28bd5915a24510df30c63d36655659cc3b69e71a))

# [1.82.0](https://github.com/joist-orm/joist-orm/compare/v1.81.5...v1.82.0) (2023-05-24)


### Features

* Dedupe em.findOrCreates that are called in a loop. ([#660](https://github.com/joist-orm/joist-orm/issues/660)) ([e7b3cd3](https://github.com/joist-orm/joist-orm/commit/e7b3cd3eddc39797daf96660b5399fde7202b135))

## [1.81.5](https://github.com/joist-orm/joist-orm/compare/v1.81.4...v1.81.5) (2023-05-23)


### Bug Fixes

* Support for polys in aliases. ([#659](https://github.com/joist-orm/joist-orm/issues/659)) ([31614ef](https://github.com/joist-orm/joist-orm/commit/31614ef5dde1593d09d6a91813c005ad93918048))

## [1.81.4](https://github.com/joist-orm/joist-orm/compare/v1.81.3...v1.81.4) (2023-05-19)


### Bug Fixes

* Provide a GraphQLFilterAndSettings. ([#658](https://github.com/joist-orm/joist-orm/issues/658)) ([fc6aa40](https://github.com/joist-orm/joist-orm/commit/fc6aa408e8f1bf69556a55990b34881a580c9317))

## [1.81.3](https://github.com/joist-orm/joist-orm/compare/v1.81.2...v1.81.3) (2023-05-19)


### Bug Fixes

* Allow GQL input on limit/offset. ([#657](https://github.com/joist-orm/joist-orm/issues/657)) ([a6422a4](https://github.com/joist-orm/joist-orm/commit/a6422a45146fde85746c449a3beaa0d9d868ca7a))

## [1.81.2](https://github.com/joist-orm/joist-orm/compare/v1.81.1...v1.81.2) (2023-05-19)


### Bug Fixes

* Fix findCount with o2m conditions. ([#656](https://github.com/joist-orm/joist-orm/issues/656)) ([7a2eb6d](https://github.com/joist-orm/joist-orm/commit/7a2eb6d87fd0a517a1be1f1f034dbebad606f3a9))

## [1.81.1](https://github.com/joist-orm/joist-orm/compare/v1.81.0...v1.81.1) (2023-05-19)


### Bug Fixes

* Fix gatherEntities looping on cycles. ([#655](https://github.com/joist-orm/joist-orm/issues/655)) ([e504271](https://github.com/joist-orm/joist-orm/commit/e50427142c4c2900454e6e1d62b7f7690d319c3b))

# [1.81.0](https://github.com/joist-orm/joist-orm/compare/v1.80.0...v1.81.0) (2023-05-19)


### Features

* Add EntityManager-level caching for em.findCount. ([#654](https://github.com/joist-orm/joist-orm/issues/654)) ([d7a469b](https://github.com/joist-orm/joist-orm/commit/d7a469b194ea8c62b3c7a59f63cd16206cde57ea))

# [1.80.0](https://github.com/joist-orm/joist-orm/compare/v1.79.0...v1.80.0) (2023-05-19)


### Features

* Add Entity.tagName/metadata as static fields. ([#652](https://github.com/joist-orm/joist-orm/issues/652)) ([a9cab9e](https://github.com/joist-orm/joist-orm/commit/a9cab9ea35166f88132467488eb28a5ec2d249ec))

# [1.79.0](https://github.com/joist-orm/joist-orm/compare/v1.78.3...v1.79.0) (2023-05-19)


### Features

* Add em.findCount. ([#651](https://github.com/joist-orm/joist-orm/issues/651)) ([dcf361c](https://github.com/joist-orm/joist-orm/commit/dcf361ce022bcee853d7fe714a96cd681185e358))

## [1.78.3](https://github.com/joist-orm/joist-orm/compare/v1.78.2...v1.78.3) (2023-05-19)


### Bug Fixes

* Allow primitive conditions to do is/is not null. ([#650](https://github.com/joist-orm/joist-orm/issues/650)) ([995d871](https://github.com/joist-orm/joist-orm/commit/995d871c95f378892e221dbdd85721bd7036a12d)), closes [#649](https://github.com/joist-orm/joist-orm/issues/649)

## [1.78.2](https://github.com/joist-orm/joist-orm/compare/v1.78.1...v1.78.2) (2023-05-17)


### Bug Fixes

* Fix ValueGraphQLFilter's op/value type. ([#646](https://github.com/joist-orm/joist-orm/issues/646)) ([de57182](https://github.com/joist-orm/joist-orm/commit/de57182e1a5ed479959b7ad31692a6e9a335343d))

## [1.78.1](https://github.com/joist-orm/joist-orm/compare/v1.78.0...v1.78.1) (2023-05-17)


### Bug Fixes

* Fix typing of enum GQL filters. ([#645](https://github.com/joist-orm/joist-orm/issues/645)) ([a71783f](https://github.com/joist-orm/joist-orm/commit/a71783f7be405bcdff7994fd5b2950e7f01db70f))

# [1.78.0](https://github.com/joist-orm/joist-orm/compare/v1.77.3...v1.78.0) (2023-05-17)


### Features

* Add more array operators. ([#644](https://github.com/joist-orm/joist-orm/issues/644)) ([3b0775d](https://github.com/joist-orm/joist-orm/commit/3b0775d0f414edf0b112a78df014853ba1190f11)), closes [#643](https://github.com/joist-orm/joist-orm/issues/643)

## [1.77.3](https://github.com/joist-orm/joist-orm/compare/v1.77.2...v1.77.3) (2023-05-16)


### Bug Fixes

* Allow 'as' in FilterAndSettings.where. ([#642](https://github.com/joist-orm/joist-orm/issues/642)) ([089f625](https://github.com/joist-orm/joist-orm/commit/089f6256e3491213dc532d787e198e014787de14))

## [1.77.2](https://github.com/joist-orm/joist-orm/compare/v1.77.1...v1.77.2) (2023-05-16)


### Bug Fixes

* Fix caching bug in new em.find code. ([#641](https://github.com/joist-orm/joist-orm/issues/641)) ([dbc1fdd](https://github.com/joist-orm/joist-orm/commit/dbc1fddca678fad1c497fc5febcd39eab532d367))

## [1.77.1](https://github.com/joist-orm/joist-orm/compare/v1.77.0...v1.77.1) (2023-05-16)


### Bug Fixes

* Fix limit/offset can be undefined. ([#640](https://github.com/joist-orm/joist-orm/issues/640)) ([4a618f3](https://github.com/joist-orm/joist-orm/commit/4a618f33f356ceabb3e1a2adcb87f436b04bd0f9))

# [1.77.0](https://github.com/joist-orm/joist-orm/compare/v1.76.3...v1.77.0) (2023-05-16)


### Features

* Use CTEs instead of UNIONs to batch queries.  ([#638](https://github.com/joist-orm/joist-orm/issues/638)) ([b37f61a](https://github.com/joist-orm/joist-orm/commit/b37f61afd2fb93fa5ea3600d836935149b19309d))

## [1.76.3](https://github.com/joist-orm/joist-orm/compare/v1.76.2...v1.76.3) (2023-05-05)


### Bug Fixes

* Fix batch em.finds when using uuids. ([#634](https://github.com/joist-orm/joist-orm/issues/634)) ([2e8d8ba](https://github.com/joist-orm/joist-orm/commit/2e8d8bae418817c4d44cf43a3cd52e50072d8f97))

## [1.76.2](https://github.com/joist-orm/joist-orm/compare/v1.76.1...v1.76.2) (2023-05-05)


### Bug Fixes

* Fix o2m-find typo. ([#633](https://github.com/joist-orm/joist-orm/issues/633)) ([b9ca4b9](https://github.com/joist-orm/joist-orm/commit/b9ca4b98892e36920b79270d49677dbbc8558262))

## [1.76.1](https://github.com/joist-orm/joist-orm/compare/v1.76.0...v1.76.1) (2023-05-03)


### Bug Fixes

* Null check info for unit tests. ([#632](https://github.com/joist-orm/joist-orm/issues/632)) ([957b330](https://github.com/joist-orm/joist-orm/commit/957b330a87e32191ebbfd931728d592af5255fd7))

# [1.76.0](https://github.com/joist-orm/joist-orm/compare/v1.75.0...v1.76.0) (2023-05-03)


### Features

* Refactor get loader ([#631](https://github.com/joist-orm/joist-orm/issues/631)) ([d9171c8](https://github.com/joist-orm/joist-orm/commit/d9171c8890695da86be0bfe104df39fa03ef5542))

# [1.75.0](https://github.com/joist-orm/joist-orm/compare/v1.74.4...v1.75.0) (2023-05-03)


### Features

* Optimize returning only m2o ids. ([#630](https://github.com/joist-orm/joist-orm/issues/630)) ([825bff9](https://github.com/joist-orm/joist-orm/commit/825bff9b9c444f1101bc5d78cc3e2f483b56b56c))

## [1.74.4](https://github.com/joist-orm/joist-orm/compare/v1.74.3...v1.74.4) (2023-04-27)


### Bug Fixes

* Using m2m aliases should use an outer join. ([#627](https://github.com/joist-orm/joist-orm/issues/627)) ([b8d7fe6](https://github.com/joist-orm/joist-orm/commit/b8d7fe6cacf92ff542cf8b1c9f5147fc75673948))

## [1.74.3](https://github.com/joist-orm/joist-orm/compare/v1.74.2...v1.74.3) (2023-04-25)


### Bug Fixes

* Fix merging overlapping reactive hints. ([#624](https://github.com/joist-orm/joist-orm/issues/624)) ([1efb74d](https://github.com/joist-orm/joist-orm/commit/1efb74dccaf91f506856bfb335f65aeb9da3944c))

## [1.74.2](https://github.com/joist-orm/joist-orm/compare/v1.74.1...v1.74.2) (2023-04-21)


### Bug Fixes

* Make a copy of opts. ([#623](https://github.com/joist-orm/joist-orm/issues/623)) ([24c62b6](https://github.com/joist-orm/joist-orm/commit/24c62b6c61873dce120bcf185609dd1b90e14037))

## [1.74.1](https://github.com/joist-orm/joist-orm/compare/v1.74.0...v1.74.1) (2023-04-19)


### Bug Fixes

* add lazy conversion of reactive load hints in async props to avoid infinite recursion on entity creation ([#621](https://github.com/joist-orm/joist-orm/issues/621)) ([d3ec321](https://github.com/joist-orm/joist-orm/commit/d3ec32101ab97515d4747954bd72aab3b8dce873))

# [1.74.0](https://github.com/joist-orm/joist-orm/compare/v1.73.2...v1.74.0) (2023-04-17)


### Features

* Add hasReactiveAsyncProperty to fix reactivity on properties. ([#619](https://github.com/joist-orm/joist-orm/issues/619)) ([350ef63](https://github.com/joist-orm/joist-orm/commit/350ef63221ad1ce4de55b246bdb6606e8d1c846a))

## [1.73.2](https://github.com/joist-orm/joist-orm/compare/v1.73.1...v1.73.2) (2023-04-16)


### Bug Fixes

* Fix not pushing new tags into EntityDbMetadata. ([#618](https://github.com/joist-orm/joist-orm/issues/618)) ([69cc23a](https://github.com/joist-orm/joist-orm/commit/69cc23a948443c9928f63490d7f8c201220a53cd))

## [1.73.1](https://github.com/joist-orm/joist-orm/compare/v1.73.0...v1.73.1) (2023-04-15)


### Bug Fixes

* Ignore template in the `migrations/` directory. ([#617](https://github.com/joist-orm/joist-orm/issues/617)) ([07adbee](https://github.com/joist-orm/joist-orm/commit/07adbee790957d18adc6280bf07fbf0369e41f8f))

# [1.73.0](https://github.com/joist-orm/joist-orm/compare/v1.72.5...v1.73.0) (2023-04-13)


### Features

* Allow defining a default sort to entities/collections. ([#612](https://github.com/joist-orm/joist-orm/issues/612)) ([416fa3d](https://github.com/joist-orm/joist-orm/commit/416fa3d37aa75a5ad7e49e862172cb4b5cb36726))

## [1.72.5](https://github.com/joist-orm/joist-orm/compare/v1.72.4...v1.72.5) (2023-04-13)


### Bug Fixes

* Provide default generics for EntityFilter. ([#616](https://github.com/joist-orm/joist-orm/issues/616)) ([bfafcb7](https://github.com/joist-orm/joist-orm/commit/bfafcb7284a58e289b9c79ff8b75578717c4b748))

## [1.72.4](https://github.com/joist-orm/joist-orm/compare/v1.72.3...v1.72.4) (2023-04-13)


### Bug Fixes

* Allow undefined expressions. ([#615](https://github.com/joist-orm/joist-orm/issues/615)) ([68dedee](https://github.com/joist-orm/joist-orm/commit/68dedeeddc7b7d7dec89aa1ebf01bbfeb4b09e9b))

## [1.72.3](https://github.com/joist-orm/joist-orm/compare/v1.72.2...v1.72.3) (2023-04-12)


### Bug Fixes

* Add id to fields type. ([#614](https://github.com/joist-orm/joist-orm/issues/614)) ([9cca93d](https://github.com/joist-orm/joist-orm/commit/9cca93db3f7331aef626bb187ff713925ad39e80))

## [1.72.2](https://github.com/joist-orm/joist-orm/compare/v1.72.1...v1.72.2) (2023-04-07)


### Bug Fixes

* Fix m2o.id when the value is still a string. ([#611](https://github.com/joist-orm/joist-orm/issues/611)) ([26f8162](https://github.com/joist-orm/joist-orm/commit/26f816286712522fb516f5ba427db8388b3113cd))

## [1.72.1](https://github.com/joist-orm/joist-orm/compare/v1.72.0...v1.72.1) (2023-04-07)


### Bug Fixes

* Fix m2o.id can return untagged ids. ([#608](https://github.com/joist-orm/joist-orm/issues/608)) ([7b5247a](https://github.com/joist-orm/joist-orm/commit/7b5247ac845878fa784ef60081c4b7f738dedd5b)), closes [#607](https://github.com/joist-orm/joist-orm/issues/607)

# [1.72.0](https://github.com/joist-orm/joist-orm/compare/v1.71.1...v1.72.0) (2023-04-02)


### Features

* Make test uuids more cute. ([#602](https://github.com/joist-orm/joist-orm/issues/602)) ([38c203e](https://github.com/joist-orm/joist-orm/commit/38c203e1bb0f65284dda3cd266080bcf9cf02aaf))

## [1.71.1](https://github.com/joist-orm/joist-orm/compare/v1.71.0...v1.71.1) (2023-04-02)


### Bug Fixes

* Fix setting m2os with an untagged id. ([#601](https://github.com/joist-orm/joist-orm/issues/601)) ([b725f0a](https://github.com/joist-orm/joist-orm/commit/b725f0a97244f9496b18c48057201857030ea3bc))

# [1.71.0](https://github.com/joist-orm/joist-orm/compare/v1.70.1...v1.71.0) (2023-04-01)


### Features

* use column comments instead of joist-config for relation renames ([#600](https://github.com/joist-orm/joist-orm/issues/600)) ([6767af1](https://github.com/joist-orm/joist-orm/commit/6767af1c07d75e6ab77ccc0a4810862dd33fe792))

## [1.70.1](https://github.com/joist-orm/joist-orm/compare/v1.70.0...v1.70.1) (2023-03-31)


### Bug Fixes

* Use a negative testIndex value for good measure. ([#599](https://github.com/joist-orm/joist-orm/issues/599)) ([3ed80f2](https://github.com/joist-orm/joist-orm/commit/3ed80f2993c9c99f618e69563319ad743bd7ca2a))

# [1.70.0](https://github.com/joist-orm/joist-orm/compare/v1.69.1...v1.70.0) (2023-03-31)


### Features

* Allow using testIndex for numberic fields like order. ([#598](https://github.com/joist-orm/joist-orm/issues/598)) ([6d841df](https://github.com/joist-orm/joist-orm/commit/6d841df5b472b3ef0362221d6f42c578472bd10b))

## [1.69.1](https://github.com/joist-orm/joist-orm/compare/v1.69.0...v1.69.1) (2023-03-30)


### Bug Fixes

* Fix DELETEs bumping oplocks for UPDATEs. ([#593](https://github.com/joist-orm/joist-orm/issues/593)) ([5817469](https://github.com/joist-orm/joist-orm/commit/581746935aabe1622aaf8b4544f7a6fdc2e5b607)), closes [#591](https://github.com/joist-orm/joist-orm/issues/591)

# [1.69.0](https://github.com/joist-orm/joist-orm/compare/v1.68.0...v1.69.0) (2023-03-28)


### Features

* Generate a const for enum details. ([#590](https://github.com/joist-orm/joist-orm/issues/590)) ([13f2a8e](https://github.com/joist-orm/joist-orm/commit/13f2a8ebb2f4247272892cec644bcc3e4708bfd0))

# [1.68.0](https://github.com/joist-orm/joist-orm/compare/v1.67.0...v1.68.0) (2023-03-28)


### Features

* Implement oneToOneDataLoader with executeFind. ([#589](https://github.com/joist-orm/joist-orm/issues/589)) ([c4df890](https://github.com/joist-orm/joist-orm/commit/c4df890f2a11120c270d235db8a18ee95a2f6773))

# [1.67.0](https://github.com/joist-orm/joist-orm/compare/v1.66.1...v1.67.0) (2023-03-26)


### Features

* Support creating `flush_database` in multiple databases. ([#588](https://github.com/joist-orm/joist-orm/issues/588)) ([b51c4d0](https://github.com/joist-orm/joist-orm/commit/b51c4d0680ebc02523e30586f709b9758a5c1312)), closes [#585](https://github.com/joist-orm/joist-orm/issues/585)

## [1.66.1](https://github.com/joist-orm/joist-orm/compare/v1.66.0...v1.66.1) (2023-03-26)


### Bug Fixes

* Wrap aliases that might be keywords. ([#587](https://github.com/joist-orm/joist-orm/issues/587)) ([240eccd](https://github.com/joist-orm/joist-orm/commit/240eccd927a29bb6937d5fe433d1212fd3770b5f))

# [1.66.0](https://github.com/joist-orm/joist-orm/compare/v1.65.1...v1.66.0) (2023-03-25)


### Features

* Implement oneToManyDataLoader with executeFind. ([#584](https://github.com/joist-orm/joist-orm/issues/584)) ([cdaba25](https://github.com/joist-orm/joist-orm/commit/cdaba25f3a56d1b3d728eee06d4f171e4439f516))

## [1.65.1](https://github.com/joist-orm/joist-orm/compare/v1.65.0...v1.65.1) (2023-03-25)


### Bug Fixes

* Fix m2o.set when using untagged ids. ([#583](https://github.com/joist-orm/joist-orm/issues/583)) ([fac523b](https://github.com/joist-orm/joist-orm/commit/fac523b5e48e7a387207fd34a732fa30b1ecce12))

# [1.65.0](https://github.com/joist-orm/joist-orm/compare/v1.64.2...v1.65.0) (2023-03-25)


### Features

* Add findByUnique. ([#581](https://github.com/joist-orm/joist-orm/issues/581)) ([de3c261](https://github.com/joist-orm/joist-orm/commit/de3c26172541829296d249266a5cc323205c5953)), closes [#380](https://github.com/joist-orm/joist-orm/issues/380)

## [1.64.2](https://github.com/joist-orm/joist-orm/compare/v1.64.1...v1.64.2) (2023-03-24)


### Bug Fixes

* Fix missing semi-colon after poly fields. ([#580](https://github.com/joist-orm/joist-orm/issues/580)) ([809ca3e](https://github.com/joist-orm/joist-orm/commit/809ca3e128b3ac68405a5120577144d1607e4da7))

## [1.64.1](https://github.com/joist-orm/joist-orm/compare/v1.64.0...v1.64.1) (2023-03-22)


### Bug Fixes

* Drop unnecessary soft-deleted conditions. ([#579](https://github.com/joist-orm/joist-orm/issues/579)) ([21670b3](https://github.com/joist-orm/joist-orm/commit/21670b388303d726f97326656ea63032a7eb8d60))

# [1.64.0](https://github.com/joist-orm/joist-orm/compare/v1.63.4...v1.64.0) (2023-03-22)


### Features

* added assertLoaded and ensureWithLoaded, repurposed ensureLoaded, renamed ensureLoadedThen to maybePopulateThen ([#578](https://github.com/joist-orm/joist-orm/issues/578)) ([b3eb908](https://github.com/joist-orm/joist-orm/commit/b3eb908301554c3962e5aa9c849da3f91d615b6a))

## [1.63.4](https://github.com/joist-orm/joist-orm/compare/v1.63.3...v1.63.4) (2023-03-22)


### Bug Fixes

* Fix forceReload with o2ms. ([#577](https://github.com/joist-orm/joist-orm/issues/577)) ([13c57d0](https://github.com/joist-orm/joist-orm/commit/13c57d0a768db4fb361e7295b94cd34d0e5b54b9))

## [1.63.3](https://github.com/joist-orm/joist-orm/compare/v1.63.2...v1.63.3) (2023-03-22)


### Bug Fixes

* Fix m2m reload failing up on new entities. ([#576](https://github.com/joist-orm/joist-orm/issues/576)) ([6bbcfe1](https://github.com/joist-orm/joist-orm/commit/6bbcfe1e2ce6870770eadac4a92e67628aaff8cf))

## [1.63.2](https://github.com/joist-orm/joist-orm/compare/v1.63.1...v1.63.2) (2023-03-21)


### Bug Fixes

* Set declarationMap. ([#575](https://github.com/joist-orm/joist-orm/issues/575)) ([e299201](https://github.com/joist-orm/joist-orm/commit/e299201a3ba00ebcfd7089ebf97c17eb651506fb))

## [1.63.1](https://github.com/joist-orm/joist-orm/compare/v1.63.0...v1.63.1) (2023-03-21)


### Bug Fixes

* Add softDeletes option to findOrCreate. ([#574](https://github.com/joist-orm/joist-orm/issues/574)) ([9841226](https://github.com/joist-orm/joist-orm/commit/98412261ec31302d1b08ece2cac798c81276e621))

# [1.63.0](https://github.com/joist-orm/joist-orm/compare/v1.62.0...v1.63.0) (2023-03-19)


### Features

* Teach em.find to filter soft deletes. ([#572](https://github.com/joist-orm/joist-orm/issues/572)) ([2e9b270](https://github.com/joist-orm/joist-orm/commit/2e9b2701e7ad84ac30d0366e1feec641b6187461))

# [1.62.0](https://github.com/joist-orm/joist-orm/compare/v1.61.1...v1.62.0) (2023-03-19)


### Features

* Support loading lens via SQL joins ([#568](https://github.com/joist-orm/joist-orm/issues/568)) ([9869a1f](https://github.com/joist-orm/joist-orm/commit/9869a1fa5667669d793f2596bd77f6020cb52f2d))

## [1.61.1](https://github.com/joist-orm/joist-orm/compare/v1.61.0...v1.61.1) (2023-03-14)


### Bug Fixes

* Align EntityGraphQL filter with EntityFilter. ([#565](https://github.com/joist-orm/joist-orm/issues/565)) ([28ceb83](https://github.com/joist-orm/joist-orm/commit/28ceb830ea441929f8474d704ff368e2ea9f0464))

# [1.61.0](https://github.com/joist-orm/joist-orm/compare/v1.60.1...v1.61.0) (2023-03-13)


### Features

* Add EntityManager.loadFromRows. ([#564](https://github.com/joist-orm/joist-orm/issues/564)) ([e1e2aba](https://github.com/joist-orm/joist-orm/commit/e1e2aba1edf6915825319c921925039ab82557be))

## [1.60.1](https://github.com/joist-orm/joist-orm/compare/v1.60.0...v1.60.1) (2023-03-11)


### Bug Fixes

* Allow pruning complex conditions if any are undefined. ([#563](https://github.com/joist-orm/joist-orm/issues/563)) ([72205b2](https://github.com/joist-orm/joist-orm/commit/72205b22f785655fdd73c450e6fb59364e931430))

# [1.60.0](https://github.com/joist-orm/joist-orm/compare/v1.59.0...v1.60.0) (2023-03-11)


### Features

* Add pruning to complex conditions. ([#562](https://github.com/joist-orm/joist-orm/issues/562)) ([6fe8cb2](https://github.com/joist-orm/joist-orm/commit/6fe8cb203be42e6030c9e4193a8bc5b67330c9b8))

# [1.59.0](https://github.com/joist-orm/joist-orm/compare/v1.58.3...v1.59.0) (2023-03-11)


### Features

* Add m2m support to em.find. ([#561](https://github.com/joist-orm/joist-orm/issues/561)) ([119ed02](https://github.com/joist-orm/joist-orm/commit/119ed02be5c0ef06861063995743be02f23bcefc))

## [1.58.3](https://github.com/joist-orm/joist-orm/compare/v1.58.2...v1.58.3) (2023-03-08)


### Bug Fixes

* Fix bad import that led to 'any' typing. ([#560](https://github.com/joist-orm/joist-orm/issues/560)) ([9d24a5c](https://github.com/joist-orm/joist-orm/commit/9d24a5ca302b7343dcf7a1cb6d7803291cad0f3d))

## [1.58.2](https://github.com/joist-orm/joist-orm/compare/v1.58.1...v1.58.2) (2023-03-06)


### Bug Fixes

* Allow non-GQL find queries to use pruning. ([#559](https://github.com/joist-orm/joist-orm/issues/559)) ([4fd67bd](https://github.com/joist-orm/joist-orm/commit/4fd67bda8628f3816867a0bbf552b7381e714010))

## [1.58.1](https://github.com/joist-orm/joist-orm/compare/v1.58.0...v1.58.1) (2023-03-06)


### Bug Fixes

* Forgot to add o2ms to the GraphQL filters. ([#558](https://github.com/joist-orm/joist-orm/issues/558)) ([345ca11](https://github.com/joist-orm/joist-orm/commit/345ca118950b2c00846ca81c874f7ef26d724d53))

# [1.58.0](https://github.com/joist-orm/joist-orm/compare/v1.57.2...v1.58.0) (2023-03-06)


### Features

* Add nin filter. ([#557](https://github.com/joist-orm/joist-orm/issues/557)) ([d8fe13b](https://github.com/joist-orm/joist-orm/commit/d8fe13be7428eecb59b5a6068d4066c86b55417f))

## [1.57.2](https://github.com/joist-orm/joist-orm/compare/v1.57.1...v1.57.2) (2023-03-06)


### Bug Fixes

* Allow `in` values to be undefined. ([#555](https://github.com/joist-orm/joist-orm/issues/555)) ([b3ddaec](https://github.com/joist-orm/joist-orm/commit/b3ddaecbb355a548f34e4e1389d16232c1b4966b))

## [1.57.1](https://github.com/joist-orm/joist-orm/compare/v1.57.0...v1.57.1) (2023-03-04)


### Bug Fixes

* utils import ([#554](https://github.com/joist-orm/joist-orm/issues/554)) ([1ae25ca](https://github.com/joist-orm/joist-orm/commit/1ae25ca59d3d46cce56e932c1baba68b9e5968e4))

# [1.57.0](https://github.com/joist-orm/joist-orm/compare/v1.56.4...v1.57.0) (2023-03-03)


### Features

* Allow aliases to be entity filters. ([#553](https://github.com/joist-orm/joist-orm/issues/553)) ([5815d0c](https://github.com/joist-orm/joist-orm/commit/5815d0cf38d6ff64956bcef03dfb8ba7707c68fe))

## [1.56.4](https://github.com/joist-orm/joist-orm/compare/v1.56.3...v1.56.4) (2023-03-03)


### Bug Fixes

* Allow keeping only explicit aliases. ([#552](https://github.com/joist-orm/joist-orm/issues/552)) ([8f290ab](https://github.com/joist-orm/joist-orm/commit/8f290ab4c3043ebc13ce0204e680401848835ae3))

## [1.56.3](https://github.com/joist-orm/joist-orm/compare/v1.56.2...v1.56.3) (2023-03-03)


### Bug Fixes

* Allow buildQuery to keep joins. ([#551](https://github.com/joist-orm/joist-orm/issues/551)) ([659f4d6](https://github.com/joist-orm/joist-orm/commit/659f4d6e24d39b657960f141852163bb54ff307f))

## [1.56.2](https://github.com/joist-orm/joist-orm/compare/v1.56.1...v1.56.2) (2023-03-03)


### Bug Fixes

* Fix date filtering. ([#550](https://github.com/joist-orm/joist-orm/issues/550)) ([f577e80](https://github.com/joist-orm/joist-orm/commit/f577e80d1ceedbf90a18668f0463b66d612088d2))

## [1.56.1](https://github.com/joist-orm/joist-orm/compare/v1.56.0...v1.56.1) (2023-03-03)


### Bug Fixes

* Allow many aliases to `aliases`. ([#549](https://github.com/joist-orm/joist-orm/issues/549)) ([82e6702](https://github.com/joist-orm/joist-orm/commit/82e6702c897fc461b4922170aa1559ebff6b673f))

# [1.56.0](https://github.com/joist-orm/joist-orm/compare/v1.55.6...v1.56.0) (2023-03-03)


### Features

* Prune unused joins. ([#548](https://github.com/joist-orm/joist-orm/issues/548)) ([060a80e](https://github.com/joist-orm/joist-orm/commit/060a80e096eaafba1563ff8e6ecea48c100790f7))

## [1.55.6](https://github.com/joist-orm/joist-orm/compare/v1.55.5...v1.55.6) (2023-03-02)


### Bug Fixes

* Fix batching order bys shouldn't distinct. ([#546](https://github.com/joist-orm/joist-orm/issues/546)) ([0ea8f86](https://github.com/joist-orm/joist-orm/commit/0ea8f867c2a89cee48ca13aba565a15783dbaf1c))

## [1.55.5](https://github.com/joist-orm/joist-orm/compare/v1.55.4...v1.55.5) (2023-03-01)


### Bug Fixes

* Fix originalValue on dates. ([#545](https://github.com/joist-orm/joist-orm/issues/545)) ([03a2c7d](https://github.com/joist-orm/joist-orm/commit/03a2c7db3d46aaa35cc92737bcafc6d654ecdb56))

## [1.55.4](https://github.com/joist-orm/joist-orm/compare/v1.55.3...v1.55.4) (2023-03-01)


### Bug Fixes

* Restore behavior of id: undefined is skipped. ([#544](https://github.com/joist-orm/joist-orm/issues/544)) ([30c857a](https://github.com/joist-orm/joist-orm/commit/30c857aa966b2664eb752b7b5c095b2ecdab406b))

## [1.55.3](https://github.com/joist-orm/joist-orm/compare/v1.55.2...v1.55.3) (2023-03-01)


### Bug Fixes

* Fix multiple order bys. ([#543](https://github.com/joist-orm/joist-orm/issues/543)) ([63b34c3](https://github.com/joist-orm/joist-orm/commit/63b34c3858bf0412b57f2b185f2b3297bec7f715))

## [1.55.2](https://github.com/joist-orm/joist-orm/compare/v1.55.1...v1.55.2) (2023-02-28)


### Bug Fixes

* Quote aliases for keywords like do. ([#542](https://github.com/joist-orm/joist-orm/issues/542)) ([604bd17](https://github.com/joist-orm/joist-orm/commit/604bd174cd5ea67a15171b9688bc2002e664c23f))

## [1.55.1](https://github.com/joist-orm/joist-orm/compare/v1.55.0...v1.55.1) (2023-02-28)


### Bug Fixes

* Fix originalValue sometimes returning an entity. ([#541](https://github.com/joist-orm/joist-orm/issues/541)) ([95162ff](https://github.com/joist-orm/joist-orm/commit/95162fff0ece9d32bb25ab5554f1dd567afddb3a))

# [1.55.0](https://github.com/joist-orm/joist-orm/compare/v1.54.0...v1.55.0) (2023-02-28)


### Features

* Support ands/ors in em.find. ([#540](https://github.com/joist-orm/joist-orm/issues/540)) ([11830fb](https://github.com/joist-orm/joist-orm/commit/11830fbd037f83dfd0d94921157f351b238be598))

# [1.54.0](https://github.com/joist-orm/joist-orm/compare/v1.53.0...v1.54.0) (2023-02-27)


### Features

* Support multiple conditions in a single filter ([#538](https://github.com/joist-orm/joist-orm/issues/538)) ([25ffd19](https://github.com/joist-orm/joist-orm/commit/25ffd1981a92ff5c0db3b97f595bb6d93fb6dfba))

# [1.53.0](https://github.com/joist-orm/joist-orm/compare/v1.52.1...v1.53.0) (2023-02-27)


### Features

* Support filtering o2ms. ([#537](https://github.com/joist-orm/joist-orm/issues/537)) ([bd594a5](https://github.com/joist-orm/joist-orm/commit/bd594a55682b30c02ade3c3e457f2e0c71daea0e))

## [1.52.1](https://github.com/joist-orm/joist-orm/compare/v1.52.0...v1.52.1) (2023-02-24)


### Bug Fixes

* Don't skip derived fields in the FieldsOf type. ([#535](https://github.com/joist-orm/joist-orm/issues/535)) ([5f4f8fe](https://github.com/joist-orm/joist-orm/commit/5f4f8feeb58f1b1fda9136240c699569f13f9e2e))

# [1.52.0](https://github.com/joist-orm/joist-orm/compare/v1.51.0...v1.52.0) (2023-02-22)


### Features

* Support filtering on base fields ([#534](https://github.com/joist-orm/joist-orm/issues/534)) ([8cb64b0](https://github.com/joist-orm/joist-orm/commit/8cb64b09615d58b6ca264a30a34485d73dbbc68c))

# [1.51.0](https://github.com/joist-orm/joist-orm/compare/v1.50.6...v1.51.0) (2023-02-22)


### Features

* Refactor QueryBuilder to use QueryParser ([#531](https://github.com/joist-orm/joist-orm/issues/531)) ([61ca6ce](https://github.com/joist-orm/joist-orm/commit/61ca6ce5bf43e7835ef6d066a9c4b6af6ce68921))

## [1.50.6](https://github.com/joist-orm/joist-orm/compare/v1.50.5...v1.50.6) (2023-02-18)


### Bug Fixes

* treat tsvector columns as text ([#532](https://github.com/joist-orm/joist-orm/issues/532)) ([f3e6c44](https://github.com/joist-orm/joist-orm/commit/f3e6c445e0c5d39daed8316356affebc9eb1fc05))

## [1.50.5](https://github.com/joist-orm/joist-orm/compare/v1.50.4...v1.50.5) (2023-02-16)


### Bug Fixes

* Fix originalValue to return the value if unchanged. ([#529](https://github.com/joist-orm/joist-orm/issues/529)) ([b44de59](https://github.com/joist-orm/joist-orm/commit/b44de5969b58aab0b5eea2b5e606474c28d0365c))

## [1.50.4](https://github.com/joist-orm/joist-orm/compare/v1.50.3...v1.50.4) (2023-02-14)


### Bug Fixes

* Add missing Const to loadFromQuery. ([#528](https://github.com/joist-orm/joist-orm/issues/528)) ([2943c98](https://github.com/joist-orm/joist-orm/commit/2943c98efa5a0d535f9861143d330975af91389e))

## [1.50.3](https://github.com/joist-orm/joist-orm/compare/v1.50.2...v1.50.3) (2023-02-13)


### Bug Fixes

* Fix nested load hints on async properties. ([#527](https://github.com/joist-orm/joist-orm/issues/527)) ([81836ef](https://github.com/joist-orm/joist-orm/commit/81836efd982442dbb6caa6ef41994ea86f6a38e3))

## [1.50.2](https://github.com/joist-orm/joist-orm/compare/v1.50.1...v1.50.2) (2023-02-10)


### Bug Fixes

* Fix getLens not filtering undefined references. ([#526](https://github.com/joist-orm/joist-orm/issues/526)) ([91ec7b1](https://github.com/joist-orm/joist-orm/commit/91ec7b1f74738a8816c88adaafabcffcb3d39f5b))

## [1.50.1](https://github.com/joist-orm/joist-orm/compare/v1.50.0...v1.50.1) (2023-02-05)


### Bug Fixes

* Re-fixes the o2m loading issue w/o a scan. ([#522](https://github.com/joist-orm/joist-orm/issues/522)) ([94de9c6](https://github.com/joist-orm/joist-orm/commit/94de9c67968d3358716b99d88855a13eb4706a2d))

# [1.50.0](https://github.com/joist-orm/joist-orm/compare/v1.49.9...v1.50.0) (2023-02-03)


### Features

* include inherited fields in graphql files ([#520](https://github.com/joist-orm/joist-orm/issues/520)) ([ed2b0d0](https://github.com/joist-orm/joist-orm/commit/ed2b0d065a12a4582b58561df66a3bf80e347d33))

## [1.49.9](https://github.com/joist-orm/joist-orm/compare/v1.49.8...v1.49.9) (2023-01-25)


### Bug Fixes

* Fix defaults for polys looking for all parent types. ([#518](https://github.com/joist-orm/joist-orm/issues/518)) ([f9c0dfc](https://github.com/joist-orm/joist-orm/commit/f9c0dfc9bbc369d03ba95ac9e4940d7297f66bec))

## [1.49.8](https://github.com/joist-orm/joist-orm/compare/v1.49.7...v1.49.8) (2023-01-25)


### Bug Fixes

* Fix setPartial a collection to undefined should be ignored. ([#517](https://github.com/joist-orm/joist-orm/issues/517)) ([3cc2f81](https://github.com/joist-orm/joist-orm/commit/3cc2f813a8091dca522f28d67d30bc2c1edbe10c))

## [1.49.7](https://github.com/joist-orm/joist-orm/compare/v1.49.6...v1.49.7) (2023-01-24)


### Bug Fixes

* Optimize em.register. ([#516](https://github.com/joist-orm/joist-orm/issues/516)) ([1bbabf2](https://github.com/joist-orm/joist-orm/commit/1bbabf2e4a85ad9419784b087378a42f42c3938e))

## [1.49.6](https://github.com/joist-orm/joist-orm/compare/v1.49.5...v1.49.6) (2023-01-24)


### Bug Fixes

* Fix repeatedly converting load hints ([#515](https://github.com/joist-orm/joist-orm/issues/515)) ([f9d16c1](https://github.com/joist-orm/joist-orm/commit/f9d16c1240a40b79c731897d49d4a507522221d6))

## [1.49.5](https://github.com/joist-orm/joist-orm/compare/v1.49.4...v1.49.5) (2023-01-24)


### Bug Fixes

* Lazy init cascadeDelete and addedBeforeLoaded. ([#513](https://github.com/joist-orm/joist-orm/issues/513)) ([2ef2313](https://github.com/joist-orm/joist-orm/commit/2ef23137b847e255c46b33a7ba759d9ed3e43e1d))

## [1.49.4](https://github.com/joist-orm/joist-orm/compare/v1.49.3...v1.49.4) (2023-01-24)


### Bug Fixes

* Fix performance issue into o2m.addedBeforeLoaded handling. ([#511](https://github.com/joist-orm/joist-orm/issues/511)) ([dd86e03](https://github.com/joist-orm/joist-orm/commit/dd86e03390adc86283dc21c65cf5ecbba3362d46))

## [1.49.3](https://github.com/joist-orm/joist-orm/compare/v1.49.2...v1.49.3) (2023-01-24)


### Bug Fixes

* Fix default values for fields in base types. ([#510](https://github.com/joist-orm/joist-orm/issues/510)) ([d0ddc2e](https://github.com/joist-orm/joist-orm/commit/d0ddc2e38953df47c47d180008ab2c2418962be0))

## [1.49.2](https://github.com/joist-orm/joist-orm/compare/v1.49.1...v1.49.2) (2023-01-23)


### Bug Fixes

* Fix initial calc of subtype-only derived values. ([#509](https://github.com/joist-orm/joist-orm/issues/509)) ([f939746](https://github.com/joist-orm/joist-orm/commit/f9397461dca75628dd48dabd2b90cf32502099fe))

## [1.49.1](https://github.com/joist-orm/joist-orm/compare/v1.49.0...v1.49.1) (2023-01-22)


### Bug Fixes

* Fix hard deletes showing up in toMatchEntity. ([#508](https://github.com/joist-orm/joist-orm/issues/508)) ([f1fc186](https://github.com/joist-orm/joist-orm/commit/f1fc186c2bf29e292d25d3854e9c228f75a97d20))

# [1.49.0](https://github.com/joist-orm/joist-orm/compare/v1.48.2...v1.49.0) (2023-01-22)


### Features

* Add useFactoryDefaults escape hatch. ([#507](https://github.com/joist-orm/joist-orm/issues/507)) ([5ef5000](https://github.com/joist-orm/joist-orm/commit/5ef500024c72d9b73c813f7442d327170edc5101))

## [1.48.2](https://github.com/joist-orm/joist-orm/compare/v1.48.1...v1.48.2) (2023-01-22)


### Bug Fixes

* Fix reactive rules on subtypes. ([#506](https://github.com/joist-orm/joist-orm/issues/506)) ([7dca97a](https://github.com/joist-orm/joist-orm/commit/7dca97a30d7a3c79ce9c4a110b34da6b46121581))

## [1.48.1](https://github.com/joist-orm/joist-orm/compare/v1.48.0...v1.48.1) (2023-01-22)


### Bug Fixes

* Fix derived fields on subtypes. ([#505](https://github.com/joist-orm/joist-orm/issues/505)) ([cafd95a](https://github.com/joist-orm/joist-orm/commit/cafd95ae92101f91fda5b1b9d62b7214e8e5116c))

# [1.48.0](https://github.com/joist-orm/joist-orm/compare/v1.47.3...v1.48.0) (2023-01-22)


### Features

* Bump TypeScript output to ES2022. ([#504](https://github.com/joist-orm/joist-orm/issues/504)) ([e27bb32](https://github.com/joist-orm/joist-orm/commit/e27bb324b7fbc8efa08ef5af2402d7c1b37c455b))

## [1.47.3](https://github.com/joist-orm/joist-orm/compare/v1.47.2...v1.47.3) (2023-01-21)


### Bug Fixes

* Fix load hints on base properties. ([#503](https://github.com/joist-orm/joist-orm/issues/503)) ([8d2d849](https://github.com/joist-orm/joist-orm/commit/8d2d84961cb258c807420056492ee52a269664e0))

## [1.47.2](https://github.com/joist-orm/joist-orm/compare/v1.47.1...v1.47.2) (2023-01-21)


### Bug Fixes

* Fixes for 'changes' when using inheritance. ([#501](https://github.com/joist-orm/joist-orm/issues/501)) ([fbc8594](https://github.com/joist-orm/joist-orm/commit/fbc85943ac664108452273e22f08f73c2c7ce302))

## [1.47.1](https://github.com/joist-orm/joist-orm/compare/v1.47.0...v1.47.1) (2023-01-17)


### Bug Fixes

* Tests setting undefined should always win. ([#500](https://github.com/joist-orm/joist-orm/issues/500)) ([9c90a37](https://github.com/joist-orm/joist-orm/commit/9c90a37f48c68bf2037d857c26bd6f674a6aaf70))

# [1.47.0](https://github.com/joist-orm/joist-orm/compare/v1.46.2...v1.47.0) (2023-01-16)


### Features

* Let newTestInstance deep merge opts. ([#499](https://github.com/joist-orm/joist-orm/issues/499)) ([ebcb210](https://github.com/joist-orm/joist-orm/commit/ebcb21003909f802b607f0e003b90acead393922))

## [1.46.2](https://github.com/joist-orm/joist-orm/compare/v1.46.1...v1.46.2) (2023-01-11)


### Bug Fixes

* Run rules/hooks on subtypes. ([#496](https://github.com/joist-orm/joist-orm/issues/496)) ([ff05b01](https://github.com/joist-orm/joist-orm/commit/ff05b01ec072fe9abb32358a36e4bc593db32258))

## [1.46.1](https://github.com/joist-orm/joist-orm/compare/v1.46.0...v1.46.1) (2023-01-09)


### Bug Fixes

* Fix o2m duplication in clone. ([#495](https://github.com/joist-orm/joist-orm/issues/495)) ([d4f792d](https://github.com/joist-orm/joist-orm/commit/d4f792d56c395696512f2b92c03598e3c586c880))

# [1.46.0](https://github.com/joist-orm/joist-orm/compare/v1.45.0...v1.46.0) (2023-01-03)


### Features

* Remove the hash versions from codegen files. ([#493](https://github.com/joist-orm/joist-orm/issues/493)) ([c596b5d](https://github.com/joist-orm/joist-orm/commit/c596b5dfe12c330b39f34c685eb5b29530b7b9fa))

# [1.45.0](https://github.com/joist-orm/joist-orm/compare/v1.44.3...v1.45.0) (2023-01-03)


### Features

* Support abstract base types. ([#492](https://github.com/joist-orm/joist-orm/issues/492)) ([930873f](https://github.com/joist-orm/joist-orm/commit/930873f77db5bbcea0cb5deaa2bab43fa3aaf675))

## [1.44.3](https://github.com/joist-orm/joist-orm/compare/v1.44.2...v1.44.3) (2023-01-03)


### Bug Fixes

* Skip the suffix for the first abbreviation. ([#490](https://github.com/joist-orm/joist-orm/issues/490)) ([555a425](https://github.com/joist-orm/joist-orm/commit/555a4257fab205136eb79335ef1bf6fe0da008b7))

## [1.44.2](https://github.com/joist-orm/joist-orm/compare/v1.44.1...v1.44.2) (2023-01-02)


### Bug Fixes

* Revert q&d attempt at cross-table em.find support. ([#488](https://github.com/joist-orm/joist-orm/issues/488)) ([c26cbf7](https://github.com/joist-orm/joist-orm/commit/c26cbf74ed67dda932740ff029c6007726b01884))

## [1.44.1](https://github.com/joist-orm/joist-orm/compare/v1.44.0...v1.44.1) (2023-01-02)


### Bug Fixes

* Bump dependencies. ([#486](https://github.com/joist-orm/joist-orm/issues/486)) ([3a5bfa0](https://github.com/joist-orm/joist-orm/commit/3a5bfa0ec3159efcd463ae5859e204ecf0b42110))

# [1.44.0](https://github.com/joist-orm/joist-orm/compare/v1.43.0...v1.44.0) (2023-01-02)


### Features

* Implement Class Table Inheritance ([#484](https://github.com/joist-orm/joist-orm/issues/484)) ([5107267](https://github.com/joist-orm/joist-orm/commit/5107267c7bdc05f2f12c8991d0e76425117419d9))

# [1.43.0](https://github.com/joist-orm/joist-orm/compare/v1.42.4...v1.43.0) (2022-12-17)


### Features

* Support pretty-but-hard-coded messages for constraint failures. ([#483](https://github.com/joist-orm/joist-orm/issues/483)) ([f1c954d](https://github.com/joist-orm/joist-orm/commit/f1c954d154c5006c4f26515aec42ce907ae076f5)), closes [#243](https://github.com/joist-orm/joist-orm/issues/243)

## [1.42.4](https://github.com/joist-orm/joist-orm/compare/v1.42.3...v1.42.4) (2022-12-15)


### Bug Fixes

* Populate through soft-deleted collections. ([#482](https://github.com/joist-orm/joist-orm/issues/482)) ([92158dc](https://github.com/joist-orm/joist-orm/commit/92158dc5f2587ea923b53332dc1c87b6e2b2445b))

## [1.42.3](https://github.com/joist-orm/joist-orm/compare/v1.42.2...v1.42.3) (2022-12-14)


### Bug Fixes

* Fix toMatchEntity in type union scenarios. ([#481](https://github.com/joist-orm/joist-orm/issues/481)) ([a593b58](https://github.com/joist-orm/joist-orm/commit/a593b58738dcf689df08c86e71a99b0bd783b869))

## [1.42.2](https://github.com/joist-orm/joist-orm/compare/v1.42.1...v1.42.2) (2022-12-14)


### Bug Fixes

* Update toMatchEntity to include soft-deleted entities. ([#480](https://github.com/joist-orm/joist-orm/issues/480)) ([8fafe4f](https://github.com/joist-orm/joist-orm/commit/8fafe4fd51f3270c54de911e59f43c4714d6b69d))

## [1.42.1](https://github.com/joist-orm/joist-orm/compare/v1.42.0...v1.42.1) (2022-12-14)


### Bug Fixes

* Don't skip soft-deleted entity in m2o.get. ([#478](https://github.com/joist-orm/joist-orm/issues/478)) ([f0d6f2a](https://github.com/joist-orm/joist-orm/commit/f0d6f2aaa01ea640324e5dcda5be3bf0a4c87832))

# [1.42.0](https://github.com/joist-orm/joist-orm/compare/v1.41.0...v1.42.0) (2022-12-14)


### Features

* Automatically filter soft-deleted entities. ([#477](https://github.com/joist-orm/joist-orm/issues/477)) ([a8f4131](https://github.com/joist-orm/joist-orm/commit/a8f41319e4d1b36fd592944ee5111d8bcfb08c13))

# [1.41.0](https://github.com/joist-orm/joist-orm/compare/v1.40.0...v1.41.0) (2022-12-06)


### Features

* Rename joist-codegen.json to joist-config.json. ([#475](https://github.com/joist-orm/joist-orm/issues/475)) ([37ba4bb](https://github.com/joist-orm/joist-orm/commit/37ba4bb6495d922bfba1164f96a776db2cd470e8))

# [1.40.0](https://github.com/joist-orm/joist-orm/compare/v1.39.2...v1.40.0) (2022-11-29)


### Features

* Add minValueRule, maxValueRule and rangeValueRule ([#474](https://github.com/joist-orm/joist-orm/issues/474)) ([3788191](https://github.com/joist-orm/joist-orm/commit/37881915ae0085c5c7e22e3ebdf15a31f8c192bd))

## [1.39.2](https://github.com/joist-orm/joist-orm/compare/v1.39.1...v1.39.2) (2022-11-27)


### Bug Fixes

* Bump ts-poet for perf improvements. ([#473](https://github.com/joist-orm/joist-orm/issues/473)) ([eca6fd9](https://github.com/joist-orm/joist-orm/commit/eca6fd98c917704f015577ed3da889b3453f4721))

## [1.39.1](https://github.com/joist-orm/joist-orm/compare/v1.39.0...v1.39.1) (2022-11-19)


### Bug Fixes

* Forgot to export withLoaded. ([63820bf](https://github.com/joist-orm/joist-orm/commit/63820bf06b5657ca030883d507f02c5d884de850))

# [1.39.0](https://github.com/joist-orm/joist-orm/compare/v1.38.0...v1.39.0) (2022-11-19)


### Features

* Upstream withLoaded utility. ([#472](https://github.com/joist-orm/joist-orm/issues/472)) ([d4cddec](https://github.com/joist-orm/joist-orm/commit/d4cddec0d4812678388a084c80a60511fe78fba0))

# [1.38.0](https://github.com/joist-orm/joist-orm/compare/v1.37.10...v1.38.0) (2022-11-17)


### Features

* Bump typescript. ([#471](https://github.com/joist-orm/joist-orm/issues/471)) ([942dbef](https://github.com/joist-orm/joist-orm/commit/942dbef0173bf0756f46528af48e2d4a4802f4a8))

## [1.37.10](https://github.com/joist-orm/joist-orm/compare/v1.37.9...v1.37.10) (2022-11-15)


### Bug Fixes

* Corrctly handle partial unique indexes ([#469](https://github.com/joist-orm/joist-orm/issues/469)) ([4f7d2ee](https://github.com/joist-orm/joist-orm/commit/4f7d2ee4c35c86b2aa9badf88636ddcb62843278))

## [1.37.9](https://github.com/joist-orm/joist-orm/compare/v1.37.8...v1.37.9) (2022-11-12)


### Bug Fixes

* Make metadata inaccessible via Object.keys enumeration. ([#466](https://github.com/joist-orm/joist-orm/issues/466)) ([6ca81c0](https://github.com/joist-orm/joist-orm/commit/6ca81c098dc3a3106a1e1bb2965c72b6532d55d3))

## [1.37.8](https://github.com/joist-orm/joist-orm/compare/v1.37.7...v1.37.8) (2022-11-11)


### Bug Fixes

* Fix passing different length arrays to toMatchEntity. ([#465](https://github.com/joist-orm/joist-orm/issues/465)) ([1daa131](https://github.com/joist-orm/joist-orm/commit/1daa131ed5fa1920df246f646652e63bb2dd5cc5))

## [1.37.7](https://github.com/joist-orm/joist-orm/compare/v1.37.6...v1.37.7) (2022-11-03)


### Bug Fixes

* Fix isDeletedEntity in afterCommit hooks. ([#463](https://github.com/joist-orm/joist-orm/issues/463)) ([81abe98](https://github.com/joist-orm/joist-orm/commit/81abe9840bfddf6d9be459b3d8e49226c44ab9db))

## [1.37.6](https://github.com/joist-orm/joist-orm/compare/v1.37.5...v1.37.6) (2022-10-30)


### Bug Fixes

* Issue where isLoaded does not correctly handle nullable loaded references ([#462](https://github.com/joist-orm/joist-orm/issues/462)) ([6bb105e](https://github.com/joist-orm/joist-orm/commit/6bb105ec7189a5e6b034e3151275c4c9e7b7da91))

## [1.37.5](https://github.com/joist-orm/joist-orm/compare/v1.37.4...v1.37.5) (2022-10-29)


### Bug Fixes

* Fix hasOneThrough in tests. ([#461](https://github.com/joist-orm/joist-orm/issues/461)) ([0cb9a49](https://github.com/joist-orm/joist-orm/commit/0cb9a49403267bec5f7cde1f003b2e30821a014c))

## [1.37.4](https://github.com/joist-orm/joist-orm/compare/v1.37.3...v1.37.4) (2022-10-29)


### Bug Fixes

* Fix accessing hasManyThroughs in tests. ([#460](https://github.com/joist-orm/joist-orm/issues/460)) ([ae78236](https://github.com/joist-orm/joist-orm/commit/ae7823694436dd3651ce959ed911a7b7f8ae2f79))

## [1.37.3](https://github.com/joist-orm/joist-orm/compare/v1.37.2...v1.37.3) (2022-10-26)


### Bug Fixes

* Remove some unneeded lines. ([#459](https://github.com/joist-orm/joist-orm/issues/459)) ([25bd3d9](https://github.com/joist-orm/joist-orm/commit/25bd3d9cb3c181f77a3dd7f6df7c658eddb4756e))

## [1.37.2](https://github.com/joist-orm/joist-orm/compare/v1.37.1...v1.37.2) (2022-10-24)


### Bug Fixes

* loadHints.isNew was checking for idTagged===undefined ([#458](https://github.com/joist-orm/joist-orm/issues/458)) ([3d1fd96](https://github.com/joist-orm/joist-orm/commit/3d1fd96a4b3416d435d48abae29925bf237a8625))

## [1.37.1](https://github.com/joist-orm/joist-orm/compare/v1.37.0...v1.37.1) (2022-10-23)


### Bug Fixes

* Ensure that sameEntity works even if an ID has been assigned to a new entity ([#457](https://github.com/joist-orm/joist-orm/issues/457)) ([8b20b04](https://github.com/joist-orm/joist-orm/commit/8b20b04102e02f067c020e8edeacfccb8b7f9592))

# [1.37.0](https://github.com/joist-orm/joist-orm/compare/v1.36.3...v1.37.0) (2022-10-23)


### Features

* Add EntityManager.assignNewIds capability ([#452](https://github.com/joist-orm/joist-orm/issues/452)) ([4cd7362](https://github.com/joist-orm/joist-orm/commit/4cd7362f7caa98e26fc09b50f9ba03401e5b774b))

## [1.36.3](https://github.com/joist-orm/joist-orm/compare/v1.36.2...v1.36.3) (2022-10-21)


### Bug Fixes

* Fix getCallerName when running via tsx. ([#444](https://github.com/joist-orm/joist-orm/issues/444)) ([6aeb2e9](https://github.com/joist-orm/joist-orm/commit/6aeb2e963af32ba2ac4de9dc3e9505b30dcceb6f))

## [1.36.2](https://github.com/joist-orm/joist-orm/compare/v1.36.1...v1.36.2) (2022-10-17)


### Bug Fixes

* Fix calling isLoaded with the wrong hint. ([#443](https://github.com/joist-orm/joist-orm/issues/443)) ([38cf101](https://github.com/joist-orm/joist-orm/commit/38cf101c6d6864cee523cbc18c0aaf05e529afec))

## [1.36.1](https://github.com/joist-orm/joist-orm/compare/v1.36.0...v1.36.1) (2022-10-17)


### Bug Fixes

* Avoid errors when async properties are wip. ([#442](https://github.com/joist-orm/joist-orm/issues/442)) ([344dcaf](https://github.com/joist-orm/joist-orm/commit/344dcaf955eb1cf3af4964bedaf9e0ae1c972dcc))

# [1.36.0](https://github.com/joist-orm/joist-orm/compare/v1.35.3...v1.36.0) (2022-10-14)


### Features

* Make toMatchEntity sync. ([#440](https://github.com/joist-orm/joist-orm/issues/440)) ([4d082dd](https://github.com/joist-orm/joist-orm/commit/4d082dd1686aeed8df2ab194d014aa4b9e2fdb84)), closes [#267](https://github.com/joist-orm/joist-orm/issues/267)

## [1.35.3](https://github.com/joist-orm/joist-orm/compare/v1.35.2...v1.35.3) (2022-10-13)


### Bug Fixes

* Fix toMatchEntity against undefined. ([#439](https://github.com/joist-orm/joist-orm/issues/439)) ([969700b](https://github.com/joist-orm/joist-orm/commit/969700b39557e1fc5fc4039171d6c418924923dd))

## [1.35.2](https://github.com/joist-orm/joist-orm/compare/v1.35.1...v1.35.2) (2022-10-13)


### Bug Fixes

* Allow toMatchEntity to work on object literals. ([#438](https://github.com/joist-orm/joist-orm/issues/438)) ([571fb65](https://github.com/joist-orm/joist-orm/commit/571fb659f6095466a27c69adfc1347056f8c100e))

## [1.35.1](https://github.com/joist-orm/joist-orm/compare/v1.35.0...v1.35.1) (2022-10-13)


### Bug Fixes

* Fix multiple em.flushes in tests with frozen time. ([#437](https://github.com/joist-orm/joist-orm/issues/437)) ([5508439](https://github.com/joist-orm/joist-orm/commit/5508439cb064c6399d7dbd394083d4a354f9c565))

# [1.35.0](https://github.com/joist-orm/joist-orm/compare/v1.34.2...v1.35.0) (2022-10-04)


### Features

* Calling o2m.set(values) deletes owned children ([#435](https://github.com/joist-orm/joist-orm/issues/435)) ([bd1f0b3](https://github.com/joist-orm/joist-orm/commit/bd1f0b344843c2c094317207bc04806992562fa2))

## [1.34.2](https://github.com/joist-orm/joist-orm/compare/v1.34.1...v1.34.2) (2022-10-04)


### Bug Fixes

* Keep deleted children createOrUpdatePartial. ([#434](https://github.com/joist-orm/joist-orm/issues/434)) ([b7a0f29](https://github.com/joist-orm/joist-orm/commit/b7a0f29e9aa5b5f1fd3c2cd855fb8271099de39a))

## [1.34.1](https://github.com/joist-orm/joist-orm/compare/v1.34.0...v1.34.1) (2022-10-04)


### Bug Fixes

* Don't drop mid-string entity names. ([#433](https://github.com/joist-orm/joist-orm/issues/433)) ([e17ade8](https://github.com/joist-orm/joist-orm/commit/e17ade8ba66d07adf3b3b6b710c7706186224ec4))

# [1.34.0](https://github.com/joist-orm/joist-orm/compare/v1.33.5...v1.34.0) (2022-10-03)


### Features

* Support async properties in reactive hints. ([#432](https://github.com/joist-orm/joist-orm/issues/432)) ([57fd515](https://github.com/joist-orm/joist-orm/commit/57fd5158839895bdc9178d1a57f9a8b6e1a58944))

## [1.33.5](https://github.com/joist-orm/joist-orm/compare/v1.33.4...v1.33.5) (2022-09-30)


### Bug Fixes

* Fix PersistedAsyncProperties in DeepNew. ([#430](https://github.com/joist-orm/joist-orm/issues/430)) ([4aa9bd9](https://github.com/joist-orm/joist-orm/commit/4aa9bd99022ec5ee8ab59c519513121f3a38aab2)), closes [#371](https://github.com/joist-orm/joist-orm/issues/371)

## [1.33.4](https://github.com/joist-orm/joist-orm/compare/v1.33.3...v1.33.4) (2022-09-28)


### Bug Fixes

* Always populate to handle mutations in the graph. ([#429](https://github.com/joist-orm/joist-orm/issues/429)) ([6faa7ac](https://github.com/joist-orm/joist-orm/commit/6faa7ac2a4af567f53ea838e9338baaa895c331d))

## [1.33.3](https://github.com/joist-orm/joist-orm/compare/v1.33.2...v1.33.3) (2022-09-27)


### Bug Fixes

* Fix EntityManager.populate not checking loadMany ([#418](https://github.com/joist-orm/joist-orm/issues/418)) ([8c299f7](https://github.com/joist-orm/joist-orm/commit/8c299f7a80d570bc35b4e821b0c187a2501563dd))

## [1.33.2](https://github.com/joist-orm/joist-orm/compare/v1.33.1...v1.33.2) (2022-09-23)


### Bug Fixes

* Fix export import. ([#428](https://github.com/joist-orm/joist-orm/issues/428)) ([15150bd](https://github.com/joist-orm/joist-orm/commit/15150bd0668d61c3640659c2ba00f114006d5022))

## [1.33.1](https://github.com/joist-orm/joist-orm/compare/v1.33.0...v1.33.1) (2022-09-23)


### Bug Fixes

* Add makeRun to allow custom newContext functions. ([#427](https://github.com/joist-orm/joist-orm/issues/427)) ([4dd3739](https://github.com/joist-orm/joist-orm/commit/4dd373909faf13b2395287f0c6fa955850699083))

# [1.33.0](https://github.com/joist-orm/joist-orm/compare/v1.32.2...v1.33.0) (2022-09-23)


### Features

* Extract graphql-resolver-utils. ([#425](https://github.com/joist-orm/joist-orm/issues/425)) ([f5686e1](https://github.com/joist-orm/joist-orm/commit/f5686e1a6c85a9abcde8df273eb94b0608bab1ce))

## [1.32.2](https://github.com/joist-orm/joist-orm/compare/v1.32.1...v1.32.2) (2022-09-22)


### Bug Fixes

* Do not reuse entities that have unique constraints. ([#424](https://github.com/joist-orm/joist-orm/issues/424)) ([bc098e2](https://github.com/joist-orm/joist-orm/commit/bc098e2feb2f7dfa2d4f1e37cf6f099698ad8304))

## [1.32.1](https://github.com/joist-orm/joist-orm/compare/v1.32.0...v1.32.1) (2022-09-21)


### Bug Fixes

* Support PersistedAsyncProperties in toMatchEntity. ([#422](https://github.com/joist-orm/joist-orm/issues/422)) ([f781ed7](https://github.com/joist-orm/joist-orm/commit/f781ed731da4d8da5fd0f0721468f427d90c2aca))

# [1.32.0](https://github.com/joist-orm/joist-orm/compare/v1.31.0...v1.32.0) (2022-09-21)


### Features

* Add ability to pass options when creating a many-to-many table ([#421](https://github.com/joist-orm/joist-orm/issues/421)) ([fba7b4a](https://github.com/joist-orm/joist-orm/commit/fba7b4ae8862def2a0c316de27d9494402edc4ee))

# [1.31.0](https://github.com/joist-orm/joist-orm/compare/v1.30.2...v1.31.0) (2022-09-20)


### Features

* Support AsyncProperty in toMatchEntity. ([#420](https://github.com/joist-orm/joist-orm/issues/420)) ([8d4415f](https://github.com/joist-orm/joist-orm/commit/8d4415fc25b76e919c628498b8b68c17ab12aa00))

## [1.30.2](https://github.com/joist-orm/joist-orm/compare/v1.30.1...v1.30.2) (2022-09-18)


### Bug Fixes

* Fix enums resolver w/no enums. ([#419](https://github.com/joist-orm/joist-orm/issues/419)) ([eb34845](https://github.com/joist-orm/joist-orm/commit/eb34845cc4522918daf049d1725d1c635a9af57c))

## [1.30.1](https://github.com/joist-orm/joist-orm/compare/v1.30.0...v1.30.1) (2022-09-14)


### Bug Fixes

* Fix populate performance ([#417](https://github.com/joist-orm/joist-orm/issues/417)) ([249e437](https://github.com/joist-orm/joist-orm/commit/249e437d0fbc36398346ba77ea8e13c68ff02931))

# [1.30.0](https://github.com/joist-orm/joist-orm/compare/v1.29.1...v1.30.0) (2022-09-08)


### Features

* Enhanced support for reversing polymorphic references and reacting to changes through them ([#414](https://github.com/joist-orm/joist-orm/issues/414)) ([c653344](https://github.com/joist-orm/joist-orm/commit/c653344441c942f2dca70298db7bd3ae2ae119e2))

## [1.29.1](https://github.com/joist-orm/joist-orm/compare/v1.29.0...v1.29.1) (2022-09-03)


### Bug Fixes

* Don't include jsonb fields in GraphQL scaffolding. ([#412](https://github.com/joist-orm/joist-orm/issues/412)) ([c291345](https://github.com/joist-orm/joist-orm/commit/c291345123b5b09e425b3a1c8ab05c3ac04a4522))

# [1.29.0](https://github.com/joist-orm/joist-orm/compare/v1.28.8...v1.29.0) (2022-09-02)


### Features

* Use ts-poet saveFiles for conditional formatting. ([#411](https://github.com/joist-orm/joist-orm/issues/411)) ([652af21](https://github.com/joist-orm/joist-orm/commit/652af21509ca3a99159f7087ef26a1783625697e))

## [1.28.8](https://github.com/joist-orm/joist-orm/compare/v1.28.7...v1.28.8) (2022-08-27)


### Bug Fixes

* Bump ts-poet for more prettier-ish. ([#409](https://github.com/joist-orm/joist-orm/issues/409)) ([52c9d30](https://github.com/joist-orm/joist-orm/commit/52c9d3002fc6c2c29fcc7116135535778c07f9a6))

## [1.28.7](https://github.com/joist-orm/joist-orm/compare/v1.28.6...v1.28.7) (2022-08-27)


### Bug Fixes

* Bump ts-poet to use @dprint/typescript directly. ([#408](https://github.com/joist-orm/joist-orm/issues/408)) ([a52bb70](https://github.com/joist-orm/joist-orm/commit/a52bb70666caed305597f2c37e113c8bebda3da2))

## [1.28.6](https://github.com/joist-orm/joist-orm/compare/v1.28.5...v1.28.6) (2022-08-27)


### Bug Fixes

* Use @dprint/json for config and history files. ([#407](https://github.com/joist-orm/joist-orm/issues/407)) ([72ef834](https://github.com/joist-orm/joist-orm/commit/72ef83494f950a950b52e5db0d4a5644123ef198))

## [1.28.5](https://github.com/joist-orm/joist-orm/compare/v1.28.4...v1.28.5) (2022-08-27)


### Bug Fixes

* Fix quoting column names like 'order'. ([#404](https://github.com/joist-orm/joist-orm/issues/404)) ([f235bec](https://github.com/joist-orm/joist-orm/commit/f235becd70ac72ae2529a6123413976d4ce072ab))

## [1.28.4](https://github.com/joist-orm/joist-orm/compare/v1.28.3...v1.28.4) (2022-08-26)


### Bug Fixes

* Use dprint preferSingleLine. ([#403](https://github.com/joist-orm/joist-orm/issues/403)) ([b4fa2e6](https://github.com/joist-orm/joist-orm/commit/b4fa2e6ade1cea568a8b87a09e33c59d53a9a87b))

## [1.28.3](https://github.com/joist-orm/joist-orm/compare/v1.28.2...v1.28.3) (2022-08-26)


### Bug Fixes

* Remove unnest approach to avoid txn conflicts. ([#402](https://github.com/joist-orm/joist-orm/issues/402)) ([e0a775c](https://github.com/joist-orm/joist-orm/commit/e0a775c16770cc28d35df85ab84228293b4d489b))

## [1.28.2](https://github.com/joist-orm/joist-orm/compare/v1.28.1...v1.28.2) (2022-08-26)


### Bug Fixes

* Slightly change how we guess GraphQL types. ([#401](https://github.com/joist-orm/joist-orm/issues/401)) ([6edffb9](https://github.com/joist-orm/joist-orm/commit/6edffb96af94b0f3bce2216a83271aedc3c4ffb5))

## [1.28.1](https://github.com/joist-orm/joist-orm/compare/v1.28.0...v1.28.1) (2022-08-26)


### Bug Fixes

* Re-codegen w/dprint. ([#400](https://github.com/joist-orm/joist-orm/issues/400)) ([9f824ab](https://github.com/joist-orm/joist-orm/commit/9f824abf1ada878051c0101088ccb6482e95c4d0))

# [1.28.0](https://github.com/joist-orm/joist-orm/compare/v1.27.1...v1.28.0) (2022-08-26)


### Features

* Bump ts-poet for dprint. ([#399](https://github.com/joist-orm/joist-orm/issues/399)) ([2c24cf8](https://github.com/joist-orm/joist-orm/commit/2c24cf8d87a51e9beb77827368c4be40de759fb9))

## [1.27.1](https://github.com/joist-orm/joist-orm/compare/v1.27.0...v1.27.1) (2022-08-26)


### Bug Fixes

* Allow nullable persisted fields. ([#398](https://github.com/joist-orm/joist-orm/issues/398)) ([ed8604d](https://github.com/joist-orm/joist-orm/commit/ed8604db536ea3d2f6a68e23ada0efc37a5fa364))

# [1.27.0](https://github.com/joist-orm/joist-orm/compare/v1.26.0...v1.27.0) (2022-08-26)


### Features

* Add PersistedAsyncProperty for derived async fields. ([#397](https://github.com/joist-orm/joist-orm/issues/397)) ([61e11d5](https://github.com/joist-orm/joist-orm/commit/61e11d514a8ed4d9cf94e0c5a9097a3e1d5ae679))

# [1.26.0](https://github.com/joist-orm/joist-orm/compare/v1.25.0...v1.26.0) (2022-08-19)


### Features

* Add EntityManager.loadLens. ([#396](https://github.com/joist-orm/joist-orm/issues/396)) ([bd9e62c](https://github.com/joist-orm/joist-orm/commit/bd9e62cb0145267dbf97b3d0f649aef5dc8aa36d))

# [1.25.0](https://github.com/joist-orm/joist-orm/compare/v1.24.2...v1.25.0) (2022-08-18)


### Features

* Allow passing Loaded to functions that accept Reacted. ([#395](https://github.com/joist-orm/joist-orm/issues/395)) ([6d1013f](https://github.com/joist-orm/joist-orm/commit/6d1013f62f3b224066c7acd19ed9be74fe543e92))

## [1.24.2](https://github.com/joist-orm/joist-orm/compare/v1.24.1...v1.24.2) (2022-08-16)


### Bug Fixes

* **release:** Include test-utils. ([6c2b564](https://github.com/joist-orm/joist-orm/commit/6c2b564ffa3a0f960cd24b6f384b330ed49696b7))

## [1.24.1](https://github.com/joist-orm/joist-orm/compare/v1.24.0...v1.24.1) (2022-08-16)


### Bug Fixes

* Fix em.deletes in beforeFlush. ([#394](https://github.com/joist-orm/joist-orm/issues/394)) ([85652c6](https://github.com/joist-orm/joist-orm/commit/85652c6ada6da6d1f019ba5c5b335cd7522b75a4)), closes [#393](https://github.com/joist-orm/joist-orm/issues/393)
* Fix filtering on an entity list for IN. ([#391](https://github.com/joist-orm/joist-orm/issues/391)) ([07b86af](https://github.com/joist-orm/joist-orm/commit/07b86af5d43a6f9f657f6da7c7c9e91a6018f769))
* Fix release step. ([f4e09f9](https://github.com/joist-orm/joist-orm/commit/f4e09f99eb0d735074b14d5336c78df47072c06b))

# [1.24.0](https://github.com/joist-orm/joist-orm/compare/v1.23.0...v1.24.0) (2022-08-07)


### Features

* Add databaseUrl to joist-codegen ([#389](https://github.com/joist-orm/joist-orm/issues/389)) ([e22081c](https://github.com/joist-orm/joist-orm/commit/e22081c8ac923995f656bae8e8c54648f8baf05c)), closes [#382](https://github.com/joist-orm/joist-orm/issues/382)

# [1.23.0](https://github.com/joist-orm/joist-orm/compare/v1.22.7...v1.23.0) (2022-08-07)


### Features

* Rename TimestampConfig.optional to required. ([#387](https://github.com/joist-orm/joist-orm/issues/387)) ([d7a52d9](https://github.com/joist-orm/joist-orm/commit/d7a52d9fe9c77f34463da1beb5ab38eb970678d4))

## [1.22.7](https://github.com/joist-orm/joist-orm/compare/v1.22.6...v1.22.7) (2022-07-28)


### Bug Fixes

* Fix toMatchEntity when expected value is undefined. ([#384](https://github.com/joist-orm/joist-orm/issues/384)) ([ab3cbee](https://github.com/joist-orm/joist-orm/commit/ab3cbee26416e9745cb9b77e7ef1437ab15e4f1d))

## [1.22.6](https://github.com/joist-orm/joist-orm/compare/v1.22.5...v1.22.6) (2022-07-28)


### Bug Fixes

* Deleted entities should trigger async derived fields. ([#383](https://github.com/joist-orm/joist-orm/issues/383)) ([95acdd0](https://github.com/joist-orm/joist-orm/commit/95acdd00e3987136e5886a32e915bb8ad517b7ae))

## [1.22.5](https://github.com/joist-orm/joist-orm/compare/v1.22.4...v1.22.5) (2022-07-25)


### Bug Fixes

* Fix src import. ([#377](https://github.com/joist-orm/joist-orm/issues/377)) ([ad35d0c](https://github.com/joist-orm/joist-orm/commit/ad35d0cd8a92a0ce7a2f50e28940eaab18e1f21b))

## [1.22.4](https://github.com/joist-orm/joist-orm/compare/v1.22.3...v1.22.4) (2022-07-19)


### Bug Fixes

* Check the other side's readonly for o2m/o2o reactive hints. ([#374](https://github.com/joist-orm/joist-orm/issues/374)) ([61ccb3f](https://github.com/joist-orm/joist-orm/commit/61ccb3fc833195b27a1c9a176caeac3b2e0b9f06))

## [1.22.3](https://github.com/joist-orm/joist-orm/compare/v1.22.2...v1.22.3) (2022-07-18)


### Bug Fixes

* Correct clearing of o2m/m2o fks when entity data references the entity instead of ids ([#373](https://github.com/joist-orm/joist-orm/issues/373)) ([a1f26bd](https://github.com/joist-orm/joist-orm/commit/a1f26bd5eb0a1947bd36307ff6117ba25b3b06b5))

## [1.22.2](https://github.com/joist-orm/joist-orm/compare/v1.22.1...v1.22.2) (2022-07-12)


### Bug Fixes

* Fail better when fields are out-of-date. ([#370](https://github.com/joist-orm/joist-orm/issues/370)) ([499903f](https://github.com/joist-orm/joist-orm/commit/499903fab672dd06329e7b5e20f029d08883ed66))

## [1.22.1](https://github.com/joist-orm/joist-orm/compare/v1.22.0...v1.22.1) (2022-07-08)


### Bug Fixes

* Add readonly to id arrays. ([#367](https://github.com/joist-orm/joist-orm/issues/367)) ([a58dc8f](https://github.com/joist-orm/joist-orm/commit/a58dc8fd56ffc668edbb6f1821e764384f109d34))

# [1.22.0](https://github.com/joist-orm/joist-orm/compare/v1.21.2...v1.22.0) (2022-07-07)


### Features

* add support for querying ranges of values using between or gte/lte ([#366](https://github.com/joist-orm/joist-orm/issues/366)) ([14b0fa0](https://github.com/joist-orm/joist-orm/commit/14b0fa09b1405f6c37c2f77ea13df778453a55fc))

## [1.21.2](https://github.com/joist-orm/joist-orm/compare/v1.21.1...v1.21.2) (2022-06-29)


### Bug Fixes

* Fix async derived fields not triggering from hook changes. ([#364](https://github.com/joist-orm/joist-orm/issues/364)) ([bfb049e](https://github.com/joist-orm/joist-orm/commit/bfb049e52a3a0437506c74b46736baf9c03771ee))

## [1.21.1](https://github.com/joist-orm/joist-orm/compare/v1.21.0...v1.21.1) (2022-06-25)


### Bug Fixes

* Bump knexjs. ([70b65a3](https://github.com/joist-orm/joist-orm/commit/70b65a33e114ebe9d299f9ecf15a1dfe510d75f7))
* Bump pg, fix knexjs error. ([3c9bf16](https://github.com/joist-orm/joist-orm/commit/3c9bf16384fa0ad5e48f0f5952bd5d2e1fb0a12b))

# [1.21.0](https://github.com/joist-orm/joist-orm/compare/v1.20.0...v1.21.0) (2022-06-25)


### Features

* Recalc all async derived fields on touch. ([#363](https://github.com/joist-orm/joist-orm/issues/363)) ([2c726e5](https://github.com/joist-orm/joist-orm/commit/2c726e515342703cdb4de87b8ce388c01c1d9e19))

# [1.20.0](https://github.com/joist-orm/joist-orm/compare/v1.19.0...v1.20.0) (2022-06-24)


### Features

* Convert async derived fields to field-level reactive hints. ([#362](https://github.com/joist-orm/joist-orm/issues/362)) ([ec90745](https://github.com/joist-orm/joist-orm/commit/ec90745c9581002ee71e3db341a3114275fd6252))

# [1.19.0](https://github.com/joist-orm/joist-orm/compare/v1.18.0...v1.19.0) (2022-06-24)


### Features

* Skip reacting to immutable fields. ([#361](https://github.com/joist-orm/joist-orm/issues/361)) ([6ffd966](https://github.com/joist-orm/joist-orm/commit/6ffd9660cc77f81d36aea07b4a523d28d5b452d1))

# [1.18.0](https://github.com/joist-orm/joist-orm/compare/v1.17.0...v1.18.0) (2022-06-24)


### Features

* Field-level validation rules ([#351](https://github.com/joist-orm/joist-orm/issues/351)) ([08d3cc2](https://github.com/joist-orm/joist-orm/commit/08d3cc2188f4d245df8ba2049fd96bbdf6f2d6e9))

# [1.17.0](https://github.com/joist-orm/joist-orm/compare/v1.16.0...v1.17.0) (2022-06-22)


### Features

* [SC-15953] em.clone enhancements ([#356](https://github.com/joist-orm/joist-orm/issues/356)) ([bced783](https://github.com/joist-orm/joist-orm/commit/bced783f5fd47f49bef4d391a0b64efc7ee6fc1f))

# [1.16.0](https://github.com/joist-orm/joist-orm/compare/v1.15.3...v1.16.0) (2022-06-21)


### Features

* em.findGql support passing { ne: null } to nullable foreign keys ([#354](https://github.com/joist-orm/joist-orm/issues/354)) ([5f6ca50](https://github.com/joist-orm/joist-orm/commit/5f6ca504528399d3fbb056e72f180bd588c6c5d5))

## [1.15.3](https://github.com/joist-orm/joist-orm/compare/v1.15.2...v1.15.3) (2022-06-08)


### Bug Fixes

* support jest 28 ([#352](https://github.com/joist-orm/joist-orm/issues/352)) ([adac4a2](https://github.com/joist-orm/joist-orm/commit/adac4a235a55c016897ba418128bcb3e44ad1d5d))

## [1.15.2](https://github.com/joist-orm/joist-orm/compare/v1.15.1...v1.15.2) (2022-06-04)


### Bug Fixes

* Add maybeUndefined for polys. ([be2f8e3](https://github.com/joist-orm/joist-orm/commit/be2f8e369bf5f9256ef62e5cc1d1f68e57f37821))

## [1.15.1](https://github.com/joist-orm/joist-orm/compare/v1.15.0...v1.15.1) (2022-06-04)


### Bug Fixes

* Fix changes type for strings via new EntityFields type. ([#350](https://github.com/joist-orm/joist-orm/issues/350)) ([5425d78](https://github.com/joist-orm/joist-orm/commit/5425d7801990ed7df916803b7b20079f21d42c0f))

# [1.15.0](https://github.com/joist-orm/joist-orm/compare/v1.14.1...v1.15.0) (2022-06-03)


### Features

* Add field-level immutability to the metadata. ([#349](https://github.com/joist-orm/joist-orm/issues/349)) ([269762f](https://github.com/joist-orm/joist-orm/commit/269762fb9c3588230dccd9d157cbd7cc9d724c92))

## [1.14.1](https://github.com/joist-orm/joist-orm/compare/v1.14.0...v1.14.1) (2022-06-03)


### Bug Fixes

* Fix type of changes.originalEntity. ([#348](https://github.com/joist-orm/joist-orm/issues/348)) ([779e281](https://github.com/joist-orm/joist-orm/commit/779e281199fcde314d166a7c2d2ec1040209b129))

# [1.14.0](https://github.com/joist-orm/joist-orm/compare/v1.13.0...v1.14.0) (2022-06-03)


### Features

* Allow em.create m2os with an id. ([#347](https://github.com/joist-orm/joist-orm/issues/347)) ([10b28a9](https://github.com/joist-orm/joist-orm/commit/10b28a93dd3708890657d02c0fd8b416afe13b5a))

# [1.13.0](https://github.com/joist-orm/joist-orm/compare/v1.12.2...v1.13.0) (2022-06-01)


### Features

* support for camel cased table names and columns ([#346](https://github.com/joist-orm/joist-orm/issues/346)) ([15e7a73](https://github.com/joist-orm/joist-orm/commit/15e7a738db5c274c5cd8ada1ba9a817c1aab28e6))

## [1.12.2](https://github.com/joist-orm/joist-orm/compare/v1.12.1...v1.12.2) (2022-05-30)


### Bug Fixes

* Don't capital case field name. ([#344](https://github.com/joist-orm/joist-orm/issues/344)) ([48a5500](https://github.com/joist-orm/joist-orm/commit/48a55007f5493570f419e67587a61d7361dbea55))

## [1.12.1](https://github.com/joist-orm/joist-orm/compare/v1.12.0...v1.12.1) (2022-05-30)


### Bug Fixes

* Don't capital case field name. ([#343](https://github.com/joist-orm/joist-orm/issues/343)) ([6281300](https://github.com/joist-orm/joist-orm/commit/6281300272094ac74cb3289b4f16f9eaf4172436))

# [1.12.0](https://github.com/joist-orm/joist-orm/compare/v1.11.0...v1.12.0) (2022-05-30)


### Features

* Add entity to validation errors. ([#342](https://github.com/joist-orm/joist-orm/issues/342)) ([3296249](https://github.com/joist-orm/joist-orm/commit/32962499def6789e7598c93887442abd22e73c2c))

# [1.11.0](https://github.com/joist-orm/joist-orm/compare/v1.10.10...v1.11.0) (2022-05-29)


### Features

* Upstream cannotBeUpdated. ([#340](https://github.com/joist-orm/joist-orm/issues/340)) ([fc08af1](https://github.com/joist-orm/joist-orm/commit/fc08af17464a76943550b59b10c760df4ee2252b))

## [1.10.10](https://github.com/joist-orm/joist-orm/compare/v1.10.9...v1.10.10) (2022-05-27)


### Bug Fixes

* import type entity manager ([#339](https://github.com/joist-orm/joist-orm/issues/339)) ([cf6c75d](https://github.com/joist-orm/joist-orm/commit/cf6c75dd8e273de93d03352d55fa02898565249c))

## [1.10.9](https://github.com/joist-orm/joist-orm/compare/v1.10.8...v1.10.9) (2022-05-27)


### Bug Fixes

* untagged association ([#332](https://github.com/joist-orm/joist-orm/issues/332)) ([6486d2f](https://github.com/joist-orm/joist-orm/commit/6486d2fa4de057a601fa5e66b86b6e281089f2dd))

## [1.10.8](https://github.com/joist-orm/joist-orm/compare/v1.10.7...v1.10.8) (2022-05-26)


### Bug Fixes

* Fix cloning polymorphic references. ([#338](https://github.com/joist-orm/joist-orm/issues/338)) ([ba5f46b](https://github.com/joist-orm/joist-orm/commit/ba5f46b1f0ab7d098b1cba7329c1b94ee25625c8)), closes [#333](https://github.com/joist-orm/joist-orm/issues/333)

## [1.10.7](https://github.com/joist-orm/joist-orm/compare/v1.10.6...v1.10.7) (2022-05-26)


### Bug Fixes

* Export ConnectionConfig. ([#337](https://github.com/joist-orm/joist-orm/issues/337)) ([1196a56](https://github.com/joist-orm/joist-orm/commit/1196a5655b004c8a37c7ad76a9cff0dea7894973))

## [1.10.6](https://github.com/joist-orm/joist-orm/compare/v1.10.5...v1.10.6) (2022-05-25)


### Bug Fixes

* Bump dependencies ([#336](https://github.com/joist-orm/joist-orm/issues/336)) ([5378810](https://github.com/joist-orm/joist-orm/commit/5378810f80e589227a3f9fc490b24d6449ae5a2c))

## [1.10.5](https://github.com/joist-orm/joist-orm/compare/v1.10.4...v1.10.5) (2022-05-24)


### Bug Fixes

* Fix incorrect clone hasChanged against a non-new entity. ([#334](https://github.com/joist-orm/joist-orm/issues/334)) ([8117599](https://github.com/joist-orm/joist-orm/commit/8117599ab70e3a36ef30585597a1dd650411f645))

## [1.10.4](https://github.com/joist-orm/joist-orm/compare/v1.10.3...v1.10.4) (2022-05-24)


### Bug Fixes

* Quote table names. ([#330](https://github.com/joist-orm/joist-orm/issues/330)) ([f13a89c](https://github.com/joist-orm/joist-orm/commit/f13a89c0345d9616ac61a149fb94229b795adad3)), closes [#329](https://github.com/joist-orm/joist-orm/issues/329)

## [1.10.3](https://github.com/joist-orm/joist-orm/compare/v1.10.2...v1.10.3) (2022-05-22)


### Bug Fixes

* Fix scaffolding order so that extends comes first. ([#328](https://github.com/joist-orm/joist-orm/issues/328)) ([e890466](https://github.com/joist-orm/joist-orm/commit/e890466032471889a25002929b8b5059d948be21))

## [1.10.2](https://github.com/joist-orm/joist-orm/compare/v1.10.1...v1.10.2) (2022-05-21)


### Bug Fixes

* Only generate an enum detail field. ([#327](https://github.com/joist-orm/joist-orm/issues/327)) ([9329882](https://github.com/joist-orm/joist-orm/commit/93298824c7b5589d1a7576e52a42f5fe633707c2))

## [1.10.1](https://github.com/joist-orm/joist-orm/compare/v1.10.0...v1.10.1) (2022-05-21)


### Bug Fixes

* Add enum details to the GraphQL scaffolding. ([#326](https://github.com/joist-orm/joist-orm/issues/326)) ([ac0ada3](https://github.com/joist-orm/joist-orm/commit/ac0ada307a49ebc95f8c7884bc46f4dd87ad9a55))

# [1.10.0](https://github.com/joist-orm/joist-orm/compare/v1.9.1...v1.10.0) (2022-05-19)


### Features

* Better defaults for name fields. ([#325](https://github.com/joist-orm/joist-orm/issues/325)) ([0b40d7c](https://github.com/joist-orm/joist-orm/commit/0b40d7cfc562d04048db32434965ef455c346bea))

## [1.9.1](https://github.com/joist-orm/joist-orm/compare/v1.9.0...v1.9.1) (2022-05-16)


### Bug Fixes

* Fix dirty logic when data has an entity. ([#324](https://github.com/joist-orm/joist-orm/issues/324)) ([b8ab60f](https://github.com/joist-orm/joist-orm/commit/b8ab60ff84ca3d6fc484a997bab1cc3ceb422a99))

# [1.9.0](https://github.com/joist-orm/joist-orm/compare/v1.8.8...v1.9.0) (2022-05-15)


### Features

* detag ids with config ([#322](https://github.com/joist-orm/joist-orm/issues/322)) ([59d47c1](https://github.com/joist-orm/joist-orm/commit/59d47c196230ecb4ed8d514a770e5115de89fb47))

## [1.8.8](https://github.com/joist-orm/joist-orm/compare/v1.8.7...v1.8.8) (2022-05-13)


### Bug Fixes

* Fix hasChanged on cloned fields that are unset. ([#321](https://github.com/joist-orm/joist-orm/issues/321)) ([c24bb23](https://github.com/joist-orm/joist-orm/commit/c24bb23caad661b7303f902d726d7880bdbb7cae))

## [1.8.7](https://github.com/joist-orm/joist-orm/compare/v1.8.6...v1.8.7) (2022-05-08)


### Bug Fixes

* Make BaseEntity.toJSON more Prisma-like. ([#319](https://github.com/joist-orm/joist-orm/issues/319)) ([4cf56f9](https://github.com/joist-orm/joist-orm/commit/4cf56f9563f4becfcc707be6705dee1c8f910b38))

## [1.8.6](https://github.com/joist-orm/joist-orm/compare/v1.8.5...v1.8.6) (2022-05-06)


### Bug Fixes

* Fix bug in m2o forceReload when already an entity. ([#316](https://github.com/joist-orm/joist-orm/issues/316)) ([f01bf4a](https://github.com/joist-orm/joist-orm/commit/f01bf4ad2bbe43f9e1ffb26e0de73413d49919cc))

## [1.8.5](https://github.com/joist-orm/joist-orm/compare/v1.8.4...v1.8.5) (2022-05-03)


### Bug Fixes

* add numeric types ([#312](https://github.com/joist-orm/joist-orm/issues/312)) ([d972fdb](https://github.com/joist-orm/joist-orm/commit/d972fdb1d04056fb517e0e48318f0eac66f66119))

## [1.8.4](https://github.com/joist-orm/joist-orm/compare/v1.8.3...v1.8.4) (2022-04-29)


### Bug Fixes

* Flatten promises within refresh. ([#311](https://github.com/joist-orm/joist-orm/issues/311)) ([9327e63](https://github.com/joist-orm/joist-orm/commit/9327e63c4724910f603005e0a22345102ca883fe))

## [1.8.3](https://github.com/joist-orm/joist-orm/compare/v1.8.2...v1.8.3) (2022-04-29)


### Bug Fixes

* Skip recursing into custom relations. ([#310](https://github.com/joist-orm/joist-orm/issues/310)) ([08df732](https://github.com/joist-orm/joist-orm/commit/08df7327d1952630f8728ab9fa8e9d1445e9c595))

## [1.8.2](https://github.com/joist-orm/joist-orm/compare/v1.8.1...v1.8.2) (2022-04-29)


### Bug Fixes

* Fix m2o refresh. ([#309](https://github.com/joist-orm/joist-orm/issues/309)) ([53a9976](https://github.com/joist-orm/joist-orm/commit/53a99763e410d7baaea525395b970127ecc2e6a9))

## [1.8.1](https://github.com/joist-orm/joist-orm/compare/v1.8.0...v1.8.1) (2022-04-29)


### Bug Fixes

* Fix hasManyDerived w/forceReload. ([#308](https://github.com/joist-orm/joist-orm/issues/308)) ([326840a](https://github.com/joist-orm/joist-orm/commit/326840a05b92eac4af6909523238a422913fed22))

# [1.8.0](https://github.com/joist-orm/joist-orm/compare/v1.7.1...v1.8.0) (2022-04-29)


### Features

* Implement DeepNew for factories and tests ([#307](https://github.com/joist-orm/joist-orm/issues/307)) ([696dd67](https://github.com/joist-orm/joist-orm/commit/696dd67bddf990c0366e9c63533e003fefd7367c))

## [1.7.1](https://github.com/joist-orm/joist-orm/compare/v1.7.0...v1.7.1) (2022-04-20)


### Bug Fixes

* bump knex to 1.0.7 ([#306](https://github.com/joist-orm/joist-orm/issues/306)) ([41f96f9](https://github.com/joist-orm/joist-orm/commit/41f96f9e5efd99539d1b3138603daaddab080a00))

# [1.7.0](https://github.com/joist-orm/joist-orm/compare/v1.6.1...v1.7.0) (2022-04-19)


### Features

* Make clone smarter. ([#305](https://github.com/joist-orm/joist-orm/issues/305)) ([fef395b](https://github.com/joist-orm/joist-orm/commit/fef395b46de15712340ed46ddc4df023c69736e1))

## [1.6.1](https://github.com/joist-orm/joist-orm/compare/v1.6.0...v1.6.1) (2022-04-18)


### Bug Fixes

* Use joist util fail ([#304](https://github.com/joist-orm/joist-orm/issues/304)) ([7830131](https://github.com/joist-orm/joist-orm/commit/7830131a951760442c97de43ca48ae6a3608da5f))

# [1.6.0](https://github.com/joist-orm/joist-orm/compare/v1.5.0...v1.6.0) (2022-04-15)


### Features

* Implement custom inspect method. ([#302](https://github.com/joist-orm/joist-orm/issues/302)) ([80d7ad7](https://github.com/joist-orm/joist-orm/commit/80d7ad7f27310ed9bd73c03cc3298ec2e9c662d2))

# [1.5.0](https://github.com/joist-orm/joist-orm/compare/v1.4.3...v1.5.0) (2022-04-14)


### Features

* changed graphql mapping from ids to entities and updated scaffolding ([#294](https://github.com/joist-orm/joist-orm/issues/294)) ([43fede2](https://github.com/joist-orm/joist-orm/commit/43fede2c85eb28f749736e88d340cbcf4256b551))

## [1.4.3](https://github.com/joist-orm/joist-orm/compare/v1.4.2...v1.4.3) (2022-04-13)


### Bug Fixes

* Add asNew helper method. ([#301](https://github.com/joist-orm/joist-orm/issues/301)) ([9e6aca3](https://github.com/joist-orm/joist-orm/commit/9e6aca3707b20112e2c8faaf446b237126d98125))

## [1.4.2](https://github.com/joist-orm/joist-orm/compare/v1.4.1...v1.4.2) (2022-04-13)


### Bug Fixes

* Move filter earlier for easier debugging. ([#300](https://github.com/joist-orm/joist-orm/issues/300)) ([a42830a](https://github.com/joist-orm/joist-orm/commit/a42830a2f7ae904138a3600244e4f33ed9abc4a4))

## [1.4.1](https://github.com/joist-orm/joist-orm/compare/v1.4.0...v1.4.1) (2022-04-12)


### Bug Fixes

* Fix type safety of idOrFail. ([#299](https://github.com/joist-orm/joist-orm/issues/299)) ([d585a7d](https://github.com/joist-orm/joist-orm/commit/d585a7daf0c585665118bc705f0ddd9a40697b2a))

# [1.4.0](https://github.com/joist-orm/joist-orm/compare/v1.3.2...v1.4.0) (2022-04-12)


### Bug Fixes

* Fix o2o/m2o naming collisions. ([#298](https://github.com/joist-orm/joist-orm/issues/298)) ([4b7b101](https://github.com/joist-orm/joist-orm/commit/4b7b1018a9990b3a8f229f26d0810ac07c0c5b4f))


### Features

* Add populate(hint, fn) overload. ([#297](https://github.com/joist-orm/joist-orm/issues/297)) ([d093de5](https://github.com/joist-orm/joist-orm/commit/d093de575b3ba4cf3b2ca44d203f57c072fe9848)), closes [#296](https://github.com/joist-orm/joist-orm/issues/296)

## [1.3.2](https://github.com/joist-orm/joist-orm/compare/v1.3.1...v1.3.2) (2022-04-07)


### Bug Fixes

* Make the root workspace private ([#293](https://github.com/joist-orm/joist-orm/issues/293)) ([9c917e5](https://github.com/joist-orm/joist-orm/commit/9c917e54cf3fa446bced9b4fa5a2d8dfa520934f))

## [1.3.1](https://github.com/joist-orm/joist-orm/compare/v1.3.0...v1.3.1) (2022-04-07)


### Bug Fixes

* Correct semantic release publishCmd ([#292](https://github.com/joist-orm/joist-orm/issues/292)) ([d87df5c](https://github.com/joist-orm/joist-orm/commit/d87df5cd681fa2dfc17c5ea55f51a200fcc3ab02))

# [1.3.0](https://github.com/joist-orm/joist-orm/compare/v1.2.1...v1.3.0) (2022-04-07)


### Features

* [SC-14739] Improved newTestInstance support for polymorphic references ([#291](https://github.com/joist-orm/joist-orm/issues/291)) ([d68351d](https://github.com/joist-orm/joist-orm/commit/d68351df2efbb42b55854e89b6ba1c9f2558f19a))

## [1.2.1](https://github.com/joist-orm/joist-orm/compare/v1.2.0...v1.2.1) (2022-04-04)


### Bug Fixes

* Use workspaces foreach to drive semantic-release. ([#290](https://github.com/joist-orm/joist-orm/issues/290)) ([6098647](https://github.com/joist-orm/joist-orm/commit/6098647e579d4a5616c43804392f52cbd74a63fb))

# [1.2.0](https://github.com/joist-orm/joist-orm/compare/v1.1.5...v1.2.0) (2022-04-03)


### Features

* Loosen restrictions on timestamp columns. ([#289](https://github.com/joist-orm/joist-orm/issues/289)) ([ec8290e](https://github.com/joist-orm/joist-orm/commit/ec8290e9558f93be61ba5cd5d828bd42c9891f30))

## [1.1.5](https://github.com/joist-orm/joist-orm/compare/v1.1.4...v1.1.5) (2022-04-01)


### Bug Fixes

* Resolve [#273](https://github.com/joist-orm/joist-orm/issues/273) Added isLoaded, ensureLoaded, and ensureLoadedThen ([#286](https://github.com/joist-orm/joist-orm/issues/286)) ([a9f366e](https://github.com/joist-orm/joist-orm/commit/a9f366e2541c82f3ba6082d836fce20c47f34d96))

## [1.1.4](https://github.com/joist-orm/joist-orm/compare/v1.1.3...v1.1.4) (2022-03-27)


### Bug Fixes

* Fix EntityConstructor w/defaultValues. ([#284](https://github.com/joist-orm/joist-orm/issues/284)) ([07dcc3c](https://github.com/joist-orm/joist-orm/commit/07dcc3cf9dd75c8b4fc4aa8d1e0d288a7f09514c))

## [1.1.3](https://github.com/joist-orm/joist-orm/compare/v1.1.2...v1.1.3) (2022-03-27)


### Bug Fixes

* Forgot to publish joist-test-utils. ([71d6d97](https://github.com/joist-orm/joist-orm/commit/71d6d97468f93206f43bcb7a86f02ceaba3a5d1c))

## [1.1.2](https://github.com/joist-orm/joist-orm/compare/v1.1.1...v1.1.2) (2022-03-27)


### Bug Fixes

* Don't use workspaces foreach to publish. ([e098ed7](https://github.com/joist-orm/joist-orm/commit/e098ed7063a0cb7a8dfbd84201380a6d83a48ce0))

## [1.1.1](https://github.com/joist-orm/joist-orm/compare/v1.1.0...v1.1.1) (2022-03-27)


### Bug Fixes

* Fix semantic-release. ([7037a81](https://github.com/joist-orm/joist-orm/commit/7037a8176604942e632217622aabc7563796d0ca))

# [1.1.0](https://github.com/joist-orm/joist-orm/compare/v1.0.0...v1.1.0) (2022-03-27)


### Features

* Fix semantic-release. ([74ac911](https://github.com/joist-orm/joist-orm/commit/74ac91119db97eb96b36248029a722cf5980c3ee))

# 1.0.0 (2022-03-27)


### Bug Fixes

* Add afterCommit to flush secret error message. ([#246](https://github.com/joist-orm/joist-orm/issues/246)) ([c4b9acb](https://github.com/joist-orm/joist-orm/commit/c4b9acb7b93d267f796a0c8b0af68741d3ad438b))
* Add missing semi-colon. ([#156](https://github.com/joist-orm/joist-orm/issues/156)) ([d7abc18](https://github.com/joist-orm/joist-orm/commit/d7abc1813263cb8c59b322eddb1da3875eb3ccb8))
* Don't add derived primitives to inputs. ([#111](https://github.com/joist-orm/joist-orm/issues/111)) ([9c943fd](https://github.com/joist-orm/joist-orm/commit/9c943fd95b7cbc6275367185e0399009147cfeda))
* Don't create multiple load promises. ([#209](https://github.com/joist-orm/joist-orm/issues/209)) ([e53ccdc](https://github.com/joist-orm/joist-orm/commit/e53ccdcf47797d24436e10233b311cd5497fce8f))
* Export impls for instanceof checks. ([#215](https://github.com/joist-orm/joist-orm/issues/215)) ([bd24ded](https://github.com/joist-orm/joist-orm/commit/bd24ded833f0e13974795576091fc3737c960be2))
* Fix duplicate reactive validations. ([#233](https://github.com/joist-orm/joist-orm/issues/233)) ([e2ecfb3](https://github.com/joist-orm/joist-orm/commit/e2ecfb352d5c46d427108d653e242cf6d2f8d933))
* Fix faulty hooks orphaning the remaining hooks. ([#210](https://github.com/joist-orm/joist-orm/issues/210)) ([3907ae2](https://github.com/joist-orm/joist-orm/commit/3907ae280bcfdeffd0ee13f182658b318b9f9c9d))
* Fix InMemoryDriver.flushJoinTables bugs. ([#260](https://github.com/joist-orm/joist-orm/issues/260)) ([119129d](https://github.com/joist-orm/joist-orm/commit/119129d7e5f3dfe13036b4bcda198e1e553a2f2f))
* Fix native enums not working. ([#281](https://github.com/joist-orm/joist-orm/issues/281)) ([bef50b5](https://github.com/joist-orm/joist-orm/commit/bef50b5b3a10b321c829857ebee517f04181b727))
* Fix parent factories should skip default children ([#263](https://github.com/joist-orm/joist-orm/issues/263)) ([4a2fdc6](https://github.com/joist-orm/joist-orm/commit/4a2fdc6219288a8fadb9d1221cdb78ebc01e8bbc))
* fix release command ([#123](https://github.com/joist-orm/joist-orm/issues/123)) ([15a942b](https://github.com/joist-orm/joist-orm/commit/15a942b101ddfbbd6f6329b2a78b9f5f2ebe732b))
* Have tagId check existing tags. ([#264](https://github.com/joist-orm/joist-orm/issues/264)) ([c6c066d](https://github.com/joist-orm/joist-orm/commit/c6c066d57c86bf11a42dd9ac39b4c51aa2162c23))
* Polish toMatchEntity. ([#266](https://github.com/joist-orm/joist-orm/issues/266)) ([65f8238](https://github.com/joist-orm/joist-orm/commit/65f8238d8c2b250252a02a490dc9eca2c50ba3eb))
* Refactor factories to use null less. ([#272](https://github.com/joist-orm/joist-orm/issues/272)) ([429fe47](https://github.com/joist-orm/joist-orm/commit/429fe47db01c78d1824b15c236af6a529aa0e3fd))
* Rename tagIfNeeded to just tagId. ([#232](https://github.com/joist-orm/joist-orm/issues/232)) ([d8a1fef](https://github.com/joist-orm/joist-orm/commit/d8a1fef3e790dd9db3700c5b394618774c893f80))
* Teach factories about default values. ([#280](https://github.com/joist-orm/joist-orm/issues/280)) ([8bd5d0a](https://github.com/joist-orm/joist-orm/commit/8bd5d0a3024cfdbcbb094ab5cfb4b533f19d1892)), closes [#278](https://github.com/joist-orm/joist-orm/issues/278)
* Update maybeNew to use ActualFactoryOpts. ([#279](https://github.com/joist-orm/joist-orm/issues/279)) ([e38a214](https://github.com/joist-orm/joist-orm/commit/e38a214821a967309b0b070a58ef433c36054b2b))


### Features

* Ability to ignore notNull columns with default values ([#124](https://github.com/joist-orm/joist-orm/issues/124)) ([c28732b](https://github.com/joist-orm/joist-orm/commit/c28732bd258926e7563db99e29348ddc3ae93332))
* Add changes.originalEntity for m2o fields. ([#274](https://github.com/joist-orm/joist-orm/issues/274)) ([ae7749e](https://github.com/joist-orm/joist-orm/commit/ae7749ee22fbe05b35c22a7ee909764959f817ba))
* Add config.placeholder to initial entity files. ([#257](https://github.com/joist-orm/joist-orm/issues/257)) ([c84ef0e](https://github.com/joist-orm/joist-orm/commit/c84ef0e3a026e52b7fc168d7adfe749cec868a21)), closes [#251](https://github.com/joist-orm/joist-orm/issues/251)
* Add Entity.em field. ([#253](https://github.com/joist-orm/joist-orm/issues/253)) ([364c2ef](https://github.com/joist-orm/joist-orm/commit/364c2ef89cb55f872d25136abfd87e675e9ae018))
* Add EntityManager.load(string) overload. ([#175](https://github.com/joist-orm/joist-orm/issues/175)) ([d9c3837](https://github.com/joist-orm/joist-orm/commit/d9c38379676403f277b4555b4e9eafc212e1a47b))
* Add large collections. ([#249](https://github.com/joist-orm/joist-orm/issues/249)) ([e8dc86d](https://github.com/joist-orm/joist-orm/commit/e8dc86dd44c346fb3baab7990348a3c5aa4ebea3))
* Add ManyToMany.includes. ([#247](https://github.com/joist-orm/joist-orm/issues/247)) ([51b5832](https://github.com/joist-orm/joist-orm/commit/51b5832107b5619bce36031f7235f4b7f6c6e2a4)), closes [#244](https://github.com/joist-orm/joist-orm/issues/244)
* Add resolveFactoryOpt. ([#265](https://github.com/joist-orm/joist-orm/issues/265)) ([637ee42](https://github.com/joist-orm/joist-orm/commit/637ee429b4def9d0bf2942e4c6516bd22ea25b1a))
* add skipValidation option to flush method ([#140](https://github.com/joist-orm/joist-orm/issues/140)) ([34240d7](https://github.com/joist-orm/joist-orm/commit/34240d706ca9077dc049d0119b3942770bfe03e9))
* Allow explicitly requesting a factory's default value. ([#125](https://github.com/joist-orm/joist-orm/issues/125)) ([5ee2174](https://github.com/joist-orm/joist-orm/commit/5ee2174573ddbc9ca2a83bde379e2ab8e1cbebd8))
* Automatically dedup adds to m2ms. ([#180](https://github.com/joist-orm/joist-orm/issues/180)) ([e0ed533](https://github.com/joist-orm/joist-orm/commit/e0ed533fdba2caa0ae6edee530044a2a080a451d)), closes [#179](https://github.com/joist-orm/joist-orm/issues/179)
* pg native enums ([#229](https://github.com/joist-orm/joist-orm/issues/229)) ([b85c98e](https://github.com/joist-orm/joist-orm/commit/b85c98e505e6193f96db39e7a1401753748b0ffd))
* Use semantic-release. ([57bd722](https://github.com/joist-orm/joist-orm/commit/57bd7224bb75f60aed6a4e15da2ef29c6d78a6e8))
