FROM node:23.1.0-alpine

WORKDIR /app
COPY package*.json angular.json .

RUN npm install -g @angular/cli \
    && npm ci

COPY . .

CMD ng serve --host 0.0.0.0 --disable-host-check
