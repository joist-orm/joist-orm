/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import clsx from "clsx";
import React from "react";
import styles from "./HomepageFeatures.module.css";

type FeatureItem = {
  title: string;
  description: JSX.Element;
};

const FeatureList: FeatureItem[] = [
  {
    title: "Getting Started",
    description: (
      <>
        <a href="/docs/getting-started">How to integrate Joist</a> into your project
      </>
    ),
  },
  {
    title: "Goals",
    description: (
      <>
        Joist's <a href="/docs/goals">high-level goals</a>
      </>
    ),
  },
  {
    title: "Modeling",
    description: (
      <>
        How Joist faciliates<a href={"/docs/modeling"}>modeling your domain</a>
      </>
    ),
  },
  {
    title: "Features",
    description: (
      <>
        A misc list of Joist's <a href={"/docs/features"}>features</a>
      </>
    ),
  },
];

function Feature({ title, description }: FeatureItem) {
  return (
    <div className={clsx("col col--4")}>
      <div className="text--center padding-horiz--md">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
