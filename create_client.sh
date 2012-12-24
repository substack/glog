#!/bin/bash
mkdir -p client-keys
openssl genrsa -out client-keys/key.pem 2048
