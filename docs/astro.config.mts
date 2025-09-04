import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import starlightBlog from "starlight-blog";
import starlightLlmsTxt from 'starlight-llms-txt'
import { readFileSync } from 'fs';
import { glob } from 'glob';

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
    description: "An opinionated TypeScript ORM for Node.js and PostgreSQL focused on domain modeling, featuring schema-driven code generation, guaranteed N+1 prevention via DataLoader, reactive validation rules, and strong type safety for building robust backend applications.",
    details: `The Joist ORM ecosystem is made up of the following NPM packages:\n\n${publicJoistPackages.map(pkg => `- ${pkg}`).join('\n')}\n\nAll of these packages are described in these documentation sets.`,
    customSets: [
      {
        label: "Configuration and Setup",
        paths: ["getting-started/**"]
      },
      {
        label: "Code Generation (codegen)",
        paths: ["goals/code-generation"]
      },
      {
        label: "Domain Modeling",
        paths: ["modeling/**"]
      },
      {
        label: "Usage",
        paths: ["features/**"]
      },
      {
        label: "Testing",
        paths: ["testing/**"]
      }
    ],
    promote: [
      "goals/**",
      "modeling/**",
      "features/**",
    ],
    demote: [
      "comparisons/**"
    ],
    exclude: [
      "blog/**", // this is mostly marketing content, not helpful for LLMs
      "why-joist", // just a redirect
    ],
  }
}

function getPublicJoistPackages(): string[] {
  const packageJsonFiles = glob.sync('../packages/*/package.json');
  const publicPackages: string[] = [];

  for (const filePath of packageJsonFiles) {
    try {
      const packageJson = JSON.parse(readFileSync(filePath, 'utf-8'));

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
