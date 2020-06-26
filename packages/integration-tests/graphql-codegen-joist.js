const mappers = {
  Author: "@src/entities#AuthorId",
  Book: "@src/entities#BookId",
  BookReview: "@src/entities#BookReviewId",
  Image: "@src/entities#ImageId",
  ImageTypeDetail: "@src/entities#ImageType",
  Publisher: "@src/entities#PublisherId",
  PublisherSizeDetail: "@src/entities#PublisherSize",
  Tag: "@src/entities#TagId",
};

const enumValues = {
  ImageType: "@src/entities#ImageType",
  PublisherSize: "@src/entities#PublisherSize",
};

module.exports = { mappers, enumValues };
