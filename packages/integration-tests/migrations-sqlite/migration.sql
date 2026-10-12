CREATE TABLE migrations
  (
    id serial
      PRIMARY KEY,
    name varchar(255) NOT NULL,
    run_on timestamp NOT NULL
  );

CREATE TABLE publisher_size
  (
    id serial
      PRIMARY KEY,
    code text NOT NULL
      CONSTRAINT publisher_size_unique_enum_code_constraint
        UNIQUE,
    name text NOT NULL
  );

CREATE TABLE publisher_type
  (
    id serial
      PRIMARY KEY,
    code text NOT NULL
      CONSTRAINT publisher_type_unique_enum_code_constraint
        UNIQUE,
    name text NOT NULL
  );

CREATE TABLE tags
  (
    id serial
      PRIMARY KEY,
    name varchar(255) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
  );

CREATE TABLE publishers
  (
    id serial
      PRIMARY KEY,
    name varchar(255) NOT NULL,
    size_id integer
      REFERENCES publisher_size,
    type_id integer DEFAULT 2 NOT NULL
      REFERENCES publisher_type,
    latitude numeric(9, 6),
    longitude numeric(9, 6),
    huge_number numeric(17),
    tag_id integer
      REFERENCES tags DEFERRABLE INITIALLY DEFERRED,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
  );

CREATE INDEX publishers_size_id_idx ON publishers (size_id);

CREATE INDEX publishers_type_id_idx ON publishers (type_id);

CREATE INDEX publishers_tag_id_idx ON publishers (tag_id);

CREATE TABLE color
  (
    id serial
      PRIMARY KEY,
    code text NOT NULL
      CONSTRAINT color_unique_enum_code_constraint
        UNIQUE,
    name text NOT NULL
  );

CREATE TABLE authors
  (
    id serial
      PRIMARY KEY,
    first_name varchar(255) NOT NULL,
    last_name varchar(255),
    initials varchar(255) NOT NULL,
    number_of_books integer NOT NULL,
    book_comments text,
    is_popular boolean,
    age integer,
    graduated date,
    favorite_colors integer [],
    was_ever_popular boolean,
    ignore_used_to_be_useful boolean DEFAULT TRUE,
    ignore_used_to_be_useful_required_with_default boolean DEFAULT TRUE NOT NULL,
    ignore_enum_fk_id integer
      REFERENCES publisher_size DEFERRABLE INITIALLY DEFERRED,
    ignore_enum_fk_id_required_with_default integer DEFAULT 1 NOT NULL
      REFERENCES publisher_size DEFERRABLE INITIALLY DEFERRED,
    publisher_id integer
      REFERENCES publishers DEFERRABLE INITIALLY DEFERRED,
    mentor_id integer
      REFERENCES authors DEFERRABLE INITIALLY DEFERRED,
    address jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    current_draft_book_id integer
      UNIQUE
  );

CREATE INDEX authors_ignore_enum_fk_id_idx ON authors (ignore_enum_fk_id);

CREATE INDEX authors_ignore_enum_fk_id_required_with_default_idx ON authors (ignore_enum_fk_id_required_with_default);

CREATE INDEX authors_publisher_id_idx ON authors (publisher_id);

CREATE INDEX authors_mentor_id_idx ON authors (mentor_id);

CREATE INDEX authors_current_draft_book_id_idx ON authors (current_draft_book_id);

CREATE TABLE advance_status
  (
    id serial
      PRIMARY KEY,
    code text NOT NULL
      CONSTRAINT advance_status_unique_enum_code_constraint
        UNIQUE,
    name text NOT NULL
  );

CREATE TABLE books
  (
    id serial
      PRIMARY KEY,
    title varchar(255) NOT NULL,
    author_id integer NOT NULL
      REFERENCES authors DEFERRABLE INITIALLY DEFERRED,
    "order" integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
  );

ALTER TABLE authors ADD COLUMN current_draft_book_id integer;
-- alter table authors add constraint authors_current_draft_book_id foreign key (current_draft_book_id) references books; deferrable initially deferred;

CREATE INDEX books_author_id_idx ON books (author_id);

CREATE TABLE book_advances
  (
    id serial
      PRIMARY KEY,
    status_id integer NOT NULL
      REFERENCES advance_status DEFERRABLE INITIALLY DEFERRED,
    publisher_id integer NOT NULL
      REFERENCES publishers DEFERRABLE INITIALLY DEFERRED,
    book_id integer NOT NULL
      REFERENCES books DEFERRABLE INITIALLY DEFERRED,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
  );

CREATE INDEX book_advances_status_id_idx ON book_advances (status_id);

CREATE INDEX book_advances_publisher_id_idx ON book_advances (publisher_id);

CREATE INDEX book_advances_book_id_idx ON book_advances (book_id);

