#!/bin/bash

aws s3api put-bucket-lifecycle-configuration \
    --bucket gladys-gateway-test \
    --endpoint https://s3.eu-central-1.amazonaws.com \
    --lifecycle-configuration file://rules.json

aws s3api get-bucket-lifecycle-configuration \
    --bucket gladys-gateway-test \
    --endpoint https://s3.eu-central-1.amazonaws.com