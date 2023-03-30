import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import clsx from "clsx";
import React from "react";
import HomepageFeatures from "../components/HomepageFeatures";
import styles from "./index.module.css";

export default function Index(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title={`Hello from ${siteConfig.title}`} description="Description will go into a meta tag in <head />">
      <Header />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}

function Header() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx("hero hero--primary", styles.heroBanner)}>
      <div className="container">
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link to="/docs/getting-started/tour">
            <a className={styles.button}>Quick Tour</a>
          </Link>
          <Link to="/docs/getting-started">
            <a className={styles.button}>Get Started</a>
          </Link>
        </div>
      </div>
    </header>
  );
}
