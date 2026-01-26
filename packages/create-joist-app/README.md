# create-joist-app

The easiest way to create a new [Joist ORM](https://joist-orm.io/) project.

## Usage

### Using npx (recommended)

```bash
npx create-joist-app my-app
```

### Using yarn

```bash
yarn create joist-app my-app
```

### Using pnpm

```bash
pnpm create joist-app my-app
```

## Options

```
Usage: create-joist-app [project-directory] [options]

Create a new Joist ORM project

Options:
  -V, --version              output the version number
  -t, --template <template>  Template to use (basic, graphql) (default: "basic")
  --use-yarn                 Use Yarn as the package manager
  --use-npm                  Use npm as the package manager
  --use-pnpm                 Use pnpm as the package manager
  --use-bun                  Use Bun as the package manager
  --skip-install             Skip installing dependencies
  -y, --yes                  Use default options (non-interactive mode)
  --db-host <host>           Database host (default: "localhost")
  --db-port <port>           Database port (default: "5432")
  --db-user <user>           Database user
  --db-password <password>   Database password (default: "local")
  --db-name <name>           Database name
  -h, --help                 display help for command
```

## Templates

### Basic

A minimal Joist project with:
- Author and Book example entities
- Database migrations
- Test setup with Jest
- Docker Compose for PostgreSQL

### GraphQL

Everything in the basic template, plus:
- Apollo Server setup
- GraphQL schema
- Example resolvers
- GraphQL Code Generator configuration

## Getting Started

After creating your project:

```bash
cd my-app

# Start the database and run setup
yarn db

# Run tests
yarn test
```

## Project Structure

The generated project includes:

```
my-app/
├── migrations/           # Database migrations
├── src/
│   ├── entities/        # Joist entities
│   │   ├── codegen/     # Generated code (do not edit)
│   │   └── factories/   # Test factories
│   ├── context.ts       # Request context
│   ├── setupTestEnv.ts  # Global test setup
│   └── setupTests.ts    # Per-suite test setup
├── docker-compose.yml   # PostgreSQL service
├── joist-config.json    # Joist configuration
└── package.json
```

## Development Scripts

- `yarn db` - Start database, run migrations, generate code
- `yarn redb` - Reset database, run migrations, generate code
- `yarn test` - Run tests
- `yarn build` - Build for production
- `yarn migrate` - Run database migrations
- `yarn migrate:new` - Create a new migration
- `yarn codegen` - Generate Joist entity code

## CI/CD Testing

The scaffolded project can be tested in CI to ensure compatibility with the latest Joist version:

```bash
# Run basic scaffolding tests
yarn test:scaffolded

# Run full integration tests (requires Docker)
yarn test:scaffolded:full
```

## Learn More

- [Joist Documentation](https://joist-orm.io/)
- [GitHub Repository](https://github.com/joist-orm/joist-orm)
