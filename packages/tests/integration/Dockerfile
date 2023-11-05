# Run codegen and build first
FROM node:14.8.0 as build
WORKDIR /home/node/app
COPY ../orm package-lock.json .npmrc ./
RUN npm ci
COPY ./graphql-codegen.yml ./
COPY ../../tsconfig.json ./
COPY ./codegen ./codegen
COPY migrations ./migrations
COPY ./schema ./schema
COPY ../orm ./src
RUN npm run graphql-codegen
RUN npm run build

# Now start over with out dev dependencies
FROM node:14.8.0 as runtime
WORKDIR /home/node/app
COPY ../orm package-lock.json ./
RUN npm ci --only=production

COPY ../../tsconfig.json ./
COPY ./schema ./schema
COPY --from=build /home/node/app/dist/src ./src
COPY --from=build /home/node/app/dist/migrations ./migrations
COPY --from=build /home/node/app/dist/codegen ./codegen
# Copy over our entity.ts files for MikroORM to scan (not amazing)
COPY ../orm ./src/entities
CMD ["node", "-r", "tsconfig-paths/register", "src/express.js"]
EXPOSE 4000
