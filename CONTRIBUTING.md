# Joist TS Contribution Guide

Thanks for your interest in contributing to Joist TS! We welcome contributions from the community and are happy to help you get started.

## Getting Started

To get started, make sure you have all the [prerequisites](#prerequisites) installed.

**First Time Run Instruction**

1. Install dependencies: `yarn`
1. Build Joist: `yarn build`
1. Open Docker application
1. Install docker image: `yarn db`

**Consecutive Run Instruction**

1. Open Docker application (this is required for the database to run)

### Prerequisites

- [Node.js](https://nodejs.org/en/) (see [.nvmrc](.nvmrc) for the version we use)
- [Yarn](https://yarnpkg.com/en/docs/install)
- [Docker](https://docs.docker.com/install/)

## Development Flow

It is recommended to run the built command in watch mode when developing locally. This will automatically rebuild the project when changes are made.

```sh
yarn build --watch
```

When updating migration files, you will need to run the `db` command to rebuild the database.

```sh
yarn db
```

To run the tests, run the following command:

```sh
yarn test
```
