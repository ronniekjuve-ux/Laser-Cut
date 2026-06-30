FROM node:20-alpine AS build
WORKDIR /app

# DEBUG: check environment before anything else
RUN echo "=== DEBUG: node version ===" && node --version
RUN echo "=== DEBUG: npm version ===" && npm --version
RUN echo "=== DEBUG: which npm ===" && which npm
RUN echo "=== DEBUG: PATH ===" && echo $PATH
RUN echo "=== DEBUG: user ===" && whoami
RUN echo "=== DEBUG: os-release ===" && cat /etc/os-release 2>&1 | head -3
RUN echo "=== DEBUG: shell ===" && echo $SHELL

COPY package*.json ./

# DEBUG: verify package.json was copied and is valid
RUN echo "=== DEBUG: files in /app ===" && ls -la /app/
RUN echo "=== DEBUG: package.json exists ===" && test -f package.json && echo "YES" || echo "NO"
RUN echo "=== DEBUG: package.json content ===" && cat package.json | head -5

RUN npm ci

# DEBUG: verify node_modules after install
RUN echo "=== DEBUG: node_modules exists ===" && test -d node_modules && echo "YES" || echo "NO"
RUN echo "=== DEBUG: .bin contents ===" && ls node_modules/.bin/ 2>&1 | head -10

COPY . .

# DEBUG: verify everything is in place before build
RUN echo "=== DEBUG: final files ===" && ls -la /app/
RUN echo "=== DEBUG: package.json build script ===" && node -e "const p = require('./package.json'); console.log('build:', p.scripts?.build)"

RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
