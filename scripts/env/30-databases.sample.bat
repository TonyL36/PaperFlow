@echo off
set USER_DB_URL=jdbc:h2:file:./.dev/h2/userdb;MODE=PostgreSQL;AUTO_SERVER=TRUE
set USER_DB_USER=
set USER_DB_PASS=

set CONTENT_DB_URL=jdbc:h2:file:./.dev/h2/contentdb;MODE=PostgreSQL;AUTO_SERVER=TRUE
set CONTENT_DB_USER=
set CONTENT_DB_PASS=
