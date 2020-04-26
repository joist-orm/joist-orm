FROM node:14.0.0
WORKDIR /home/node/app
COPY . .
RUN yarn install
RUN yarn build
CMD sleep infinity
