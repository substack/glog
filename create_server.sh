#!/bin/bash
mkdir -p server-keys
openssl genrsa -out server-keys/key.pem 2048
openssl req -new -key server-keys/key.pem -out server-keys/csr.pem

openssl x509 -req \
    -in server-keys/csr.pem \
    -signkey server-keys/key.pem \
    -out server-keys/cert.pem
