import { expect, test, type Page } from "@playwright/test";
import { createConfirmedTestAccount } from "../../support/cognitoAdmin";
import { freshTestAccount } from "../../support/testAccount";

// A second, parameterized run of a small number of scenarios that already pass under the default
// format, this time under an account deliberately set to British + AM/PM.
//
// Why not just flip the shared demo user instead? That would turn the *entire* existing suite into
// non-default coverage for free, but only by rewriting every hardcoded date/time assertion across
// dozens of files to compute its expectation from a configured format - real migration work, and
// it would leave the project's actual default as the one path the main test account never
// exercises. Three scenarios re-run deliberately buy most of the confidence for a fraction of it.
//
// One scenario is taken from each of the three views that render a date or a time differently:
// Meeting Details (both a date row and a time row), Person Calendar (a time-only range), and Room
// Availability (a time-only range inside a tooltip). Between them they cover every call site of
// formatLocalDate and formatLocalTime in the app.
//
// Expectations are *computed* from the format rather than hardcoded, which is the whole point: a
// literal would prove only that this file agrees with itself.

const BRITISH_OPTION = "24/08/2026";
const AM_PM_OPTION = "02:30 PM";

/** The same two formatters the app uses, restated here so a bug in one can't hide itself. */
function expectedBritishDate(year: number, month: number, day: number): string {
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

function expectedAmPmTime(hour24: number, minute: number): string {
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const meridiem = hour24 < 12 ? "AM" : "PM";
  return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

async function signInAsNonDefaultAccount(page: Page): Promise<void> {
  const account = freshTestAccount();
  await createConfirmedTestAccount(account);
  await page.goto("/signin");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Sign out")).toBeVisible();

  await page.goto("/settings");
  await page.getByLabel("Date format").click();
  await page.getByRole("option", { name: BRITISH_OPTION, exact: true }).click();
  await page.getByLabel("Time format").click();
  await page.getByRole("option", { name: AM_PM_OPTION, exact: true }).click();
  await page
    .getByRole("heading", { name: "Date and time format" })
    .locator("xpath=ancestor::*[self::div][1]")
    .getByRole("button", { name: "Save" })
    .click();
  await expect(
    page.getByText("Your date and time formats were updated."),
  ).toBeVisible();
}

// Books a meeting through the real form. The account is on AM/PM, so the time field has a
// Meridiem section and takes the 12-hour hour plus an AM/PM keystroke.
async function addAfternoonMeeting(
  page: Page,
  subject: string,
  roomName: string,
): Promise<void> {
  await page.goto("/meetings/add");
  await expect(
    page.getByRole("heading", { name: "Add Meeting" }),
  ).toBeVisible();
  await page.getByLabel("Subject").fill(subject);
  await page.getByRole("combobox", { name: "Room" }).click();
  await page.getByRole("option", { name: roomName, exact: false }).click();
  await typeAmPmTime(page, "Start time", 14, 30);
  await typeAmPmTime(page, "End time", 15, 30);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/);
}

async function typeAmPmTime(
  page: Page,
  groupName: string,
  hour24: number,
  minute: number,
): Promise<void> {
  const group = page.getByRole("group", { name: groupName });
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  await group.getByRole("spinbutton", { name: "Hours" }).click();
  await page.keyboard.type(
    `${String(hour12).padStart(2, "0")}${String(minute).padStart(2, "0")}`,
  );
  await page.keyboard.type(hour24 < 12 ? "AM" : "PM");
}

function detailRow(page: Page, label: string) {
  return page
    .getByText(label, { exact: true })
    .locator("xpath=following-sibling::*[1]");
}

test("H.68 under British + AM/PM: Meeting Details renders both rows in the viewer's own format", async ({
  page,
}) => {
  await signInAsNonDefaultAccount(page);
  const subject = `Rerun details ${Date.now()}`;
  await addAfternoonMeeting(page, subject, "Boardroom");

  await page.goto("/");
  await page.getByText(subject, { exact: false }).first().click();
  await expect(page).toHaveURL(/\/meetings\/[^/]+$/);

  const today = new Date();
  await expect(detailRow(page, "Date")).toHaveText(
    expectedBritishDate(
      today.getFullYear(),
      today.getMonth() + 1,
      today.getDate(),
    ),
  );
  await expect(detailRow(page, "Time")).toContainText(expectedAmPmTime(14, 30));
  await expect(detailRow(page, "Time")).toContainText(expectedAmPmTime(15, 30));
});

test("G.59 under British + AM/PM: Person Calendar renders its meeting rows in AM/PM", async ({
  page,
}) => {
  await signInAsNonDefaultAccount(page);
  const subject = `Rerun calendar ${Date.now()}`;
  await addAfternoonMeeting(page, subject, "Boardroom");

  await page.getByRole("link", { name: "Calendar", exact: true }).click();
  await expect(page).toHaveURL(/\/persons\/[^/]+\/calendar$/);

  const row = page.getByText(subject, { exact: false }).first();
  await expect(row).toContainText(expectedAmPmTime(14, 30));
  await expect(row).not.toContainText("14:30");
});

test("E.26 under British + AM/PM: Room Availability renders its meeting tooltip in AM/PM", async ({
  page,
}) => {
  await signInAsNonDefaultAccount(page);
  const subject = `Rerun availability ${Date.now()}`;
  await addAfternoonMeeting(page, subject, "Boardroom");

  // addAfternoonMeeting lands on the availability page for the meeting's own day.
  const block = page.getByRole("link", { name: new RegExp(subject) });
  await expect(block).toHaveAttribute(
    "aria-label",
    new RegExp(expectedAmPmTime(14, 30)),
  );
});
