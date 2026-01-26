FROM postgres:16

# Script to reset the database
RUN echo '#!/bin/bash\nset -e\npsql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL\n  DROP DATABASE IF EXISTS "$POSTGRES_DB";\n  CREATE DATABASE "$POSTGRES_DB";\nEOSQL' > /docker-entrypoint-initdb.d/reset.sh \
    && chmod +x /docker-entrypoint-initdb.d/reset.sh

# Copy reset script to accessible location
RUN echo '#!/bin/bash\nset -e\npsql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL\n  DROP DATABASE IF EXISTS "$POSTGRES_DB";\n  CREATE DATABASE "$POSTGRES_DB";\nEOSQL' > /reset.sh \
    && chmod +x /reset.sh

# Console script for easy database access
RUN echo '#!/bin/bash\npsql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > /console.sh \
    && chmod +x /console.sh
