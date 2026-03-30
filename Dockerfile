FROM node:current-alpine

WORKDIR /app

COPY package.json ./

RUN npm install

COPY . .

VOLUME [ "/app/baileys_auth_info" ]

EXPOSE 8080

CMD ["npm", "start"]
