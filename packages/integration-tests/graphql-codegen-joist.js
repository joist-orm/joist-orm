const mappers = {
  Author: "@src/entities#AuthorId",
  Book: "@src/entities#BookId",
  BookReview: "@src/entities#BookReviewId",
  Publisher: "@src/entities#PublisherId",
  PublisherSizeDetail: "@src/entities#PublisherSize",
  Tag: "@src/entities#TagId",
};

const enumValues = {
  PublisherSize: "@src/entities#PublisherSize",
};

module.exports = { mappers, enumValues };
