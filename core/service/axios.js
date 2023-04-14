const axios = require('axios');
const AxiosLogger = require('axios-logger');
const tracer = require('tracer');

const axiosInstance = axios.create();

const logger = tracer.colorConsole({
  level: process.env.LOG_LEVEL || 'debug',
});

const responseLogger = (response) =>
  AxiosLogger.responseLogger(response, {
    data: false,
    logger: logger.info.bind(this),
  });

const requestLogger = (request) =>
  AxiosLogger.requestLogger(request, {
    logger: logger.info.bind(this),
  });

const errorLogger = (error) =>
  AxiosLogger.errorLogger(error, {
    logger: logger.warn.bind(this),
  });

axiosInstance.interceptors.request.use(requestLogger, errorLogger);
axiosInstance.interceptors.response.use(responseLogger, errorLogger);

module.exports = axiosInstance;
