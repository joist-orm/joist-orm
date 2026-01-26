import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { loadSchemaSync } from "@graphql-tools/load";
import { GraphQLFileLoader } from "@graphql-tools/graphql-file-loader";
import { EntityManager } from "joist-orm";
import { newPgConnectionConfig } from "joist-orm/pg";
import knex from "knex";
import path from "path";
import { Context } from "./context";
import { entities } from "./entities";
import { resolvers } from "./resolvers";

const typeDefs = loadSchemaSync(path.join(__dirname, "./**/*.graphql"), {
  loaders: [new GraphQLFileLoader()],
});

async function main() {
  const config = newPgConnectionConfig();
  const db = knex({ client: "pg", connection: config });

  const server = new ApolloServer<Context>({
    typeDefs,
    resolvers,
  });

  const { url } = await startStandaloneServer(server, {
    listen: { port: parseInt(process.env.PORT || "4000") },
    context: async () => {
      const em = new EntityManager({ entities, driver: db }, {});
      return { em };
    },
  });

  console.log(`🚀 Server ready at ${url}`);
}

main().catch(console.error);
