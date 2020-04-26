FROM postgres:10.7
ARG APP_DBNAME=joist
ARG APP_USERNAME=joist
ARG APP_PASSWORD=local

# Create the init.sh file. This file is only ran once; if you need to re-run it, use `docker-compose rm db`.
RUN echo "#!/bin/bash" > /init.sh && \
  echo "set -e" >> /init.sh && \
  echo "psql -v ON_ERROR_STOP=1 --username "\$POSTGRES_USER" --dbname "\$POSTGRES_DB" <<-EOSQL" >> /init.sh && \
  echo "  CREATE USER ${APP_USERNAME} PASSWORD '${APP_PASSWORD}';" >> /init.sh && \
  echo "  CREATE DATABASE ${APP_DBNAME};" >> /init.sh && \
  echo "  GRANT ALL PRIVILEGES ON DATABASE ${APP_DBNAME} TO ${APP_USERNAME};" >> /init.sh && \
  echo "EOSQL" >> /init.sh && \
  chmod u+x /init.sh && \
  mv /init.sh /docker-entrypoint-initdb.d/

# Create the reset.sh file
RUN echo "#!/bin/bash" > /reset.sh && \
  echo "set -e" >> /reset.sh && \
  echo "psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres <<-EOSQL" >> /reset.sh && \
  echo "  DROP DATABASE ${APP_DBNAME};" >> /reset.sh && \
  echo "  CREATE DATABASE ${APP_DBNAME};" >> /reset.sh && \
  echo "  GRANT ALL PRIVILEGES ON DATABASE ${APP_DBNAME} TO ${APP_USERNAME};" >> /reset.sh && \
  echo "EOSQL" >> /reset.sh && \
  chmod u+x /reset.sh

# Create the console.sh file
RUN echo "#!/bin/bash" > /console.sh && \
  echo "set -e" >> /console.sh && \
  echo "psql -v ON_ERROR_STOP=1 --username ${APP_USERNAME} --dbname ${APP_DBNAME}" >> /console.sh && \
  chmod u+x /console.sh
