// organize-imports-ignore

import { scope, type ScopeFactory } from "joist-orm";
import { type AdminUser } from "./AdminUser";
import { type Author } from "./Author";
import { type AuthorSchedule } from "./AuthorSchedule";
import { type AuthorStat } from "./AuthorStat";
import { type Book } from "./Book";
import { type BookAdvance } from "./BookAdvance";
import { type BookReview } from "./BookReview";
import { type Child } from "./Child";
import { type ChildGroup } from "./ChildGroup";
import { type ChildItem } from "./ChildItem";
import { type Comment } from "./Comment";
import { type Critic } from "./Critic";
import { type CriticColumn } from "./CriticColumn";
import { type Employee } from "./Employee";
import { type Image } from "./Image";
import { type LargePublisher } from "./LargePublisher";
import { type ParentGroup } from "./ParentGroup";
import { type ParentItem } from "./ParentItem";
import { type Publisher } from "./Publisher";
import { type PublisherGroup } from "./PublisherGroup";
import { type SmallPublisher } from "./SmallPublisher";
import { type SmallPublisherGroup } from "./SmallPublisherGroup";
import { type Tag } from "./Tag";
import { type Task } from "./Task";
import { type TaskItem } from "./TaskItem";
import { type TaskNew } from "./TaskNew";
import { type TaskOld } from "./TaskOld";
import { type User } from "./User";

