import { EnumMetadata } from "joist-orm";

export enum TaskType {
  Old = "OLD",
  New = "NEW",
}

export type TaskTypeDetails = { id: number; code: TaskType; name: string };

const details: Record<TaskType, TaskTypeDetails> = {
  [TaskType.Old]: { id: 1, code: TaskType.Old, name: "Old" },
  [TaskType.New]: { id: 2, code: TaskType.New, name: "New" },
};

export const TaskTypeDetails = { Old: details[TaskType.Old], New: details[TaskType.New] };

export const TaskTypes: EnumMetadata<TaskType, TaskTypeDetails, number> = {
  name: "TaskType",

  getByCode(code: TaskType): TaskTypeDetails {
    return details[code];
  },

  findByCode(code: string): TaskTypeDetails | undefined {
    return details[code as TaskType];
  },

  findById(id: number): TaskTypeDetails | undefined {
    return Object.values(details).find((d) => d.id === id);
  },

  getValues(): ReadonlyArray<TaskType> {
    return Object.values(TaskType);
  },

  getDetails(): ReadonlyArray<TaskTypeDetails> {
    return Object.values(details);
  },
};
