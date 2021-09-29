const mappers = {
  AdvanceStatusDetail: "src/entities#AdvanceStatus",
  Author: "src/entities#AuthorId",
  Book: "src/entities#BookId",
  BookAdvance: "src/entities#BookAdvanceId",
  BookReview: "src/entities#BookReviewId",
  ColorDetail: "src/entities#Color",
  Critic: "src/entities#CriticId",
  Image: "src/entities#ImageId",
  ImageTypeDetail: "src/entities#ImageType",
  Publisher: "src/entities#PublisherId",
  PublisherSizeDetail: "src/entities#PublisherSize",
  PublisherTypeDetail: "src/entities#PublisherType",
  Tag: "src/entities#TagId",
};

const enumValues = {
  AdvanceStatus: "src/entities#AdvanceStatus",
  Color: "src/entities#Color",
  ImageType: "src/entities#ImageType",
  PublisherSize: "src/entities#PublisherSize",
  PublisherType: "src/entities#PublisherType",
};

module.exports = { mappers, enumValues };
