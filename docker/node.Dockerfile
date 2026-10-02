# Node with git, which scripts/discover.ts needs for `git ls-remote`.
FROM node:24-alpine

RUN apk add --no-cache git
