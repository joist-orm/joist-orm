import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes } from "prism-react-renderer";

const { github: lightCodeTheme, dracula: darkCodeTheme } = themes;

const config: Config = {
  title: "Joist",
  tagline: "Build Great Domain Models",
  url: "https://joist-orm.io",
  baseUrl: "/",
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",
  organizationName: "joist-orm",
  projectName: "joist-orm",
  trailingSlash: false,

  presets: [
    [
      "@docusaurus/preset-classic",
      {
        docs: {
          sidebarPath: require.resolve("./sidebars.js"),
          editUrl: "https://github.com/joist-orm/joist-orm/edit/main/docs/",
        },
        blog: {
          path: "./blog",
        },
        theme: { customCss: require.resolve("./src/css/custom.css") },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    navbar: {
      title: "Joist",
      // logo: { alt: "My Site Logo", src: "img/logo.svg" },
      items: [
        { type: "doc", docId: "getting-started/installation", position: "left", label: "Getting Started" },
        { type: "doc", docId: "goals/overview", position: "left", label: "Goals" },
        { type: "doc", docId: "modeling/fields", position: "left", label: "Domain Modeling" },
        { type: "doc", docId: "features/entity-manager", position: "left", label: "Features" },
        { type: "doc", docId: "testing/test-factories", position: "left", label: "Testing" },
        { type: "doc", docId: "faq", position: "left", label: "FAQ" },
        { to: "blog", label: "Blog", position: "left" }, // or position: 'right'
        { href: "https://github.com/joist-orm/joist-orm", label: "GitHub", position: "right" },
        { href: "https://www.youtube.com/@joist-orm", label: "YouTube", position: "right" },
        { href: "https://discord.gg/ky9VTQugqu", label: "Discord", position: "right" },
      ],
    },
    metadata: [
      { name: "keywords", content: "TypeScript, ORM, Reactivity, Domain Driven Design, Unit of Work, ActiveRecord" },
    ],
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Getting Started", to: "/docs/getting-started" },
            { label: "Goals", to: "/docs/goals" },
          ],
        },
        {
          title: "Community",
          items: [
            { label: "GitHub Discussions", href: "https://github.com/joist-orm/joist-orm/discussions" },
            { label: "Discord", href: "https://discord.gg/ky9VTQugqu" },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()}`,
    },
    prism: {
      theme: lightCodeTheme,
      darkTheme: darkCodeTheme,
      additionalLanguages: ["ruby", "bash", "json"],
    },
  } satisfies Preset.ThemeConfig,

  plugins: [
    async function myPlugin() {
      return {
        name: "docusaurus-tailwindcss",
        configurePostCss(postcssOptions) {
          // Appends TailwindCSS and AutoPrefixer.
          postcssOptions.plugins.push(require("tailwindcss"));
          postcssOptions.plugins.push(require("autoprefixer"));
          return postcssOptions;
        },
      };
    },
  ],
};

export default config;
