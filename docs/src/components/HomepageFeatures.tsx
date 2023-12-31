// @ts-expect-error
import Goals from "../../docs/goals/overview.md";

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className="flex items-center pb-12">
      <article className="markdown">
        <Goals />
      </article>
    </section>
  );
}
