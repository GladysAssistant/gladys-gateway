# Gladys Gateway Server [![Build Status](https://travis-ci.org/GladysProject/gladys-gateway.svg?branch=master&style=flat-square)](https://travis-ci.org/GladysProject/gladys-gateway)

The goal of the Gladys Gateway server is to be the proxy between the frontend and the Gladys instance of the user.

## Prerequisites

- Node.js >= v8
- PostgreSQL >= 9.6
- Redis

## Installation

First step, clone this repository

```
git clone https://github.com/GladysProject/gladys-gateway
```

Move in the gladys gateway server folder

```
cd gladys-gateway/src/gladys-gateway-server
```

Install global dependencies:

```
npm install -g db-migrate
```

Install dependencies 

```
npm install
```

Create a .env file with your configuration

```
cp .env.example .env
```

Change the content of the .env with your configuration (PostgreSQL users, ...)

Create the database and all tables

```
db-migrate up -e dev
```

Run the backend

```
npm start
```