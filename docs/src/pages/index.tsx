import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
// @ts-ignore
import JoistLogoUrl from "@site/static/joist-logo-text.png";
import Layout from "@theme/Layout";
import clsx from "clsx";
import HomepageFeatures from "../components/HomepageFeatures";
import styles from "./index.module.css";

export default function Index(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title="Joist" description="An idiomatic TypeScript ORM for creating great domain models">
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
    <header className={clsx("hero", styles.heroBanner)}>
      <div className="container">
        <img src={JoistLogoUrl} alt={siteConfig.title} />
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <a href="/docs/getting-started/tour" className={styles.button}>
            Quick Tour
          </a>
          <a href="/docs/getting-started" className={styles.button}>
            Get Started
          </a>
        </div>
      </div>
    </header>
  );
}
