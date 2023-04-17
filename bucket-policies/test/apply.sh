#!/bin/bash

aws s3api put-bucket-lifecycle-configuration \
    --bucket gladys-gateway-test \
    --endpoint https://s3.eu-central-1.amazonaws.com \
    --lifecycle-configuration file://rules.json

aws s3api get-bucket-lifecycle-configuration \
    --bucket gladys-gateway-test \
    --endpoint https://s3.eu-central-1.amazonaws.com

aws s3api put-bucket-lifecycle-configuration \
    --bucket gladys-gateway-test-singapore \
    --endpoint https://s3.ap-southeast-1.amazonaws.com \
    --lifecycle-configuration file://rules.json

aws s3api get-bucket-lifecycle-configuration \
    --bucket gladys-gateway-test-singapore \
    --endpoint https://s3.ap-southeast-1.amazonaws.com

aws s3api put-bucket-lifecycle-configuration \
    --bucket gladys-gateway-live-streaming \
    --endpoint https://fra1.digitaloceanspaces.com \
    --lifecycle-configuration file://camera_bucket_rules.json

aws s3api get-bucket-lifecycle-configuration \
   --bucket gladys-gateway-live-streaming \
    --endpoint https://fra1.digitaloceanspaces.com