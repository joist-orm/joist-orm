// @ts-check
import starlight from "@astrojs/starlight";
import tailwind from "@astrojs/tailwind";
import { defineConfig } from "astro/config";
import starlightBlog from "starlight-blog";

// https://astro.build/config
export default defineConfig({
  site: "https://joist-orm.io",
  integrations: [
    tailwind({ applyBaseStyles: false }),
    starlight({
      title: "Joist",
      logo: {
        light: "./src/assets/logos/logo-1.png",
        dark: "./src/assets/logos/logo-2.png",
        replacesTitle: true,
      },
      customCss: ["./src/tailwind.css"],
      social: {
        github: "https://github.com/joist-orm/joist-orm",
        ["x.com"]: "https://x.com/Joist_Orm",
        discord: "https://discord.gg/ky9VTQugqu",
      },
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
      plugins: [starlightBlog()],
    }),
  ],
});
