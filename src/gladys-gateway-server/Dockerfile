FROM node:16-alpine

ARG MAX_MIND_LICENSE_KEY
ENV MAX_MIND_LICENSE_KEY=$MAX_MIND_LICENSE_KEY

# Add tzdata for timezone settings
RUN apk add --no-cache tzdata

# Create src folder
RUN mkdir /src

WORKDIR /src
ADD . /src

RUN apk add --no-cache --virtual .build-deps make gcc g++ python3 git && \
  npm install && apk del .build-deps

RUN if [[ -n "$MAX_MIND_LICENSE_KEY" ]] ; \
  then cd node_modules/geoip-lite && npm run-script updatedb license_key=$MAX_MIND_LICENSE_KEY; \
  fi

# Export listening port
EXPOSE 3000

CMD ["node" ,"index.js"]