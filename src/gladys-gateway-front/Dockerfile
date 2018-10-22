FROM node:8 as build-stage

WORKDIR /app

RUN npm -g config set user root
RUN npm install -g preact-cli

COPY package*.json /app/

RUN npm install

COPY ./ /app/

ARG SERVER_URL
ENV SERVER_URL ${SERVER_URL}
ARG STRIPE_API_KEY
ENV STRIPE_API_KEY ${STRIPE_API_KEY}
ARG NODE_ENV
ENV NODE_ENV ${NODE_ENV}

RUN npm run build

FROM nginx:1.15

COPY --from=build-stage /app/build/ /usr/share/nginx/html

COPY --from=build-stage /app/nginx.conf /etc/nginx/conf.d/default.conf