const mappers = {
  AdvanceStatusDetail: "src/entities#AdvanceStatus",
  Author: "src/entities#Author",
  AuthorSchedule: "src/entities#AuthorSchedule",
  AuthorStat: "src/entities#AuthorStat",
  Book: "src/entities#Book",
  BookAdvance: "src/entities#BookAdvance",
  BookReview: "src/entities#BookReview",
  ColorDetail: "src/entities#Color",
  Comment: "src/entities#Comment",
  Critic: "src/entities#Critic",
  CriticColumn: "src/entities#CriticColumn",
  Image: "src/entities#Image",
  ImageTypeDetail: "src/entities#ImageType",
  LargePublisher: "src/entities#LargePublisher",
  Publisher: "src/entities#Publisher",
  PublisherGroup: "src/entities#PublisherGroup",
  PublisherSizeDetail: "src/entities#PublisherSize",
  PublisherTypeDetail: "src/entities#PublisherType",
  SmallPublisher: "src/entities#SmallPublisher",
  Tag: "src/entities#Tag",
  User: "src/entities#User",
};

const enumValues = {
  AdvanceStatus: "src/entities#AdvanceStatus",
  Color: "src/entities#Color",
  ImageType: "src/entities#ImageType",
  PublisherSize: "src/entities#PublisherSize",
  PublisherType: "src/entities#PublisherType",
};

module.exports = { mappers, enumValues };
