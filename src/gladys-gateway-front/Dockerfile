FROM node:8 as build-stage

WORKDIR /app

RUN npm -g config set user root
RUN npm install -g preact-cli

COPY package*.json /app/

RUN npm install

COPY ./ /app/

RUN npm run build

FROM nginx:1.15

COPY --from=build-stage /app/build/ /usr/share/nginx/html

COPY --from=build-stage /app/nginx.conf /etc/nginx/conf.d/default.conf