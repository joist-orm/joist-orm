const mappers = {
  Author: "@src/entities#AuthorId",
  Book: "@src/entities#BookId",
  BookReview: "@src/entities#BookReviewId",
  Publisher: "@src/entities#PublisherId",
  Tag: "@src/entities#TagId",
  PublisherSizeDetail: "@src/entities#PublisherSize",
};

const enumValues = {
  PublisherSize: "@src/entities#PublisherSize",
};

module.exports = { mappers, enumValues };
