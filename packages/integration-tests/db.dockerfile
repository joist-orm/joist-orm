FROM postgres

# These scripts are only run once on initial db creation; if you need to re-run, use `docker-compose rm db`.
COPY postgres-init /docker-entrypoint-initdb.d/

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
