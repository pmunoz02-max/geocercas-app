import test from "node:test";
import assert from "node:assert/strict";

import {
  isActiveAssignment,
  normalizeAssignmentStatus,
} from "../server/api-lib/assignment-eligibility.js";

const fixedNow = new Date("2024-02-15T12:00:00.000Z");

test("null row is inactive", () => {
  assert.equal(isActiveAssignment(null, fixedNow), false);
});

test("deleted row is inactive", () => {
  assert.equal(
    isActiveAssignment({ is_deleted: true, status: "active" }, fixedNow),
    false,
  );
});

test("accepted statuses remain active when in range", () => {
  for (const status of ["active", "activa", "activo", "enabled", "vigente"]) {
    assert.equal(
      isActiveAssignment({ status }, fixedNow),
      true,
      `status ${status} should be active`,
    );
  }
});

test("rejected and empty statuses keep current behavior", () => {
  assert.equal(isActiveAssignment({ status: "pending" }, fixedNow), false);
  assert.equal(isActiveAssignment({ status: "" }, fixedNow), true);
  assert.equal(isActiveAssignment({ estado: "active" }, fixedNow), true);
  assert.equal(isActiveAssignment({ estado: "cancelled" }, fixedNow), false);
});

test("status takes precedence over estado", () => {
  assert.equal(
    isActiveAssignment({ status: "active", estado: "cancelled" }, fixedNow),
    true,
  );
  assert.equal(
    isActiveAssignment({ status: "cancelled", estado: "active" }, fixedNow),
    false,
  );
});

test("future start time and past end time reject the assignment", () => {
  assert.equal(
    isActiveAssignment(
      { status: "active", start_time: "2024-02-15T12:00:01.000Z" },
      fixedNow,
    ),
    false,
  );

  assert.equal(
    isActiveAssignment(
      { status: "active", end_time: "2024-02-15T11:59:59.999Z" },
      fixedNow,
    ),
    false,
  );
});

test("timestamp boundaries are inclusive", () => {
  assert.equal(
    isActiveAssignment(
      { status: "active", start_time: "2024-02-15T12:00:00.000Z" },
      fixedNow,
    ),
    true,
  );

  assert.equal(
    isActiveAssignment(
      { status: "active", end_time: "2024-02-15T12:00:00.000Z" },
      fixedNow,
    ),
    true,
  );
});

test("date boundaries are inclusive in UTC", () => {
  assert.equal(
    isActiveAssignment({ status: "active", start_date: "2024-02-15" }, fixedNow),
    true,
  );

  assert.equal(
    isActiveAssignment({ status: "active", end_date: "2024-02-15" }, fixedNow),
    true,
  );

  assert.equal(
    isActiveAssignment({ status: "active", start_date: "2024-02-16" }, fixedNow),
    false,
  );

  assert.equal(
    isActiveAssignment({ status: "active", end_date: "2024-02-14" }, fixedNow),
    false,
  );
});

test("invalid timestamps are ignored and do not reject the row", () => {
  assert.equal(
    isActiveAssignment(
      {
        status: "active",
        start_time: "not-a-date",
        end_time: "still-not-a-date",
      },
      fixedNow,
    ),
    true,
  );
});

test("normalizeAssignmentStatus trims and lowercases values", () => {
  assert.equal(normalizeAssignmentStatus(" ACTIVE "), "active");
  assert.equal(normalizeAssignmentStatus(null), "");
});
