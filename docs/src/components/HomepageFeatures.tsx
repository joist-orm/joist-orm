import React from "react";
// @ts-expect-error
import Goals from "../../docs/goals/overview.md";
import styles from "./HomepageFeatures.module.css";

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.features}>
      <div className={styles.container + " container"}>
        <div className="markdown">
          <Goals />
        </div>
      </div>
    </section>
  );
}
