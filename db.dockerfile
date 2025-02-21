FROM postgres:16.0

ENV APP_DBNAME=joist
ENV APP_USERNAME=joist
ENV APP_PASSWORD=local
ENV POSTGRES_PASSWORD=admin
ENV POSTGRES_USER=postgres
ENV POSTGRES_DB=postgres

# Create the init.sh file. This file is only ran once; if you need to re-run it, use `docker-compose rm db`.
RUN <<-EOF
cat > /init.sh <<'SCRIPT'
#!/bin/bash
set -e
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" <<-EOSQL
  CREATE USER ${APP_USERNAME} PASSWORD '${APP_PASSWORD}';
EOSQL
/reset.sh
SCRIPT
EOF
RUN chmod u+x /init.sh && mv /init.sh /docker-entrypoint-initdb.d/

# Create the reset.sh file
RUN <<-EOF
cat > /reset.sh <<'SCRIPT'
#!/bin/bash
set -e
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" <<-EOSQL
  DROP DATABASE IF EXISTS ${APP_DBNAME} WITH (FORCE);
  CREATE DATABASE ${APP_DBNAME} OWNER ${APP_USERNAME};
  DROP DATABASE IF EXISTS uuid_ids WITH (FORCE);
  CREATE DATABASE uuid_ids OWNER ${APP_USERNAME};
  DROP DATABASE IF EXISTS esm WITH (FORCE);
  CREATE DATABASE esm OWNER ${APP_USERNAME};
  DROP DATABASE IF EXISTS bun WITH (FORCE);
  CREATE DATABASE bun OWNER ${APP_USERNAME};
  DROP DATABASE IF EXISTS schema_misc WITH (FORCE);
  CREATE DATABASE schema_misc OWNER ${APP_USERNAME};
  DROP DATABASE IF EXISTS number_ids WITH (FORCE);
  CREATE DATABASE number_ids OWNER ${APP_USERNAME};
  DROP DATABASE IF EXISTS untagged_ids WITH (FORCE);
  CREATE DATABASE untagged_ids OWNER ${APP_USERNAME};
  DROP DATABASE IF EXISTS temporal WITH (FORCE);
  CREATE DATABASE temporal OWNER ${APP_USERNAME};
  DROP DATABASE IF EXISTS immediate_foreign_keys WITH (FORCE);
  CREATE DATABASE immediate_foreign_keys OWNER ${APP_USERNAME};
EOSQL
SCRIPT
EOF
RUN chmod uo+x /reset.sh

# Create the console.sh file
RUN echo "#!/bin/bash" > /console.sh && \
  echo "set -e" >> /console.sh && \
  echo "psql -v ON_ERROR_STOP=1 --username ${APP_USERNAME} --dbname ${APP_DBNAME}" >> /console.sh && \
  chmod u+x /console.sh

CMD ["postgres", "-c", "fsync=off"]
