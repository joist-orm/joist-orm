---
title: Dual Release Channels
slug: blog/dual-release-channels
date: 2026-01-23
authors: shaberman
tags: []
excerpt: Joist now supports dual release channels, allowing you to choose between a stable and a bleeding-edge version of the ORM.
---

For awhile now, we've struggled with Joist release announcements--as in we just don't do them. 😅

The primary reason is that, unlike a VC-funded or even bootstrapped product-focused company, Joist's development has historically been 100% driven by what we need at [Homebound](https://homebound.com), delivering business value in our day-to-day feature work.

So, when we need a new Joist feature to make our feature delivery easier/suck less, we typically need it "right now"--and so we build it and release it, without much concern for "should this warrant a major release?" or "Could we bundle a few of these major features up into a marketing-oriented release announcement?"

We mostly just need to "get back to work", so we merge our Joist PRs and move on.

While doing so, we've admittedly been somewhat loose with semantic versioning. We do use [semantic release](https://github.com/semantic-release/semantic-release) to drive our releases in CI, but we've shied away from the `!` of denote "breaking changes", and have just stayed `1.x` release world for...well, years at this point. We've just kept incrementing `1.1`, `1.2`, all the way up to `1.470`-something. 😬

But with Joist 2.0 freshly released, we're going to try a different approach: dual release channels.

- **Stable**: This channel will follow semantic versioning (`major.minor.patch`) and be the default artifact in npmjs.
  - I.e. this channel what you'll get with a `yarn add joist-orm`
  - In the periodic releases, we'll bundle up a month-or-two of work into an "official release", with appropriate documentation and release notes.
  - We'll trigger these releases by periodically merging `main` into our `release` branch
- **Next**: This channel will deploy on every merge to `main` and use the `next` tag in npmjs.
  - I.e. this channel what you'll get with a `yarn add joist-orm@next`
  - `next` version numbers will be "the last stable release" plus "an incrementing number", so if `2.1.0` was the last stable release, next releases would be `2.1.0-next.1`, `2.1.0-next.2`, etc.
  - Next releases **will not follow semantic versioning**--they could be a mix of bug fixes, new non-breaking features, and breaking changes.
  - This is basically our release process today, albeit with the new `next` tagging

Our hope is that these two channels will let us both:

1. Keep releasing new features immediately to `next`, for pulling into our internal repositories
   - Without blocking our internal work on "the next major release in 3 months", and
   - Without worrying about artifically burning/increasing major release numbers,
2. Periodically batch up changes into a `stable` release, and
   - Announce the new features/wins as an official release, with release notes, etc.

We're optimistic about the approach, and mostly regret that we didn't start doing this sooner! 😅

(Of course, even though this approach is "new to us", the dual channel approach is definitely not new--React releases are done this way, and I assume for the same rationale: given Facebook has an internal mono repo, they likely want "the latest release" asap (similar to our internal builds), while using the periodic releases for the general public, who don't necessarily want wake up every morning to a possibly breaking change.)