CREATE TABLE critics
  (
    id serial
      PRIMARY KEY,
    name varchar(255) NOT NULL,
    ignore_favourite_book_id integer
      REFERENCES books DEFERRABLE INITIALLY DEFERRED,
    ignore_worst_book_id integer
      UNIQUE
      REFERENCES books DEFERRABLE INITIALLY DEFERRED,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
  );

CREATE INDEX critics_ignore_favourite_book_id_idx ON critics (ignore_favourite_book_id);

CREATE INDEX critics_ignore_worst_book_id_idx ON critics (ignore_worst_book_id);

CREATE TABLE critic_columns
  (
    id serial
      PRIMARY KEY,
    name varchar(255) NOT NULL,
    critic_id integer NOT NULL
      UNIQUE
      REFERENCES critics DEFERRABLE INITIALLY DEFERRED,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
  );

CREATE INDEX critic_columns_critic_id_idx ON critic_columns (critic_id);

CREATE TABLE book_reviews
  (
    id serial
      PRIMARY KEY,
    rating integer NOT NULL,
    book_id integer NOT NULL
      REFERENCES books DEFERRABLE INITIALLY DEFERRED,
    is_public boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
  );

CREATE INDEX book_reviews_book_id_idx ON book_reviews (book_id);

CREATE TABLE critics_to_tags
  (
    id serial
      PRIMARY KEY,
    critic_id integer NOT NULL
      REFERENCES critics ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    tag_id integer NOT NULL
      REFERENCES tags ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    created_at timestamp with time zone NOT NULL
  );

CREATE UNIQUE INDEX critics_to_tags_critic_id_tag_id_unique_index ON critics_to_tags (critic_id, tag_id);

CREATE TABLE authors_to_tags
  (
    id serial
      PRIMARY KEY,
    author_id integer NOT NULL
      REFERENCES authors ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    tag_id integer NOT NULL
      REFERENCES tags ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    created_at timestamp with time zone NOT NULL
  );

CREATE UNIQUE INDEX authors_to_tags_author_id_tag_id_unique_index ON authors_to_tags (author_id, tag_id);

CREATE TABLE books_to_tags
  (
    id serial
      PRIMARY KEY,
    book_id integer NOT NULL
      REFERENCES books ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    tag_id integer NOT NULL
      REFERENCES tags ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    created_at timestamp with time zone NOT NULL
  );

CREATE UNIQUE INDEX books_to_tags_book_id_tag_id_unique_index ON books_to_tags (book_id, tag_id);

CREATE TABLE image_type
  (
    id serial
      PRIMARY KEY,
    code text NOT NULL
      CONSTRAINT image_type_unique_enum_code_constraint
        UNIQUE,
    name text NOT NULL,
    sort_order integer DEFAULT 1000000 NOT NULL,
    visible boolean DEFAULT TRUE NOT NULL,
    nickname text DEFAULT '' NOT NULL
  );

CREATE TABLE images
  (
    id serial
      PRIMARY KEY,
    type_id integer NOT NULL
      REFERENCES image_type DEFERRABLE INITIALLY DEFERRED,
    file_name varchar(255) NOT NULL,
    book_id integer
      UNIQUE
      REFERENCES books DEFERRABLE INITIALLY DEFERRED,
    author_id integer
      UNIQUE
      REFERENCES authors DEFERRABLE INITIALLY DEFERRED,
    publisher_id integer
      REFERENCES publishers DEFERRABLE INITIALLY DEFERRED,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
  );

CREATE INDEX images_type_id_idx ON images (type_id);

CREATE INDEX images_book_id_idx ON images (book_id);

CREATE INDEX images_author_id_idx ON images (author_id);

CREATE INDEX images_publisher_id_idx ON images (publisher_id);

CREATE TABLE comments
  (
    id serial
      PRIMARY KEY,
    parent_book_id integer
      REFERENCES books DEFERRABLE INITIALLY DEFERRED,
    parent_book_review_id integer
      UNIQUE
      REFERENCES book_reviews DEFERRABLE INITIALLY DEFERRED,
    parent_publisher_id integer
      REFERENCES publishers DEFERRABLE INITIALLY DEFERRED,
    parent_author_id integer
      REFERENCES authors DEFERRABLE INITIALLY DEFERRED,
    text text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
  );

CREATE INDEX comments_parent_book_id_idx ON comments (parent_book_id);

CREATE INDEX comments_parent_book_review_id_idx ON comments (parent_book_review_id);

CREATE INDEX comments_parent_publisher_id_idx ON comments (parent_publisher_id);

CREATE INDEX comments_parent_author_id_idx ON comments (parent_author_id);

CREATE TABLE author_stats
  (
    id serial
      PRIMARY KEY,
    smallint smallint NOT NULL,
    integer integer NOT NULL,
    bigint bigint NOT NULL,
    decimal numeric NOT NULL,
    real real NOT NULL,
    smallserial smallserial,
    serial serial,
    bigserial bigserial,
    double_precision double precision NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
  );

