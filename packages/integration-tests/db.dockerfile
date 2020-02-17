FROM postgres

# TODO Accept the database name/user name as build args.

# Create the init.sh file. This file is only ran once; if you need to re-run it, use `docker-compose rm db`.
RUN echo "#!/bin/bash" > /init.sh && \
  echo "set -e" >> /init.sh && \
  echo "psql -v ON_ERROR_STOP=1 --username "\$POSTGRES_USER" --dbname "\$POSTGRES_DB" <<-EOSQL" >> /init.sh && \
  echo "  CREATE USER joist PASSWORD 'local';" >> /init.sh && \
  echo "  CREATE DATABASE joist;" >> /init.sh && \
  echo "  GRANT ALL PRIVILEGES ON DATABASE joist TO joist;" >> /init.sh && \
  echo "EOSQL" >> /init.sh && \
  chmod u+x /init.sh && \
  mv /init.sh /docker-entrypoint-initdb.d/

# Create the reset.sh file
RUN echo "#!/bin/bash" > /reset.sh && \
  echo "set -e" >> /reset.sh && \
  echo "psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres <<-EOSQL" >> /reset.sh && \
  echo "  DROP DATABASE joist;" >> /reset.sh && \
  echo "  CREATE DATABASE joist;" >> /reset.sh && \
  echo "  GRANT ALL PRIVILEGES ON DATABASE joist TO joist;" >> /reset.sh && \
  echo "EOSQL" >> /reset.sh && \
  chmod u+x /reset.sh

# Create the console.sh file
RUN echo "#!/bin/bash" > /console.sh && \
  echo "set -e" >> /console.sh && \
  echo "psql -v ON_ERROR_STOP=1 --username joist --dbname joist" >> /console.sh && \
  chmod u+x /console.sh
