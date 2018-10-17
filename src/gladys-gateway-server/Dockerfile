FROM node:8-alpine

# Add tzdata for timezone settings
RUN apk add --no-cache tzdata

# Create src folder
RUN mkdir /src

WORKDIR /src
ADD . /src

RUN apk add --no-cache --virtual .build-deps make gcc g++ python git && \
    npm install && apk del .build-deps

# Export listening port
EXPOSE 3000

CMD ["node" ,"index.js"]