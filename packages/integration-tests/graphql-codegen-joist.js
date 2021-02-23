const mappers = {
  AdvanceStatusDetail: "src/entities#AdvanceStatus",
  Author: "src/entities#AuthorId",
  Book: "src/entities#BookId",
  BookAdvance: "src/entities#BookAdvanceId",
  BookReview: "src/entities#BookReviewId",
  Critic: "src/entities#CriticId",
  Image: "src/entities#ImageId",
  ImageTypeDetail: "src/entities#ImageType",
  Publisher: "src/entities#PublisherId",
  PublisherSizeDetail: "src/entities#PublisherSize",
  Tag: "src/entities#TagId",
};

const enumValues = {
  AdvanceStatus: "src/entities#AdvanceStatus",
  ImageType: "src/entities#ImageType",
  PublisherSize: "src/entities#PublisherSize",
};

module.exports = { mappers, enumValues };
