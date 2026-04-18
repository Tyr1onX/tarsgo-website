FROM node:20-alpine AS dependencies
WORKDIR /app
COPY package.json ./
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app
COPY . /app
COPY --from=dependencies /app/node_modules /app/node_modules
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY --from=dependencies /app/node_modules /app/node_modules
COPY --from=build /app/build /app/build
CMD ["npm", "run", "start"]
