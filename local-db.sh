#!/bin/bash

docker stop redis-gladysgateway
docker rm -v redis-gladysgateway

docker stop postgres-gladysgateway
docker rm -v postgres-gladysgateway

docker run --name postgres-gladysgateway -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=gladysgatewaytest -p 5432:5432  -d postgres:14 
docker run --name redis-gladysgateway -p 6379:6379 -d redis:7