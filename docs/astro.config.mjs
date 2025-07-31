// @ts-check
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import starlightBlog from "starlight-blog";

// https://astro.build/config
const config = defineConfig({
  site: "https://joist-orm.io",
  integrations: [
    starlight({
      title: "Joist",
      logo: {
        light: "./src/assets/logos/logo-1.png",
        dark: "./src/assets/logos/logo-2.png",
        replacesTitle: true,
      },
      customCss: ["./src/styles/global.css"],
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/joist-orm/joist-orm" },
        { icon: "x.com", label: "X", href: "https://x.com/Joist_Orm" },
        { icon: "discord", label: "Discord", href: "https://discord.gg/ky9VTQugqu" },
      ],
      sidebar: [
        { label: "Getting Started", autogenerate: { directory: "getting-started" } },
        { label: "Goals", autogenerate: { directory: "goals" } },
        { label: "Domain Modeling", autogenerate: { directory: "modeling" } },
        { label: "Features", autogenerate: { directory: "features" } },
        { label: "Advanced Features", autogenerate: { directory: "advanced" } },
        { label: "Logging", autogenerate: { directory: "logging" } },
        { label: "Testing", autogenerate: { directory: "testing" } },
        { label: "Comparisons", autogenerate: { directory: "comparisons" } },
        { label: "FAQ", link: "/faq/" },
        { label: "Blog", link: "/blog" },
      ],
      plugins: [
        starlightBlog({
          authors: {
            shaberman: {
              name: "Stephen Haberman",
              picture: "https://github.com/stephenh.png",
              url: "https://github.com/stephenh",
            },
          },
        }),
      ],
    }),
  ],
  vite: { plugins: [tailwindcss()] },
});

export default config;
