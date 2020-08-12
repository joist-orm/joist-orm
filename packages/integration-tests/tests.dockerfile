FROM node:14.8.0
WORKDIR /home/node/app
COPY . .
RUN yarn install
RUN yarn build
CMD sleep infinity
