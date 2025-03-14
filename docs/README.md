# Joist ORM Documentation

[![Built with Starlight](https://astro.badg.es/v2/built-with-starlight/tiny.svg)](https://starlight.astro.build)

This is the documentation site for Joist ORM, built with [Astro Starlight](https://starlight.astro.build).

## Getting Started

To run the documentation site locally:

```bash
# Install dependencies
yarn install

# Start the dev server
yarn dev
```

This will start a local development server at http://localhost:4321/

## Project Structure

```
.
├── public/              # Static assets (images, logos, etc.)
├── src/
│   ├── assets/          # Images used in the site
│   ├── content/
│   │   ├── docs/        # Markdown documentation files
│   │   └── config.ts    # Content configuration
│   └── tailwind.css     # Global styles with Tailwind
├── astro.config.mjs     # Astro configuration (with Starlight)
├── package.json         # Project dependencies
├── tailwind.config.js   # Tailwind configuration
└── tsconfig.json        # TypeScript configuration
```

## Documentation Organization

The documentation is organized into the following sections:

- **Getting Started** - Installation and setup guides
- **Goals** - The key goals and design principles of Joist
- **Domain Modeling** - How to model your domain with Joist
- **Features** - Core features and functionality
- **Advanced Features** - More complex features and use cases
- **Logging** - Information about Joist's logging capabilities
- **Testing** - Testing utilities and patterns

## Adding Content

To add a new documentation page:

1. Create a new Markdown file in the appropriate directory under `src/content/docs/`
2. Add frontmatter with at least a `title` and `description`:

```md
---
title: My New Page
description: Description of what this page covers
---

Content goes here...
```

## Commands

| Command           | Action                                       |
| :---------------- | :------------------------------------------- |
| `yarn install`    | Install dependencies                         |
| `yarn dev`        | Start local dev server at `localhost:4321`   |
| `yarn build`      | Build for production to `./dist/`            |
| `yarn preview`    | Preview the production build                 |

## Starlight Resources

- [Starlight Documentation](https://starlight.astro.build/)
- [Astro Documentation](https://docs.astro.build)