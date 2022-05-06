/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import clsx from "clsx";
import React from "react";
// @ts-expect-error
import Goals from "../../docs/goals/overview.md";
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
          <Goals />
        </div>
      </div>
    </section>
  );
}
