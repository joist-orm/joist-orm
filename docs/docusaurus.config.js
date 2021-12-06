// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require("prism-react-renderer/themes/github");
const darkCodeTheme = require("prism-react-renderer/themes/dracula");

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Joist",
  tagline: "An Idiomatic TypeScript ORM",
  url: "https://stephenh.github.io",
  baseUrl: "/joist-ts/",
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",
  organizationName: "stephenh",
  projectName: "joist-ts",

  presets: [
    [
      "@docusaurus/preset-classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve("./sidebars.js"),
          editUrl: "https://github.com/stephen/joist-ts/edit/main/docs/",
        },
        blog: false,
        theme: { customCss: require.resolve("./src/css/custom.css") },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: "Joist",
        // logo: { alt: "My Site Logo", src: "img/logo.svg" },
        items: [
          { type: "doc", docId: "getting-started/overview", position: "left", label: "Getting Started" },
          { type: "doc", docId: "goals/overview", position: "left", label: "Goals" },
          { type: "doc", docId: "features/overview", position: "left", label: "Features" },
          { href: "https://github.com/stephenh/joist-ts", label: "GitHub", position: "right" },
        ],
      },
      footer: {
        style: "dark",
        links: [
          {
            title: "Docs",
            items: [
              { label: "Getting Started", to: "/docs/getting-started" },
              { label: "Goals", to: "/docs/goals" },
              { label: "Features", to: "/docs/features" },
            ],
          },
          {
            title: "Community",
            items: [{ label: "GitHub Discussions", href: "https://github.com/stephenh/joist-ts/discussions" }],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()}`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
        additionalLanguages: ["ruby"],
      },
    }),
};

module.exports = config;
