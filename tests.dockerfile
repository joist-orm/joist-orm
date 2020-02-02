FROM node:12.7.0
WORKDIR /home/node/app
COPY package.json package-lock.json ./
RUN npm install
COPY ./env.docker ./
COPY ./graphql-codegen.yml ./
COPY ./.prettierrc.js ./
COPY ./jest.config.js ./
COPY ./tsconfig.json ./
COPY ./migrations ./migrations
COPY ./codegen ./codegen
COPY ./schema ./schema
COPY ./src ./src
RUN npm run graphql-codegen
CMD sleep infinity
