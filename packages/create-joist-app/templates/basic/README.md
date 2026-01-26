# {{PROJECT_NAME}}

A [Joist ORM](https://joist-orm.io/) project.

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
- Generate Joist entity code

### Development

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
│   │   ├── codegen/     # Generated code (do not edit)
│   │   └── factories/   # Test factories
│   ├── context.ts       # Request context
│   ├── setupTestEnv.ts  # Global test setup
│   └── setupTests.ts    # Per-suite test setup
├── docker-compose.yml   # PostgreSQL service
└── joist-config.json    # Joist configuration
```

## Learn More

- [Joist Documentation](https://joist-orm.io/)
- [GitHub Repository](https://github.com/joist-orm/joist-orm)
