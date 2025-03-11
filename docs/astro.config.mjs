// @ts-check
import starlight from "@astrojs/starlight";
import tailwind from "@astrojs/tailwind";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://joist-orm.io",
  integrations: [
    tailwind({ applyBaseStyles: false }),
    starlight({
      title: "Joist ORM",
      customCss: ["./src/tailwind.css"],
      social: { github: "https://github.com/joist-orm/joist" },
      sidebar: [
        { label: "Getting Started", autogenerate: { directory: "getting-started" } },
        { label: "Goals", autogenerate: { directory: "goals" } },
        { label: "Domain Modeling", autogenerate: { directory: "modeling" } },
        { label: "Features", autogenerate: { directory: "features" } },
        { label: "Advanced Features", autogenerate: { directory: "advanced" } },
        { label: "Logging", autogenerate: { directory: "logging" } },
        { label: "Testing", autogenerate: { directory: "testing" } },
        { label: "FAQ", link: "/faq/" },
        { label: "Blog", link: "/blog" },
      ],
    }),
  ],
});
