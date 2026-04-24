#!/bin/bash

docker compose exec -T postgres psql -U grsu -d grsu_ide_auth < ./db/seed_auth.sql