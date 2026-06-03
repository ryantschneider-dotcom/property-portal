import test from "node:test";
import assert from "node:assert/strict";
import {
  createListingTask,
  getTasksForProject,
  moveListingTask,
  type ListingTaskRecord,
} from "../src/lib/listing-tasks-data";

test("listing task helpers create, filter, and move persistent task records", () => {
  const task = createListingTask({
    projectId: "listing-1",
    title: "Order updated aerial map",
    description: "Needed before final OM draft.",
    owner: "Hermes",
    priority: "High",
  });

  const other: ListingTaskRecord = { ...task, id: "other", projectId: "listing-2" };
  assert.equal(task.status, "todo");
  assert.equal(task.priority, "High");
  assert.equal(getTasksForProject([task, other], "listing-1").length, 1);

  const moved = moveListingTask(task, "done");
  assert.equal(moved.status, "done");
  assert.match(moved.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});
