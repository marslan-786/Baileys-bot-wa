FROM node:current-alpine

RUN apk add --no-cache git

WORKDIR /app

COPY package.json ./

RUN npm install

COPY . .

EXPOSE 8080

CMD ["npm", "start"]