// This file drives our import order to avoid undefined errors
// when the subclasses extend the base classes, see:
// https://medium.com/visual-development/how-to-fix-nasty-circular-dependency-issues-once-and-for-all-in-javascript-typescript-a04c987cf0de
export * from "./enums/AdvanceStatus";
export * from "./enums/BookRange";
export * from "./enums/Color";
export * from "./enums/ImageType";
export * from "./enums/PublisherSize";
export * from "./enums/PublisherType";
export * from "./enums/TaskType";
export * from "./enums/FavoriteShape";
export * from "./codegen/AuthorCodegen";
export * from "./codegen/AuthorScheduleCodegen";
export * from "./codegen/AuthorStatCodegen";
export * from "./codegen/BookCodegen";
export * from "./codegen/BookAdvanceCodegen";
export * from "./codegen/BookReviewCodegen";
export * from "./codegen/ChildCodegen";
export * from "./codegen/ChildGroupCodegen";
export * from "./codegen/ChildItemCodegen";
export * from "./codegen/CommentCodegen";
export * from "./codegen/CriticCodegen";
export * from "./codegen/CriticColumnCodegen";
export * from "./codegen/EmployeeCodegen";
export * from "./codegen/ImageCodegen";
export * from "./codegen/ParentGroupCodegen";
export * from "./codegen/ParentItemCodegen";
export * from "./codegen/PublisherCodegen";
export * from "./codegen/PublisherGroupCodegen";
export * from "./codegen/TagCodegen";
export * from "./codegen/TaskCodegen";
export * from "./codegen/TaskItemCodegen";
export * from "./codegen/UserCodegen";
export function authorScope(arg: Parameters<ScopeFactory<Author>>[0]): ReturnType<ScopeFactory<Author>> {
  return scope<Author>("Author")(arg);
}
export function authorScheduleScope(
  arg: Parameters<ScopeFactory<AuthorSchedule>>[0],
): ReturnType<ScopeFactory<AuthorSchedule>> {
  return scope<AuthorSchedule>("AuthorSchedule")(arg);
}
export function authorStatScope(arg: Parameters<ScopeFactory<AuthorStat>>[0]): ReturnType<ScopeFactory<AuthorStat>> {
  return scope<AuthorStat>("AuthorStat")(arg);
}
export function bookScope(arg: Parameters<ScopeFactory<Book>>[0]): ReturnType<ScopeFactory<Book>> {
  return scope<Book>("Book")(arg);
}
export function bookAdvanceScope(arg: Parameters<ScopeFactory<BookAdvance>>[0]): ReturnType<ScopeFactory<BookAdvance>> {
  return scope<BookAdvance>("BookAdvance")(arg);
}
export function bookReviewScope(arg: Parameters<ScopeFactory<BookReview>>[0]): ReturnType<ScopeFactory<BookReview>> {
  return scope<BookReview>("BookReview")(arg);
}
export function childScope(arg: Parameters<ScopeFactory<Child>>[0]): ReturnType<ScopeFactory<Child>> {
  return scope<Child>("Child")(arg);
}
export function childGroupScope(arg: Parameters<ScopeFactory<ChildGroup>>[0]): ReturnType<ScopeFactory<ChildGroup>> {
  return scope<ChildGroup>("ChildGroup")(arg);
}
export function childItemScope(arg: Parameters<ScopeFactory<ChildItem>>[0]): ReturnType<ScopeFactory<ChildItem>> {
  return scope<ChildItem>("ChildItem")(arg);
}
export function commentScope(arg: Parameters<ScopeFactory<Comment>>[0]): ReturnType<ScopeFactory<Comment>> {
  return scope<Comment>("Comment")(arg);
}
export function criticScope(arg: Parameters<ScopeFactory<Critic>>[0]): ReturnType<ScopeFactory<Critic>> {
  return scope<Critic>("Critic")(arg);
}
export function criticColumnScope(
  arg: Parameters<ScopeFactory<CriticColumn>>[0],
): ReturnType<ScopeFactory<CriticColumn>> {
  return scope<CriticColumn>("CriticColumn")(arg);
}
export function employeeScope(arg: Parameters<ScopeFactory<Employee>>[0]): ReturnType<ScopeFactory<Employee>> {
  return scope<Employee>("Employee")(arg);
}
export function imageScope(arg: Parameters<ScopeFactory<Image>>[0]): ReturnType<ScopeFactory<Image>> {
  return scope<Image>("Image")(arg);
}
export function parentGroupScope(
  arg: Parameters<ScopeFactory<ParentGroup>>[0],
): ReturnType<ScopeFactory<ParentGroup>> {
  return scope<ParentGroup>("ParentGroup")(arg);
}
export function parentItemScope(arg: Parameters<ScopeFactory<ParentItem>>[0]): ReturnType<ScopeFactory<ParentItem>> {
  return scope<ParentItem>("ParentItem")(arg);
}
export function publisherScope(arg: Parameters<ScopeFactory<Publisher>>[0]): ReturnType<ScopeFactory<Publisher>> {
  return scope<Publisher>("Publisher")(arg);
}
export function publisherGroupScope(
  arg: Parameters<ScopeFactory<PublisherGroup>>[0],
): ReturnType<ScopeFactory<PublisherGroup>> {
  return scope<PublisherGroup>("PublisherGroup")(arg);
}
export function tagScope(arg: Parameters<ScopeFactory<Tag>>[0]): ReturnType<ScopeFactory<Tag>> {
  return scope<Tag>("Tag")(arg);
}
export function taskScope(arg: Parameters<ScopeFactory<Task>>[0]): ReturnType<ScopeFactory<Task>> {
  return scope<Task>("Task")(arg);
}
export function taskItemScope(arg: Parameters<ScopeFactory<TaskItem>>[0]): ReturnType<ScopeFactory<TaskItem>> {
  return scope<TaskItem>("TaskItem")(arg);
}
export function userScope(arg: Parameters<ScopeFactory<User>>[0]): ReturnType<ScopeFactory<User>> {
  return scope<User>("User")(arg);
}
export * from "./Author";
export * from "./AuthorSchedule";
export * from "./AuthorStat";
export * from "./Book";
export * from "./BookAdvance";
export * from "./BookReview";
export * from "./Child";
export * from "./ChildGroup";
export * from "./ChildItem";
export * from "./Comment";
export * from "./Critic";
export * from "./CriticColumn";
export * from "./Employee";
export * from "./Image";
export * from "./ParentGroup";
export * from "./ParentItem";
export * from "./Publisher";
export * from "./PublisherGroup";
export * from "./Tag";
export * from "./Task";
export * from "./TaskItem";
export * from "./User";
export * from "./codegen/AdminUserCodegen";
export * from "./codegen/LargePublisherCodegen";
export * from "./codegen/SmallPublisherCodegen";
export * from "./codegen/SmallPublisherGroupCodegen";
export * from "./codegen/TaskNewCodegen";
export * from "./codegen/TaskOldCodegen";
export function adminUserScope(arg: Parameters<ScopeFactory<AdminUser>>[0]): ReturnType<ScopeFactory<AdminUser>> {
  return scope<AdminUser>("AdminUser")(arg);
}
export function largePublisherScope(
  arg: Parameters<ScopeFactory<LargePublisher>>[0],
): ReturnType<ScopeFactory<LargePublisher>> {
  return scope<LargePublisher>("LargePublisher")(arg);
}
export function smallPublisherScope(
  arg: Parameters<ScopeFactory<SmallPublisher>>[0],
): ReturnType<ScopeFactory<SmallPublisher>> {
  return scope<SmallPublisher>("SmallPublisher")(arg);
}
export function smallPublisherGroupScope(
  arg: Parameters<ScopeFactory<SmallPublisherGroup>>[0],
): ReturnType<ScopeFactory<SmallPublisherGroup>> {
  return scope<SmallPublisherGroup>("SmallPublisherGroup")(arg);
}
export function taskNewScope(arg: Parameters<ScopeFactory<TaskNew>>[0]): ReturnType<ScopeFactory<TaskNew>> {
  return scope<TaskNew>("TaskNew")(arg);
}
export function taskOldScope(arg: Parameters<ScopeFactory<TaskOld>>[0]): ReturnType<ScopeFactory<TaskOld>> {
  return scope<TaskOld>("TaskOld")(arg);
}
export * from "./AdminUser";
export * from "./LargePublisher";
export * from "./SmallPublisher";
export * from "./SmallPublisherGroup";
export * from "./TaskNew";
export * from "./TaskOld";
export * from "./factories/newAdminUser";
export * from "./factories/newAuthor";
export * from "./factories/newAuthorSchedule";
export * from "./factories/newAuthorStat";
export * from "./factories/newBook";
export * from "./factories/newBookAdvance";
export * from "./factories/newBookReview";
export * from "./factories/newChild";
export * from "./factories/newChildGroup";
export * from "./factories/newChildItem";
export * from "./factories/newComment";
export * from "./factories/newCritic";
export * from "./factories/newCriticColumn";
export * from "./factories/newEmployee";
export * from "./factories/newImage";
export * from "./factories/newLargePublisher";
export * from "./factories/newParentGroup";
export * from "./factories/newParentItem";
export * from "./factories/newPublisher";
export * from "./factories/newPublisherGroup";
export * from "./factories/newSmallPublisher";
export * from "./factories/newSmallPublisherGroup";
export * from "./factories/newTag";
export * from "./factories/newTask";
export * from "./factories/newTaskItem";
export * from "./factories/newUser";
export * from "./factories/newTaskNew";
export * from "./factories/newTaskOld";
export * from "./codegen/metadata";
