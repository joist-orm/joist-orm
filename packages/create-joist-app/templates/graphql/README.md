# {{PROJECT_NAME}}

A [Joist ORM](https://joist-orm.io/) project with GraphQL.

## Getting Started

### Prerequisites

- Node.js 18+
- Docker (for PostgreSQL)

### Setup

1. Start the database and run initial setup:

```bash
yarn db
```

This command will:
- Start a PostgreSQL container
- Run database migrations
- Generate Joist entity code and GraphQL types

### Development

#### Starting the Server

```bash
yarn dev
```

The GraphQL server will start at http://localhost:4000

#### Running Tests

```bash
yarn test
```

#### Creating a New Migration

```bash
yarn migrate:new my-migration-name
```

Then edit the generated file in `migrations/` and run:

```bash
yarn migrate
yarn codegen
```

#### Resetting the Database

```bash
yarn redb
```

### Project Structure

```
├── migrations/           # Database migrations
├── src/
│   ├── entities/        # Joist entities
│   │   ├── codegen/     # Generated entity code (do not edit)
│   │   └── factories/   # Test factories
│   ├── resolvers/       # GraphQL resolvers
│   ├── generated/       # Generated GraphQL types (do not edit)
│   ├── context.ts       # Request context
│   ├── schema.graphql   # GraphQL schema
│   ├── server.ts        # Apollo Server setup
│   ├── setupTestEnv.ts  # Global test setup
│   └── setupTests.ts    # Per-suite test setup
├── docker-compose.yml   # PostgreSQL service
├── joist-config.json    # Joist configuration
└── codegen.yml          # GraphQL codegen configuration
```

## Learn More

- [Joist Documentation](https://joist-orm.io/)
- [Apollo Server](https://www.apollographql.com/docs/apollo-server/)
- [GitHub Repository](https://github.com/joist-orm/joist-orm)
