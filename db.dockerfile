FROM postgres:16.0
ARG APP_DBNAME=joist
ARG APP_USERNAME=joist
ARG APP_PASSWORD=local

ENV POSTGRES_PASSWORD=admin
ENV POSTGRES_USER=postgres
ENV POSTGRES_DB=postgres

# Create the init.sh file. This file is only ran once; if you need to re-run it, use `docker-compose rm db`.
RUN echo "#!/bin/bash" > /init.sh && \
  echo "set -e" >> /init.sh && \
  echo "psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" <<-EOSQL" >> /init.sh && \
  echo "  CREATE USER ${APP_USERNAME} PASSWORD '${APP_PASSWORD}';" >> /init.sh && \
  echo "EOSQL" >> /init.sh && \
  echo "/reset.sh" >> /init.sh && \
  chmod u+x /init.sh && \
  mv /init.sh /docker-entrypoint-initdb.d/

# Create the reset.sh file
RUN echo "#!/bin/bash" > /reset.sh && \
  echo "set -e" >> /reset.sh && \
  echo "psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" <<-EOSQL" >> /reset.sh && \
  echo "  DROP DATABASE IF EXISTS ${APP_DBNAME} WITH (FORCE);" >> /reset.sh && \
  echo "  CREATE DATABASE ${APP_DBNAME} OWNER ${APP_USERNAME};" >> /reset.sh && \
  echo "  DROP DATABASE IF EXISTS uuid_ids WITH (FORCE);" >> /reset.sh && \
  echo "  CREATE DATABASE uuid_ids OWNER ${APP_USERNAME};" >> /reset.sh && \
  echo "  DROP DATABASE IF EXISTS esm WITH (FORCE);" >> /reset.sh && \
  echo "  CREATE DATABASE esm OWNER ${APP_USERNAME};" >> /reset.sh && \
  echo "  DROP DATABASE IF EXISTS bun WITH (FORCE);" >> /reset.sh && \
  echo "  CREATE DATABASE bun OWNER ${APP_USERNAME};" >> /reset.sh && \
  echo "  DROP DATABASE IF EXISTS schema_misc WITH (FORCE);" >> /reset.sh && \
  echo "  CREATE DATABASE schema_misc OWNER ${APP_USERNAME};" >> /reset.sh && \
  echo "  DROP DATABASE IF EXISTS number_ids WITH (FORCE);" >> /reset.sh && \
  echo "  CREATE DATABASE number_ids OWNER ${APP_USERNAME};" >> /reset.sh && \
  echo "  DROP DATABASE IF EXISTS untagged_ids WITH (FORCE);" >> /reset.sh && \
  echo "  CREATE DATABASE untagged_ids OWNER ${APP_USERNAME};" >> /reset.sh && \
  echo "  DROP DATABASE IF EXISTS temporal WITH (FORCE);" >> /reset.sh && \
  echo "  CREATE DATABASE temporal OWNER ${APP_USERNAME};" >> /reset.sh && \
  echo "  DROP DATABASE IF EXISTS immediate_foreign_keys WITH (FORCE);" >> /reset.sh && \
  echo "  CREATE DATABASE immediate_foreign_keys OWNER ${APP_USERNAME};" >> /reset.sh && \
  echo "EOSQL" >> /reset.sh && \
  chmod uo+x /reset.sh

# Create the console.sh file
RUN echo "#!/bin/bash" > /console.sh && \
  echo "set -e" >> /console.sh && \
  echo "psql -v ON_ERROR_STOP=1 --username ${APP_USERNAME} --dbname ${APP_DBNAME}" >> /console.sh && \
  chmod u+x /console.sh

CMD ["postgres", "-c", "fsync=off"]
