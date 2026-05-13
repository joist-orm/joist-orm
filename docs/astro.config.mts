import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { readFileSync } from "fs";
import { glob } from "glob";
import starlightBlog from "starlight-blog";
import starlightLlmsTxt from "starlight-llms-txt";

// https://astro.build/config
const config = defineConfig({
  site: "https://joist-orm.io",
  redirects: {
    "/advanced/transform-properties": "/faq/#why-is-joist-transform-properties-no-longer-required",
  },
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
        { label: "Getting Started", items: [{ autogenerate: { directory: "getting-started" } }] },
        { label: "Goals", items: [{ autogenerate: { directory: "goals" } }] },
        { label: "Domain Modeling", items: [{ autogenerate: { directory: "modeling" } }] },
        { label: "Features", items: [{ autogenerate: { directory: "features" } }] },
        { label: "Advanced Features", items: [{ autogenerate: { directory: "advanced" } }] },
        { label: "Logging", items: [{ autogenerate: { directory: "logging" } }] },
        { label: "Testing", items: [{ autogenerate: { directory: "testing" } }] },
        { label: "Comparisons", items: [{ autogenerate: { directory: "comparisons" } }] },
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
        starlightLlmsTxt({
          ...getLlmConfig(),
        }),
      ],
    }),
  ],
  vite: { plugins: [tailwindcss()] },
});

type StarlightLllmsTextOptions = Parameters<typeof starlightLlmsTxt>[0];
function getLlmConfig(): StarlightLllmsTextOptions {
  const publicJoistPackages = getPublicJoistPackages();

  return {
    projectName: "Joist ORM",
    description:
      "An opinionated TypeScript ORM for Node.js and PostgreSQL focused on domain modeling, featuring schema-driven code generation, guaranteed N+1 prevention via DataLoader, reactive validation rules, and strong type safety for building robust backend applications.",
    details: `The Joist ORM ecosystem is made up of the following NPM packages:\n\n${publicJoistPackages.map((pkg) => `- ${pkg}`).join("\n")}\n\nAll of these packages are described in these documentation sets.`,
    customSets: [
      {
        label: "Configuration and Setup",
        paths: ["getting-started/**"],
      },
      {
        label: "Code Generation (codegen)",
        paths: ["goals/code-generation"],
      },
      {
        label: "Domain Modeling",
        paths: ["modeling/**"],
      },
      {
        label: "Usage",
        paths: ["features/**"],
      },
      {
        label: "Testing",
        paths: ["testing/**"],
      },
    ],
    promote: ["goals/**", "modeling/**", "features/**"],
    demote: ["comparisons/**"],
    exclude: [
      "blog/**", // this is mostly marketing content, not helpful for LLMs

      // redirects
      "why-joist",
      "advanced/transform-properties",
    ],
  };
}

function getPublicJoistPackages(): string[] {
  const packageJsonFiles = glob.sync("../packages/*/package.json");
  const publicPackages: string[] = [];

  for (const filePath of packageJsonFiles) {
    try {
      const packageJson = JSON.parse(readFileSync(filePath, "utf-8"));

      // Skip if private: true
      if (packageJson.private === true) {
        continue;
      }

      // Add the package name if it exists
      if (packageJson.name) {
        publicPackages.push(packageJson.name);
      }
    } catch (error) {
      console.warn(`Failed to read package.json at ${filePath}:`, error);
    }
  }

  return publicPackages.sort();
}

export default config;
