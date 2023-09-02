// @ts-check

const lightCodeTheme = require("prism-react-renderer").themes.github;
const darkCodeTheme = require("prism-react-renderer").themes.dracula;

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Joist",
  tagline: "An Idiomatic TypeScript ORM",
  url: "https://joist-orm.io",
  baseUrl: "/",
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",
  organizationName: "stephenh",
  projectName: "joist-ts",
  trailingSlash: false,

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
          { type: "doc", docId: "getting-started/installation", position: "left", label: "Getting Started" },
          { type: "doc", docId: "goals/overview", position: "left", label: "Goals" },
          { type: "doc", docId: "modeling/fields", position: "left", label: "Domain Modeling" },
          { type: "doc", docId: "features/entity-manager", position: "left", label: "Features" },
          { type: "doc", docId: "testing/test-factories", position: "left", label: "Testing" },
          { type: "doc", docId: "faq", position: "left", label: "FAQ" },
          { href: "https://github.com/stephenh/joist-ts", label: "GitHub", position: "right" },
          { href: "https://joist-ts.slack.com/ssb/redirect", label: "Slack", position: "right" },
        ],
      },
      metadata: [{ name: "keywords", content: "TypeScript, ORM, Reactivity, Domain Driven Design" }],
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
              { label: "GitHub Discussions", href: "https://github.com/stephenh/joist-ts/discussions" },
              { label: "Slack", href: "https://joist-ts.slack.com/ssb/redirect" },
            ],
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
